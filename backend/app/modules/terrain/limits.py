"""Bound DEM work before opening remote tiles or allocating a raster."""

from __future__ import annotations

import math

from app.core.geo import BBox

MAX_DEM_TILES = 16
MAX_DEM_CELLS = 1_000_000
# Conservative GLO-30 spacing: longitude pixels can be wider at high latitudes.
GLO30_PIXEL_DEG = 1 / 3600


class TerrainExtentError(ValueError):
    """The requested extent exceeds the lean backend's processing budget."""


def validate_dem_extent(
    bbox: BBox, pixel_width: float = GLO30_PIXEL_DEG, pixel_height: float = GLO30_PIXEL_DEG
) -> None:
    values = bbox.as_tuple()
    if not all(math.isfinite(value) for value in values):
        raise TerrainExtentError("Terrain bounds must be finite.")
    width, height = bbox.max_lon - bbox.min_lon, bbox.max_lat - bbox.min_lat
    if width <= 0 or height <= 0:
        raise TerrainExtentError("Terrain bounds must have positive width and height.")
    tiles = (math.ceil(bbox.max_lon) - math.floor(bbox.min_lon)) * (
        math.ceil(bbox.max_lat) - math.floor(bbox.min_lat)
    )
    # Extra cells account for outward snapping to the source grid.
    cells = (math.ceil(width / pixel_width) + 2) * (math.ceil(height / pixel_height) + 2)
    if tiles > MAX_DEM_TILES or cells > MAX_DEM_CELLS:
        raise TerrainExtentError(
            f"Terrain extent is too large (limit: {MAX_DEM_CELLS:,} DEM cells and "
            f"{MAX_DEM_TILES} source tiles). Choose a smaller site."
        )
