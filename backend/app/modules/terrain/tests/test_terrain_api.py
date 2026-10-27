"""Terrain endpoints against a real PostGIS container (needs Docker); the DEM is stubbed."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.geo import BBox
from app.modules.terrain.providers import DemFetchError, DemUnavailableError
from app.modules.terrain.service import terrain_input_key
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
                "(id, site_id, status, contour_interval_m, created_at, updated_at, "
                "input_key, job_id) "
                "VALUES (:id, :site, :status, 5, :ts, :ts, :key, :job)"
            ),
            {
                "id": uuid.uuid4(),
                "site": uuid.UUID(site),
                "status": status,
                "ts": stamp,
                "key": terrain_input_key(BBox(36.8, -1.3, 36.81, -1.29), "KE"),
                "job": uuid.uuid4(),
            },
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
    assert (await api.get(f"/api/v1/sites/{site}/terrain")).json()["status"] == "interrupted"

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


async def test_boundary_edit_hides_old_terrain_and_recomputes(
    api: AsyncClient, dem: StubElevationProvider
) -> None:
    site = await make_site(api)
    await post_terrain(api, site)
    moved = [[lng + 0.1, lat] for lng, lat in KENYA]
    response = await api.patch(
        f"/api/v1/sites/{site}", json={"coordinates": moved, "country_code": "KE"}
    )
    assert response.status_code == 200
    stale = (await api.get(f"/api/v1/sites/{site}/terrain")).json()
    assert stale["status"] == "not_requested" and stale["contours"] is None
    assert (await post_terrain(api, site)).status_code == 202
    result = (await api.get(f"/api/v1/sites/{site}/terrain")).json()
    assert result["status"] == "ready"
    assert len(dem.calls) == 2
    assert result["slope_grid"]["west"] > 36.89


async def test_large_extent_is_rejected_without_fetching_dem(
    api: AsyncClient, dem: StubElevationProvider
) -> None:
    site = await make_site(api, [[36, -2], [37, -2], [37, -1], [36, -1]])
    response = await post_terrain(api, site)
    assert response.status_code == 422
    assert "too large" in response.json()["title"]
    assert dem.calls == []


async def test_superseded_job_cannot_publish_or_fail_replacement(
    api: AsyncClient, engine: AsyncEngine
) -> None:
    from shapely.geometry import MultiLineString
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.modules.terrain.derive import ContourLevel, DerivedTerrain
    from app.modules.terrain.repository import TerrainRepository

    site = await make_site(api)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(UTC)
    async with factory() as session:
        repo = TerrainRepository(session)
        await repo.insert_pending(uuid.UUID(site), input_key="old", interval_m=5, now=now)
        row = await repo.get_for_site(uuid.UUID(site))
        assert row is not None and row.job_id is not None
        terrain_id, old_job = row.id, row.job_id
        assert await repo.mark_running(terrain_id, old_job, now=now)
        assert not await repo.mark_running(terrain_id, old_job, now=now)
        assert await repo.reset_to_pending(row, input_key="new", interval_m=10, now=now)
        current = await repo.get_for_site(uuid.UUID(site))
        assert current is not None and current.job_id is not None
        new_job = current.job_id
        assert new_job != old_job
        assert await repo.mark_running(terrain_id, new_job, now=now)
        # A late completion/failure from the old attempt must leave the new attempt alone.
        derived = DerivedTerrain(
            [ContourLevel(100, MultiLineString([[(36.8, -1.3), (36.81, -1.29)]]))],
            {"generation": "old"},
            {},
        )
        await repo.save_ready(
            terrain_id,
            derived,
            job_id=old_job,
            dem_source="test",
            attribution="test",
            resolution_m=30,
            now=now,
        )
        await repo.mark_failed(terrain_id, old_job, "old error", now=now)
        current = await repo.get_for_site(uuid.UUID(site))
        assert current is not None
        assert current.status == "running" and current.job_id == new_job
        assert current.slope_summary is None
        assert await repo.contours(terrain_id) == []
        await repo.save_ready(
            terrain_id,
            DerivedTerrain([], {"generation": "new"}, {}),
            job_id=new_job,
            dem_source="test",
            attribution="test",
            resolution_m=30,
            now=now,
        )
        current = await repo.get_for_site(uuid.UUID(site))
        assert current is not None and current.status == "ready"
        assert current.slope_summary == {"generation": "new"}


async def test_legacy_terrain_without_input_key_is_lazily_recomputed(
    api: AsyncClient, engine: AsyncEngine, dem: StubElevationProvider
) -> None:
    site = await make_site(api)
    await post_terrain(api, site)
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "UPDATE terrain_results SET input_key = NULL, job_id = NULL WHERE site_id = :site"
            ),
            {"site": uuid.UUID(site)},
        )
    assert (await api.get(f"/api/v1/sites/{site}/terrain")).json()["status"] == "not_requested"
    assert (await post_terrain(api, site)).status_code == 202
    assert (await api.get(f"/api/v1/sites/{site}/terrain")).json()["status"] == "ready"
    assert len(dem.calls) == 2
