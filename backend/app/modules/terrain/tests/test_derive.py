"""Pure slope/contour math on synthetic DEMs (no DB, no network)."""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.core.geo import BBox
from app.modules.terrain.derive import (
    SLOPE_CLASSES,
    classify_slope,
    compute_slope_pct,
    contour_levels,
    derive_terrain,
    meters_per_degree,
)
from app.modules.terrain.providers import DemRaster, DemUnavailableError
from app.modules.terrain.tests.stubs import synthetic_dem

SITE = BBox(36.800, -1.300, 36.810, -1.290)


def test_meters_per_degree_matches_known_values() -> None:
    lon_m, lat_m = meters_per_degree(0.0)
    assert lon_m == pytest.approx(111_320, rel=1e-3)
    assert lat_m == pytest.approx(110_574, rel=1e-3)
    assert meters_per_degree(60.0)[0] == pytest.approx(55_800, rel=2e-3)


@pytest.mark.parametrize(
    ("grade_north", "grade_east"), [(0.10, 0.0), (0.0, 0.10), (0.06, 0.08), (0.25, 0.0)]
)
def test_slope_of_a_tilted_plane_matches_its_grade(grade_north: float, grade_east: float) -> None:
    dem = synthetic_dem(SITE, grade_north=grade_north, grade_east=grade_east)
    slope = compute_slope_pct(dem)
    expected = math.hypot(grade_north, grade_east) * 100
    assert np.allclose(slope[1:-1, 1:-1], expected, rtol=0.01)  # interior: exact Horn
    assert slope.shape == dem.elevation.shape


def test_sloped_site_gives_contours_every_interval_and_a_legend() -> None:
    result = derive_terrain(synthetic_dem(SITE, grade_north=0.10), SITE, interval_m=5.0)

    assert result.contours, "a 10 % slope over ~1.2 km must have contour lines"
    elevations = [c.elevation_m for c in result.contours]
    assert all(e % 5 == 0 for e in elevations)
    assert elevations == sorted(elevations)
    # ~110 m of relief at 5 m spacing
    assert 15 <= len(elevations) <= 25
    for level in result.contours:
        assert level.geometry.geom_type == "MultiLineString"
        minx, miny, maxx, maxy = level.geometry.bounds
        assert SITE.min_lon <= minx and maxx <= SITE.max_lon  # clipped to the site
        assert SITE.min_lat <= miny and maxy <= SITE.max_lat
        # a northward tilt gives east-west running contours
        assert (maxx - minx) > 10 * (maxy - miny)

    summary = result.summary
    assert summary["slope_pct"]["mean"] == pytest.approx(10.0, abs=0.5)
    assert summary["slope_deg"]["mean"] == pytest.approx(math.degrees(math.atan(0.10)), abs=0.3)
    assert summary["elevation_m"]["relief"] == pytest.approx(110, abs=15)
    legend = summary["legend"]
    assert [c["label"] for c in legend] == [c["label"] for c in SLOPE_CLASSES]
    assert sum(c["area_fraction"] for c in legend) == pytest.approx(1.0, abs=1e-3)
    assert result.flags == []
    assert summary["contour_count"] == len(result.contours)

    grid = result.slope_grid
    assert grid["height"] == len(grid["classes"])
    assert grid["width"] == len(grid["classes"][0])


def test_flat_site_is_flagged_and_has_no_contours() -> None:
    result = derive_terrain(synthetic_dem(SITE, base_m=1523.4), SITE, interval_m=5.0)

    assert result.contours == []
    assert "flat" in result.flags
    assert "no_contours" in result.flags
    assert result.summary["slope_pct"]["max"] == 0.0
    assert result.summary["legend"][0]["area_fraction"] == 1.0


def test_ocean_elevation_zero_is_flagged_not_contoured() -> None:
    result = derive_terrain(synthetic_dem(SITE, base_m=0.0), SITE, interval_m=5.0)

    assert result.contours == []
    assert "ocean" in result.flags
    assert "flat" not in result.flags


def test_all_nodata_is_unavailable() -> None:
    dem = synthetic_dem(SITE, grade_north=0.1)
    empty = DemRaster(
        np.full_like(dem.elevation, np.nan),
        dem.west,
        dem.north,
        dem.pixel_width_deg,
        dem.pixel_height_deg,
    )
    with pytest.raises(DemUnavailableError):
        derive_terrain(empty, SITE, interval_m=5.0)


def test_nodata_gap_inside_the_site_is_tolerated() -> None:
    dem = synthetic_dem(SITE, grade_north=0.10)
    holed = dem.elevation.copy()
    holed[10:14, 10:14] = np.nan  # a void in the middle
    patched = DemRaster(holed, dem.west, dem.north, dem.pixel_width_deg, dem.pixel_height_deg)

    result = derive_terrain(patched, SITE, interval_m=5.0)

    assert "partial_nodata" in result.flags
    assert result.contours  # still contoured around the void
    assert result.summary["valid_fraction"] < 1.0
    unknown = sum(v is None for row in result.slope_grid["classes"] for v in row)
    assert unknown > 0


def test_site_inside_a_single_cell_still_derives() -> None:
    tiny = BBox(36.8000, -1.3000, 36.8001, -1.2999)  # ~10 m, smaller than a 30 m cell
    dem = synthetic_dem(BBox(36.797, -1.303, 36.803, -1.297), grade_north=0.1)
    result = derive_terrain(dem, tiny, interval_m=5.0)

    assert result.slope_grid["width"] >= 1 and result.slope_grid["height"] >= 1
    assert result.summary["slope_pct"]["mean"] == pytest.approx(10.0, abs=1.0)


def test_slope_classes_cover_the_percent_range() -> None:
    values = np.array([0.0, 1.9, 2.0, 4.9, 9.99, 10.0, 25.0, 30.0, 400.0, np.nan])
    assert classify_slope(values).tolist() == [0, 0, 1, 1, 2, 3, 4, 5, 5, -1]


def test_contour_levels_are_multiples_and_bounded() -> None:
    assert contour_levels(1501.2, 1519.9, 5.0) == [1505.0, 1510.0, 1515.0]
    assert contour_levels(1501.0, 1504.0, 5.0) == []
    with pytest.raises(ValueError):
        contour_levels(0.0, 10_000.0, 1.0)
