from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.main import app
from app.modules.regions.catalog import BUILTIN_PROVIDERS, builtin_registry
from app.modules.regions.deps import get_resolver
from app.modules.regions.resolver import RegionResolver
from app.modules.regions.seed import seed_profile_store

BASE = "/api/v1/regions"
NAIROBI_BBOX = "36.80,-1.30,36.82,-1.28"


@pytest.fixture(autouse=True)
def isolated_resolver() -> Iterator[None]:
    """Each test gets a fresh registry/profile store so registrations don't leak."""
    resolver = RegionResolver(builtin_registry(), seed_profile_store())
    app.dependency_overrides[get_resolver] = lambda: resolver
    yield
    app.dependency_overrides.pop(get_resolver, None)


async def test_all_sources_have_license_and_terms_url(client: AsyncClient) -> None:
    resp = await client.get(f"{BASE}/attribution")
    assert resp.status_code == 200
    sources = resp.json()["sources"]
    assert {s["key"] for s in sources} == {p.key for p in BUILTIN_PROVIDERS}
    for source in sources:
        assert source["attribution"]
        assert source["license"]
        assert source["terms_url"].startswith("https://")
        assert isinstance(source["cacheable"], bool)


async def test_country_without_bbox_lists_whole_chain(client: AsyncClient) -> None:
    resp = await client.get(f"{BASE}/attribution", params={"country": "ke"})
    keys = [s["key"] for s in resp.json()["sources"]]
    assert keys == [
        "esri_world_imagery",
        "osm_standard",
        "sentinel2_cloudless",
        "copernicus_dem_glo30",
    ]


async def test_country_with_bbox_lists_resolved_sources(client: AsyncClient) -> None:
    resp = await client.get(f"{BASE}/attribution", params={"country": "KE", "bbox": NAIROBI_BBOX})
    keys = [s["key"] for s in resp.json()["sources"]]
    assert keys == ["esri_world_imagery", "copernicus_dem_glo30"]


async def test_unknown_country_uses_global_profile(client: AsyncClient) -> None:
    resp = await client.get(f"{BASE}/attribution", params={"country": "ZZ", "bbox": NAIROBI_BBOX})
    keys = [s["key"] for s in resp.json()["sources"]]
    assert keys == ["sentinel2_cloudless", "copernicus_dem_glo30"]


async def test_filter_by_keys(client: AsyncClient) -> None:
    resp = await client.get(
        f"{BASE}/attribution", params={"keys": "copernicus_dem_glo30,esri_world_imagery"}
    )
    assert [s["key"] for s in resp.json()["sources"]] == [
        "copernicus_dem_glo30",
        "esri_world_imagery",
    ]


async def test_unknown_key_is_404(client: AsyncClient) -> None:
    resp = await client.get(f"{BASE}/attribution", params={"keys": "nope"})
    assert resp.status_code == 404


@pytest.mark.parametrize(
    "params",
    [
        {"country": "KE", "bbox": "1,2,3"},
        {"country": "KE", "bbox": "5,0,1,1"},
        {"country": "KENYA"},
        {"bbox": NAIROBI_BBOX},
    ],
)
async def test_invalid_input_is_422(client: AsyncClient, params: dict[str, str]) -> None:
    resp = await client.get(f"{BASE}/attribution", params=params)
    assert resp.status_code == 422


async def test_region_profile_endpoint(client: AsyncClient) -> None:
    ke = (await client.get(f"{BASE}/ke/profile")).json()
    assert ke["country_code"] == "KE"
    assert ke["providers"]["imagery"] == [
        "esri_world_imagery",
        "osm_standard",
        "sentinel2_cloudless",
    ]
    assert ke["map"]["zoom"] == 6
    fallback = (await client.get(f"{BASE}/ZZ/profile")).json()
    assert fallback["country_code"] == "*"


def test_catalog_matches_data_sources_doc() -> None:
    """Every built-in provider's key and terms URL is documented in docs/DATA_SOURCES.md."""
    doc_path = Path(__file__).resolve().parents[3] / "docs" / "DATA_SOURCES.md"
    if not doc_path.exists():
        pytest.skip("docs/ not available (e.g. inside the backend image)")
    doc = doc_path.read_text(encoding="utf-8")
    for provider in BUILTIN_PROVIDERS:
        assert f"`{provider.key}`" in doc, provider.key
        assert provider.terms_url in doc, provider.key
