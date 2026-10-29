"""Integration tests for the imagery endpoints against a real PostGIS container (needs Docker)."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine

from app.modules.imagery.models import ImageryTile
from app.modules.imagery.tests.conftest import Upstreams
from app.modules.imagery.tests.stubs import JPEG_TILE

pytestmark = pytest.mark.integration

KENYA = [[36.800, -1.300], [36.810, -1.300], [36.810, -1.290], [36.800, -1.290]]
BERLIN = [[13.400, 52.500], [13.410, 52.500], [13.410, 52.510], [13.400, 52.510]]


async def make_site(api: AsyncClient, country: str, corners: list[list[float]]) -> str:
    resp = await api.post(
        "/api/v1/sites",
        json={"name": f"{country} plot", "country_code": country, "coordinates": corners},
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def cached_rows(engine: AsyncEngine) -> int:
    async with engine.connect() as conn:
        return int((await conn.execute(select(func.count()).select_from(ImageryTile))).scalar_one())


async def test_kenyan_site_tile_via_esri_is_not_cached(
    api: AsyncClient, upstreams: Upstreams, engine: AsyncEngine
) -> None:
    site = await make_site(api, "KE", KENYA)
    before = await cached_rows(engine)

    for _ in range(2):
        resp = await api.get(f"/api/v1/sites/{site}/imagery/12/2380/2060.png")
        assert resp.status_code == 200, resp.text
        assert resp.content == JPEG_TILE
        assert resp.headers["content-type"] == "image/jpeg"  # real type, despite the .png URL
        assert resp.headers["x-imagery-provider"] == "esri_world_imagery"
        assert resp.headers["x-tile-cache"] == "BYPASS"

    assert len(upstreams.esri.requests) == 2  # fetched every time
    assert len(upstreams.eox.requests) == 0
    assert await cached_rows(engine) == before  # nothing stored


async def test_sentinel2_tile_is_cached_on_second_request(
    api: AsyncClient, upstreams: Upstreams, engine: AsyncEngine
) -> None:
    site = await make_site(api, "DE", BERLIN)  # no DE profile -> global fallback: sentinel2
    url = f"/api/v1/sites/{site}/imagery/10/550/335.png"

    first = await api.get(url)
    second = await api.get(url)

    assert first.status_code == second.status_code == 200
    assert first.headers["x-imagery-provider"] == "sentinel2_cloudless"
    assert first.headers["x-tile-cache"] == "MISS"
    assert second.headers["x-tile-cache"] == "HIT"
    assert second.content == first.content == JPEG_TILE
    assert len(upstreams.eox.requests) == 1  # second request never left the building
    assert len(upstreams.esri.requests) == 0

    # The cache is per provider, not per site: another site over the same area reuses it.
    other = await make_site(api, "DE", BERLIN)
    shared = await api.get(f"/api/v1/sites/{other}/imagery/10/550/335.png")
    assert shared.headers["x-tile-cache"] == "HIT"
    assert len(upstreams.eox.requests) == 1


async def test_meta_includes_license_and_terms(api: AsyncClient) -> None:
    site = await make_site(api, "KE", KENYA)
    resp = await api.get(f"/api/v1/sites/{site}/imagery/meta")
    assert resp.status_code == 200
    meta: dict[str, Any] = resp.json()
    assert meta["covered"] is True
    assert meta["provider_key"] == "esri_world_imagery"
    assert meta["attribution"].startswith("Source: Esri, Maxar, Earthstar Geographics")
    assert meta["license"]
    assert meta["terms_url"].startswith("https://")
    assert meta["max_zoom"] == 19
    assert meta["cacheable"] is False
    assert meta["tile_url_template"] == f"/api/v1/sites/{site}/imagery/{{z}}/{{x}}/{{y}}.png"

    de = await make_site(api, "DE", BERLIN)
    meta_de = (await api.get(f"/api/v1/sites/{de}/imagery/meta")).json()
    assert meta_de["provider_key"] == "sentinel2_cloudless"
    assert meta_de["license"] == "CC-BY-4.0"
    assert meta_de["max_zoom"] == 13


async def test_tiles_outside_the_provider_range_are_404_without_calling_upstream(
    api: AsyncClient, upstreams: Upstreams
) -> None:
    site = await make_site(api, "KE", KENYA)
    too_deep = await api.get(f"/api/v1/sites/{site}/imagery/20/1/1.png")
    off_grid = await api.get(f"/api/v1/sites/{site}/imagery/3/8/0.png")  # x must be < 2**3
    assert too_deep.status_code == off_grid.status_code == 404
    assert upstreams.esri.requests == []


async def test_missing_upstream_tile_is_404_and_upstream_failure_is_502(
    api: AsyncClient, upstreams: Upstreams
) -> None:
    site = await make_site(api, "KE", KENYA)
    url = f"/api/v1/sites/{site}/imagery/12/2380/2060.png"

    upstreams.esri.status = 404
    assert (await api.get(url)).status_code == 404
    upstreams.esri.status = 503
    assert (await api.get(url)).status_code == 502


async def test_unknown_site_is_404(api: AsyncClient) -> None:
    missing = uuid.uuid4()
    assert (await api.get(f"/api/v1/sites/{missing}/imagery/meta")).status_code == 404
    assert (await api.get(f"/api/v1/sites/{missing}/imagery/5/1/1.png")).status_code == 404


# ── choosing between the satellite sources that cover a site ───────────────────────────────
async def test_providers_lists_every_source_covering_the_site(api: AsyncClient) -> None:
    ke = await make_site(api, "KE", KENYA)
    resp = await api.get(f"/api/v1/sites/{ke}/imagery/providers")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (
        body["default_key"] == "esri_world_imagery"
    )  # what the meta endpoint says without a choice
    assert [p["key"] for p in body["providers"]] == ["esri_world_imagery", "sentinel2_cloudless"]
    esri, sentinel = body["providers"]
    assert esri["max_zoom"] == 19 and sentinel["max_zoom"] == 13
    assert esri["label"] and sentinel["label"] and esri["label"] != sentinel["label"]
    assert esri["attribution"].startswith("Source: Esri")

    # No profile for Germany: only the global source covers it, so there is nothing to choose.
    de = await make_site(api, "DE", BERLIN)
    only = (await api.get(f"/api/v1/sites/{de}/imagery/providers")).json()
    assert only["default_key"] == "sentinel2_cloudless"
    assert [p["key"] for p in only["providers"]] == ["sentinel2_cloudless"]


async def test_meta_for_a_chosen_provider_points_the_tiles_at_it(api: AsyncClient) -> None:
    site = await make_site(api, "KE", KENYA)
    meta = (await api.get(f"/api/v1/sites/{site}/imagery/meta?provider=sentinel2_cloudless")).json()
    assert meta["covered"] is True
    assert meta["provider_key"] == "sentinel2_cloudless"
    assert meta["max_zoom"] == 13
    assert meta["license"] == "CC-BY-4.0"
    assert meta["attribution"].startswith("Sentinel-2 cloudless")
    assert (
        meta["tile_url_template"]
        == f"/api/v1/sites/{site}/imagery/{{z}}/{{x}}/{{y}}.png?provider=sentinel2_cloudless"
    )

    # Choosing the default is allowed too; without a choice nothing changes.
    default = (await api.get(f"/api/v1/sites/{site}/imagery/meta")).json()
    assert default["provider_key"] == "esri_world_imagery"
    assert "provider=" not in default["tile_url_template"]


async def test_tiles_come_from_the_chosen_provider(api: AsyncClient, upstreams: Upstreams) -> None:
    site = await make_site(api, "KE", KENYA)
    base = f"/api/v1/sites/{site}/imagery/12/2380/2060.png"

    chosen = await api.get(f"{base}?provider=sentinel2_cloudless")
    assert chosen.status_code == 200, chosen.text
    assert chosen.headers["x-imagery-provider"] == "sentinel2_cloudless"
    assert len(upstreams.eox.requests) == 1 and upstreams.esri.requests == []

    default = await api.get(base)
    assert default.headers["x-imagery-provider"] == "esri_world_imagery"
    assert len(upstreams.esri.requests) == 1


async def test_a_provider_that_does_not_cover_the_site_is_rejected(
    api: AsyncClient, upstreams: Upstreams
) -> None:
    de = await make_site(api, "DE", BERLIN)  # only sentinel2 covers Germany here
    tile = f"/api/v1/sites/{de}/imagery/10/550/335.png"
    for key in ("esri_world_imagery", "no_such_source"):
        assert (await api.get(f"{tile}?provider={key}")).status_code == 400
        assert (await api.get(f"/api/v1/sites/{de}/imagery/meta?provider={key}")).status_code == 400
    # Nothing was fetched from anywhere on the strength of a bad key.
    assert upstreams.esri.requests == [] and upstreams.eox.requests == []
    # ...and the covering one still works.
    assert (await api.get(f"{tile}?provider=sentinel2_cloudless")).status_code == 200


async def test_providers_of_an_unknown_site_is_404(api: AsyncClient) -> None:
    assert (await api.get(f"/api/v1/sites/{uuid.uuid4()}/imagery/providers")).status_code == 404
