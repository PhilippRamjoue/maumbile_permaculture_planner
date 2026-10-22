from __future__ import annotations

import pytest

from app.core.geo import BBox
from app.modules.terrain.limits import TerrainExtentError, validate_dem_extent
from app.modules.terrain.providers import CopernicusDemAwsProvider
from app.modules.terrain.service import pad_bbox, terrain_input_key


def test_parcel_is_inside_the_budget() -> None:
    validate_dem_extent(pad_bbox(BBox(36.8, -1.3, 36.81, -1.29), 30))


@pytest.mark.parametrize(
    "bbox",
    [BBox(-170, -50, 170, 70), BBox(36, -2, 37, -1), BBox(0, 0, 0, 1)],
)
def test_large_or_degenerate_extent_is_rejected(bbox: BBox) -> None:
    with pytest.raises(TerrainExtentError):
        validate_dem_extent(bbox)


async def test_provider_rejects_large_extent_before_opening_tiles(monkeypatch: pytest.MonkeyPatch):
    def unexpected_open(*args, **kwargs):
        pytest.fail("Extent must be rejected before rasterio.open")

    monkeypatch.setattr("app.modules.terrain.providers.rasterio.open", unexpected_open)
    with pytest.raises(TerrainExtentError):
        await CopernicusDemAwsProvider().get_dem(BBox(-170, -50, 170, 70))


def test_cache_key_tracks_geographic_inputs() -> None:
    bbox = BBox(36.8, -1.3, 36.81, -1.29)
    assert terrain_input_key(bbox, "KE") == terrain_input_key(bbox, "KE")
    assert terrain_input_key(bbox, "KE") != terrain_input_key(bbox, "TZ")
    assert terrain_input_key(bbox, "KE") != terrain_input_key(BBox(37, -1.3, 37.01, -1.29), "KE")
