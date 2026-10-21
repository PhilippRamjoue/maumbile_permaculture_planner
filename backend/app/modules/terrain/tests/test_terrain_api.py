"""Terrain endpoints against a real PostGIS container (needs Docker); the DEM is stubbed."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.modules.terrain.providers import DemFetchError, DemUnavailableError
from app.modules.terrain.tests.conftest import Identity
from app.modules.terrain.tests.stubs import StubElevationProvider

pytestmark = pytest.mark.integration

KENYA = [[36.800, -1.300], [36.810, -1.300], [36.810, -1.290], [36.800, -1.290]]


async def make_site(api: AsyncClient, corners: list[list[float]] = KENYA) -> str:
    resp = await api.post(
        "/api/v1/sites", json={"name": "plot", "country_code": "KE", "coordinates": corners}
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def post_terrain(api: AsyncClient, site: str, **body: Any) -> Any:
    return await api.post(f"/api/v1/sites/{site}/terrain", json=body or None)


async def test_get_before_any_request_says_not_requested(api: AsyncClient) -> None:
    site = await make_site(api)

    resp = await api.get(f"/api/v1/sites/{site}/terrain")

    assert resp.status_code == 200
    assert resp.json()["status"] == "not_requested"
    assert resp.json()["contours"] is None


async def test_sloped_site_returns_contours_and_slope_legend(
    api: AsyncClient, dem: StubElevationProvider
) -> None:
    site = await make_site(api)

    kicked = await post_terrain(api, site)
    assert kicked.status_code == 202, kicked.text
    assert kicked.json()["status"] in {"pending", "running", "ready"}

    resp = await api.get(f"/api/v1/sites/{site}/terrain")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready", body
    assert body["dem_source"] == "copernicus_dem_glo30"
    assert "Copernicus DEM © ESA" in body["attribution"]
    assert body["resolution_m"] == 30.0
    assert body["contour_interval_m"] == 5.0  # configured default
    assert "not a survey" in body["notice"]

    contours = body["contours"]
    assert contours["type"] == "FeatureCollection"
    assert len(contours["features"]) > 10
    for feature in contours["features"]:
        assert feature["geometry"]["type"] == "MultiLineString"
        assert feature["properties"]["elevation_m"] % 5 == 0
    index = [f for f in contours["features"] if f["properties"]["index"]]
    assert 0 < len(index) < len(contours["features"])
    assert all(f["properties"]["elevation_m"] % 25 == 0 for f in index)

    slope = body["slope"]
    assert slope["slope_pct"]["mean"] == pytest.approx(10.0, abs=0.6)
    assert [c["label"] for c in slope["legend"]][0] == "Flat"
    assert sum(c["area_fraction"] for c in slope["legend"]) == pytest.approx(1.0, abs=1e-3)
    assert slope["flags"] == []
    assert body["slope_grid"]["width"] > 5

    # the DEM window was padded beyond the site so edge cells get neighbours
    (requested,) = dem.calls
    assert requested.min_lon < 36.800 and requested.max_lat > -1.290


async def test_contours_are_stored_as_multilinestring_4326(
    api: AsyncClient, engine: AsyncEngine
) -> None:
    site = await make_site(api)
    await post_terrain(api, site)

    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT GeometryType(c.geom), ST_SRID(c.geom), c.elevation_m "
                    "FROM terrain_contours c JOIN terrain_results r ON r.id = c.terrain_id "
                    "WHERE r.site_id = :site"
                ),
                {"site": uuid.UUID(site)},
            )
        ).all()
    assert len(rows) > 10
    assert {r[0] for r in rows} == {"MULTILINESTRING"}
    assert {r[1] for r in rows} == {4326}


async def test_second_request_serves_the_cached_result(
    api: AsyncClient, dem: StubElevationProvider
) -> None:
    site = await make_site(api)
    first = await post_terrain(api, site)
    assert first.status_code == 202
    before = (await api.get(f"/api/v1/sites/{site}/terrain")).json()
    assert before["status"] == "ready"

    again = await post_terrain(api, site)
    after = (await api.get(f"/api/v1/sites/{site}/terrain")).json()

    assert again.status_code == 200  # nothing queued: already stored
    assert again.json()["status"] == "ready"
    assert len(dem.calls) == 1  # the elevation source was hit exactly once
    assert after["computed_at"] == before["computed_at"]
    assert after["contours"] == before["contours"]


async def test_a_different_interval_rederives(api: AsyncClient, dem: StubElevationProvider) -> None:
    site = await make_site(api)
    await post_terrain(api, site)
    coarse = (await api.get(f"/api/v1/sites/{site}/terrain")).json()

    again = await post_terrain(api, site, contour_interval_m=10.0)
    assert again.status_code == 202
    fine = (await api.get(f"/api/v1/sites/{site}/terrain")).json()

    assert len(dem.calls) == 2
    assert fine["status"] == "ready"
    assert fine["contour_interval_m"] == 10.0
    assert len(fine["contours"]["features"]) < len(coarse["contours"]["features"])
    assert all(f["properties"]["elevation_m"] % 10 == 0 for f in fine["contours"]["features"])

    same = await post_terrain(api, site, contour_interval_m=10.0)  # now cached again
    assert same.status_code == 200
    assert len(dem.calls) == 2


async def test_interval_is_validated(api: AsyncClient) -> None:
    site = await make_site(api)
    for bad in (0.1, 500.0):
        assert (await post_terrain(api, site, contour_interval_m=bad)).status_code == 422


async def test_flat_site_is_ready_with_no_contours(
    api: AsyncClient, dem: StubElevationProvider
) -> None:
    dem.mode = "flat"
    site = await make_site(api)
    await post_terrain(api, site)

    body = (await api.get(f"/api/v1/sites/{site}/terrain")).json()

    assert body["status"] == "ready"
    assert body["contours"]["features"] == []
    assert {"flat", "no_contours"} <= set(body["slope"]["flags"])
    assert body["slope"]["legend"][0]["area_fraction"] == 1.0


async def test_ocean_site_is_ready_and_flagged(
    api: AsyncClient, dem: StubElevationProvider
) -> None:
    dem.mode = "ocean"
    site = await make_site(api)
    await post_terrain(api, site)

    body = (await api.get(f"/api/v1/sites/{site}/terrain")).json()

    assert body["status"] == "ready"
    assert "ocean" in body["slope"]["flags"]
    assert body["contours"]["features"] == []


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (DemUnavailableError("no Copernicus DEM tile exists for this area"), "No elevation data"),
        (DemFetchError("connection reset"), "unreachable"),
        (RuntimeError("boom"), "derivation failed"),
    ],
)
async def test_failures_are_recorded_and_retried(
    api: AsyncClient, dem: StubElevationProvider, error: Exception, expected: str
) -> None:
    site = await make_site(api)
    dem.error = error
    failed_start = await post_terrain(api, site)
    assert failed_start.status_code == 202  # the failure happens in the background

    body = (await api.get(f"/api/v1/sites/{site}/terrain")).json()
    assert body["status"] == "failed"
    assert expected in body["error"]
    assert body["contours"] is None
    assert "boom" not in body["error"]  # internals are not leaked

    dem.error = None  # source recovers: a new POST retries instead of serving the failure
    retried = await post_terrain(api, site)
    assert retried.status_code == 202
    body = (await api.get(f"/api/v1/sites/{site}/terrain")).json()
    assert body["status"] == "ready"
    assert body["error"] is None
    assert len(dem.calls) == 2


async def test_all_nodata_dem_fails_gracefully(
    api: AsyncClient, dem: StubElevationProvider
) -> None:
    dem.mode = "nodata"
    site = await make_site(api)
    await post_terrain(api, site)

    body = (await api.get(f"/api/v1/sites/{site}/terrain")).json()

    assert body["status"] == "failed"
    assert "No elevation data" in body["error"]


async def set_row(engine: AsyncEngine, site: str, status: str, age: timedelta) -> None:
    stamp = datetime.now(UTC) - age
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO terrain_results "
                "(id, site_id, status, contour_interval_m, created_at, updated_at) "
                "VALUES (:id, :site, :status, 5, :ts, :ts)"
            ),
            {"id": uuid.uuid4(), "site": uuid.UUID(site), "status": status, "ts": stamp},
        )


async def test_in_flight_job_is_not_started_twice(
    api: AsyncClient, dem: StubElevationProvider, engine: AsyncEngine
) -> None:
    site = await make_site(api)
    await set_row(engine, site, "running", timedelta(seconds=5))

    resp = await post_terrain(api, site)

    assert resp.status_code == 202
    assert resp.json()["status"] == "running"
    assert dem.calls == []  # the existing job owns it


async def test_a_dead_job_is_requeued(
    api: AsyncClient, dem: StubElevationProvider, engine: AsyncEngine
) -> None:
    site = await make_site(api)
    await set_row(engine, site, "running", timedelta(hours=1))  # process died mid-job

    resp = await post_terrain(api, site)

    assert resp.status_code == 202
    assert (await api.get(f"/api/v1/sites/{site}/terrain")).json()["status"] == "ready"
    assert len(dem.calls) == 1


async def test_other_users_and_missing_sites_are_rejected(
    api: AsyncClient, identity: Identity
) -> None:
    site = await make_site(api)
    identity.owner = uuid.uuid4()  # someone else

    assert (await post_terrain(api, site)).status_code == 403
    assert (await api.get(f"/api/v1/sites/{site}/terrain")).status_code == 403
    missing = uuid.uuid4()
    assert (await post_terrain(api, str(missing))).status_code == 404
    assert (await api.get(f"/api/v1/sites/{missing}/terrain")).status_code == 404
