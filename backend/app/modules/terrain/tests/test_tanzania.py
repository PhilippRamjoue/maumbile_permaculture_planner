"""A Tanzanian site (Arusha region, -3.327131, 36.588198), offline and against real Copernicus data.

The live test reads the real GLO-30 tile from the public AWS bucket, so it is opt-in:

    APP_LIVE_TESTS=1 uv run pytest app/modules/terrain/tests/test_tanzania.py

Windows note: if the repo path has non-ASCII characters (e.g. ``é`` in the user name), GDAL's
HTTPS call dies on the certifi path. Run Python through the 8.3 short path of the venv so
``certifi.where()`` is ASCII, e.g. ``"$(cygpath -d .venv)\Scripts\python.exe" -m pytest ...``.
"""

from __future__ import annotations

import os

import pytest
from httpx import AsyncClient

from app.modules.terrain.providers import CopernicusDemAwsProvider
from app.modules.terrain.tests.stubs import StubElevationProvider

pytestmark = pytest.mark.integration

LAT, LON = -3.327131, 36.588198
HALF = 0.0015  # ~165 m each way: a ~330 m plot around the point
ARUSHA = [
    [LON - HALF, LAT - HALF],
    [LON + HALF, LAT - HALF],
    [LON + HALF, LAT + HALF],
    [LON - HALF, LAT + HALF],
]


async def make_tanzanian_site(api: AsyncClient) -> str:
    resp = await api.post(
        "/api/v1/sites",
        json={"name": "Arusha plot", "country_code": "TZ", "coordinates": ARUSHA},
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def test_tanzanian_site_offline(api: AsyncClient, dem: StubElevationProvider) -> None:
    """TZ resolves the elevation chain to Copernicus and the stubbed DEM yields terrain."""
    site = await make_tanzanian_site(api)

    assert (await api.post(f"/api/v1/sites/{site}/terrain")).status_code == 202
    body = (await api.get(f"/api/v1/sites/{site}/terrain")).json()

    assert body["status"] == "ready", body
    assert body["dem_source"] == "copernicus_dem_glo30"
    assert body["contours"]["features"]
    assert body["slope"]["slope_pct"]["mean"] == pytest.approx(10.0, abs=0.6)
    (requested,) = dem.calls
    assert requested.min_lon < LON - HALF and requested.max_lon > LON + HALF  # padded window


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("APP_LIVE_TESTS"), reason="set APP_LIVE_TESTS=1 (hits AWS)")
class TestLiveCopernicus:
    @pytest.fixture
    def dem(self) -> CopernicusDemAwsProvider:
        return CopernicusDemAwsProvider()

    async def test_real_dem_for_the_tanzanian_site(self, api: AsyncClient) -> None:
        site = await make_tanzanian_site(api)

        kicked = await api.post(f"/api/v1/sites/{site}/terrain")
        assert kicked.status_code == 202, kicked.text
        body = (await api.get(f"/api/v1/sites/{site}/terrain")).json()

        assert body["status"] == "ready", body
        assert body["dem_source"] == "copernicus_dem_glo30"
        assert body["resolution_m"] == 30.0
        elevation = body["slope"]["elevation_m"]
        # Arusha / Mt Meru foothills: well above sea level, never ocean.
        assert 1000 < elevation["min"] <= elevation["max"] < 3000
        assert "ocean" not in body["slope"]["flags"]
        assert body["slope"]["slope_pct"]["max"] > 0
        assert sum(c["area_fraction"] for c in body["slope"]["legend"]) == pytest.approx(
            1.0, abs=1e-3
        )
        print(
            f"\nArusha plot: elevation {elevation}, slope {body['slope']['slope_pct']}, "
            f"{len(body['contours']['features'])} contour levels @ {body['contour_interval_m']} m, "
            f"flags {body['slope']['flags']}"
        )

        # second request is served from the stored result (200, not re-queued)
        assert (await api.post(f"/api/v1/sites/{site}/terrain")).status_code == 200
