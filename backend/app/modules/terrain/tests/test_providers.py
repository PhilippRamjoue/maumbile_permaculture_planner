"""Copernicus adapter against local GeoTIFF tiles laid out like the AWS bucket (no network)."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from app.core.geo import BBox
from app.modules.regions.catalog import COPERNICUS_DEM_GLO30, builtin_registry
from app.modules.terrain.providers import (
    CopernicusDemAwsProvider,
    DemUnavailableError,
    ElevationProvider,
    register_terrain_providers,
    tile_name,
    tiles_for,
)

PIXEL = 0.001  # 1000 x 1000 test tiles instead of 3600 x 3600


def write_tile(
    root: Path,
    lon: int,
    lat: int,
    fn: Callable[[np.ndarray], np.ndarray] | None = None,
    *,
    nodata: float | None = None,
) -> None:
    """Write the 1°x1° tile whose SW corner is (lon, lat); value = 1000 + row + col/100."""
    size = round(1 / PIXEL)
    rows, cols = np.mgrid[0:size, 0:size]
    data = (1000 + 10 * (rows / size * 100) + cols / 100).astype("float32")
    if fn is not None:
        data = fn(data)
    path = root / f"{tile_name(lon, lat)}.tif"
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=size,
        height=size,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=from_origin(lon, lat + 1, PIXEL, PIXEL),
        nodata=nodata,
    ) as dst:
        dst.write(data, 1)


def provider_for(root: Path) -> CopernicusDemAwsProvider:
    return CopernicusDemAwsProvider(tile_uri=str(root / "{name}.tif"), env={})


def test_tile_names_follow_the_bucket_convention() -> None:
    assert tile_name(36, -2) == "Copernicus_DSM_COG_10_S02_00_E036_00_DEM"
    assert tile_name(-5, 1) == "Copernicus_DSM_COG_10_N01_00_W005_00_DEM"
    assert tile_name(0, 0) == "Copernicus_DSM_COG_10_N00_00_E000_00_DEM"


def test_tiles_for_a_bbox_spanning_cells() -> None:
    assert tiles_for(BBox(36.2, -1.3, 36.4, -1.1)) == [tile_name(36, -2)]
    assert tiles_for(BBox(36.9, -1.3, 37.1, -0.9)) == [
        tile_name(36, -2),
        tile_name(37, -2),
        tile_name(36, -1),
        tile_name(37, -1),
    ]
    assert tiles_for(BBox(36.0, -2.0, 37.0, -1.0)) == [tile_name(36, -2)]  # edges add no tile


def test_adapter_satisfies_the_interface_and_keeps_catalog_metadata() -> None:
    provider = CopernicusDemAwsProvider()
    assert isinstance(provider, ElevationProvider)
    assert provider.cacheable is True
    assert "Copernicus DEM © ESA" in provider.attribution
    assert provider.resolution_m == 30.0

    registry = builtin_registry()
    register_terrain_providers(registry)
    registered = registry.get("copernicus_dem_glo30")
    assert isinstance(registered, CopernicusDemAwsProvider)
    for attr in ("key", "category", "attribution", "license", "terms_url", "cacheable"):
        assert getattr(registered, attr) == getattr(COPERNICUS_DEM_GLO30, attr)


def test_default_access_is_anonymous_and_unsigned() -> None:
    provider = CopernicusDemAwsProvider()
    assert provider.DEFAULT_ENV["AWS_NO_SIGN_REQUEST"] == "YES"
    assert provider.DEFAULT_TILE_URI.startswith("/vsis3/copernicus-dem-30m/")


async def test_reads_a_window_inside_one_tile(tmp_path: Path) -> None:
    write_tile(tmp_path, 36, -2)
    bbox = BBox(36.3, -1.7, 36.4, -1.6)

    dem = await provider_for(tmp_path).get_dem(bbox)

    b = dem.bounds
    assert b.min_lon <= bbox.min_lon and b.max_lon >= bbox.max_lon  # covers the request
    assert b.min_lat <= bbox.min_lat and b.max_lat >= bbox.max_lat
    assert b.max_lon - bbox.max_lon < 2 * PIXEL and bbox.min_lon - b.min_lon < 2 * PIXEL
    assert dem.pixel_width_deg == pytest.approx(PIXEL)
    assert dem.elevation.dtype == np.float32
    assert not np.isnan(dem.elevation).any()
    # west -> east rises 0.01 per column; north -> south rises 1.0 per row
    assert dem.elevation[0, 1] - dem.elevation[0, 0] == pytest.approx(0.01, abs=1e-3)
    assert dem.elevation[1, 0] - dem.elevation[0, 0] == pytest.approx(1.0, abs=1e-3)


async def test_mosaics_a_window_across_tiles(tmp_path: Path) -> None:
    write_tile(tmp_path, 36, -2, lambda a: np.full_like(a, 100.0))
    write_tile(tmp_path, 37, -2, lambda a: np.full_like(a, 200.0))
    bbox = BBox(36.995, -1.5, 37.005, -1.49)

    dem = await provider_for(tmp_path).get_dem(bbox)

    assert dem.elevation.shape[1] >= 10
    assert set(np.unique(dem.elevation)) == {100.0, 200.0}
    boundary_col = round((37.0 - dem.west) / PIXEL)
    assert (dem.elevation[:, :boundary_col] == 100.0).all()
    assert (dem.elevation[:, boundary_col:] == 200.0).all()


async def test_missing_tile_is_unavailable(tmp_path: Path) -> None:
    with pytest.raises(DemUnavailableError):
        await provider_for(tmp_path).get_dem(BBox(0.2, 0.2, 0.3, 0.3))  # open ocean: no tile


async def test_one_missing_tile_leaves_a_nan_gap(tmp_path: Path) -> None:
    write_tile(tmp_path, 36, -2, lambda a: np.full_like(a, 100.0))
    bbox = BBox(36.995, -1.5, 37.005, -1.49)  # east half has no tile

    dem = await provider_for(tmp_path).get_dem(bbox)

    boundary_col = round((37.0 - dem.west) / PIXEL)
    assert (dem.elevation[:, :boundary_col] == 100.0).all()
    assert np.isnan(dem.elevation[:, boundary_col:]).all()


async def test_declared_nodata_becomes_nan(tmp_path: Path) -> None:
    def punch(a: np.ndarray) -> np.ndarray:
        a = a.copy()
        a[500:510, 500:510] = -9999.0
        return a

    write_tile(tmp_path, 36, -2, punch, nodata=-9999.0)
    # window over the punched hole: rows 500-509 are lat -1.5..-1.51, cols 500-509 lon 36.5..36.51
    dem = await provider_for(tmp_path).get_dem(BBox(36.49, -1.52, 36.52, -1.49))

    assert np.isnan(dem.elevation).sum() == 100
    assert np.nanmin(dem.elevation) > 0
