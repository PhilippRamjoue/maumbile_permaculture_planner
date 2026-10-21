"""Offline stand-ins for the elevation source: synthetic DEMs, no network."""

from __future__ import annotations

import math

import numpy as np

from app.core.geo import BBox
from app.modules.terrain.derive import meters_per_degree
from app.modules.terrain.providers import (
    CopernicusDemAwsProvider,
    DemRaster,
)

ARC_SECOND = 1 / 3600  # GLO-30 post spacing at the equator


def synthetic_dem(
    bbox: BBox,
    *,
    base_m: float = 1800.0,
    grade_north: float = 0.0,
    grade_east: float = 0.0,
    pixel_deg: float = ARC_SECOND,
) -> DemRaster:
    """A tilted plane over ``bbox``: ``grade_*`` are rise/run (0.10 = 10 % uphill to that side)."""
    cols = max(2, math.ceil((bbox.max_lon - bbox.min_lon) / pixel_deg))
    rows = max(2, math.ceil((bbox.max_lat - bbox.min_lat) / pixel_deg))
    lon_m, lat_m = meters_per_degree((bbox.min_lat + bbox.max_lat) / 2)
    r, c = np.mgrid[0:rows, 0:cols]
    elevation = (
        base_m
        + grade_north * (rows - 1 - r) * pixel_deg * lat_m  # row 0 is the north edge
        + grade_east * c * pixel_deg * lon_m
    ).astype(np.float32)
    return DemRaster(elevation, bbox.min_lon, bbox.min_lat + rows * pixel_deg, pixel_deg, pixel_deg)


class StubElevationProvider:
    """Counts calls and serves a canned DEM (or raises) instead of touching AWS."""

    key = CopernicusDemAwsProvider.key
    category = "elevation"
    attribution = CopernicusDemAwsProvider.attribution
    license = CopernicusDemAwsProvider.license
    terms_url = CopernicusDemAwsProvider.terms_url
    cacheable = True
    resolution_m = 30.0

    def __init__(self) -> None:
        self.calls: list[BBox] = []
        self.mode = "slope"
        self.error: Exception | None = None

    def covers(self, bbox: BBox) -> bool:
        return True

    async def get_dem(self, bbox: BBox) -> DemRaster:
        self.calls.append(bbox)
        if self.error is not None:
            raise self.error
        if self.mode == "flat":
            return synthetic_dem(bbox)
        if self.mode == "ocean":
            return synthetic_dem(bbox, base_m=0.0)
        if self.mode == "nodata":
            dem = synthetic_dem(bbox, grade_north=0.1)
            return DemRaster(
                np.full_like(dem.elevation, np.nan),
                dem.west,
                dem.north,
                dem.pixel_width_deg,
                dem.pixel_height_deg,
            )
        return synthetic_dem(bbox, grade_north=0.10)  # 10 % uphill to the north
