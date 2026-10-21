"""Pure terrain math: slope, slope classes and contour lines from a DEM grid.

No I/O and no database: ``derive_terrain(dem, bbox, interval)`` is a function of its inputs,
which keeps it trivially testable and movable into a worker later. At 30 m over a site bbox the
grids are tens of cells wide, so plain numpy is plenty.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, cast

import numpy as np
from contourpy import contour_generator
from numpy.typing import NDArray
from shapely.geometry import LineString, MultiLineString, box
from shapely.geometry.base import BaseGeometry

from app.core.geo import BBox
from app.modules.terrain.providers import DemRaster, DemUnavailableError

MAX_CONTOUR_LEVELS = 500  # guards against a tiny interval over big relief

# Slope classes in percent grade (rise/run x 100): [lower, upper), colours run green -> red.
# Permaculture rules of thumb: <2 % ponds water, 2-10 % is good for swales and beds, >30 % is
# erosion-prone and unsafe for machinery.
SLOPE_CLASSES: tuple[dict[str, Any], ...] = (
    {"label": "Flat", "min_pct": 0.0, "max_pct": 2.0, "color": "#4caf50"},
    {"label": "Gentle", "min_pct": 2.0, "max_pct": 5.0, "color": "#a5d63f"},
    {"label": "Moderate", "min_pct": 5.0, "max_pct": 10.0, "color": "#ffeb3b"},
    {"label": "Sloping", "min_pct": 10.0, "max_pct": 20.0, "color": "#ffa726"},
    {"label": "Steep", "min_pct": 20.0, "max_pct": 30.0, "color": "#f4511e"},
    {"label": "Very steep", "min_pct": 30.0, "max_pct": None, "color": "#b71c1c"},
)
_CLASS_EDGES = np.array([c["max_pct"] for c in SLOPE_CLASSES[:-1]], dtype=np.float64)

FLAT_MAX_PCT = 2.0  # a site whose steepest cell is under this is reported as "flat"


@dataclass(frozen=True)
class ContourLevel:
    elevation_m: float
    geometry: MultiLineString  # WGS84, clipped to the site bbox


@dataclass(frozen=True)
class DerivedTerrain:
    contours: list[ContourLevel]
    summary: dict[str, Any]  # stats + legend with per-class area share (JSON-safe)
    slope_grid: dict[str, Any]  # class index per cell over the site bbox (JSON-safe)
    flags: list[str] = field(default_factory=list)


def meters_per_degree(lat_deg: float) -> tuple[float, float]:
    """(metres per degree of longitude, of latitude) at a latitude (WGS84 series)."""
    phi = math.radians(lat_deg)
    lat_m = 111_132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    lon_m = 111_412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
    return max(lon_m, 1.0), lat_m


def compute_slope_pct(dem: DemRaster) -> NDArray[np.float64]:
    """Percent grade per cell (Horn's method; edges replicate; NaN where the 3x3 has no-data)."""
    lat = dem.north - dem.rows * dem.pixel_height_deg / 2
    lon_m, lat_m = meters_per_degree(lat)
    dx = dem.pixel_width_deg * lon_m
    dy = dem.pixel_height_deg * lat_m

    z = np.pad(dem.elevation.astype(np.float64), 1, mode="edge")
    a, b, c = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]
    d, f = z[1:-1, :-2], z[1:-1, 2:]
    g, h, i = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
    dz_dx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dx)
    dz_dy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * dy)
    return np.hypot(dz_dx, dz_dy) * 100.0


def classify_slope(slope_pct: NDArray[np.float64]) -> NDArray[np.int8]:
    """Class index into :data:`SLOPE_CLASSES` per cell; -1 where the slope is unknown."""
    classes = np.digitize(np.nan_to_num(slope_pct), _CLASS_EDGES).astype(np.int8)
    classes[np.isnan(slope_pct)] = -1
    return classes


def _site_window(dem: DemRaster, bbox: BBox) -> tuple[slice, slice]:
    """Row/column slices of the cells that overlap ``bbox`` (at least one cell)."""
    col0 = max(0, math.floor((bbox.min_lon - dem.west) / dem.pixel_width_deg))
    col1 = min(dem.cols, math.ceil((bbox.max_lon - dem.west) / dem.pixel_width_deg))
    row0 = max(0, math.floor((dem.north - bbox.max_lat) / dem.pixel_height_deg))
    row1 = min(dem.rows, math.ceil((dem.north - bbox.min_lat) / dem.pixel_height_deg))
    col1 = max(col1, min(col0 + 1, dem.cols))
    row1 = max(row1, min(row0 + 1, dem.rows))
    return slice(row0, row1), slice(col0, col1)


def contour_levels(zmin: float, zmax: float, interval: float) -> list[float]:
    """Multiples of ``interval`` within [zmin, zmax]."""
    first = math.ceil(zmin / interval)
    last = math.floor(zmax / interval)
    if last - first + 1 > MAX_CONTOUR_LEVELS:
        raise ValueError(
            f"contour interval {interval} m would give over {MAX_CONTOUR_LEVELS} lines"
        )
    return [round(k * interval, 6) for k in range(first, last + 1)]


def compute_contours(dem: DemRaster, interval_m: float, clip: BBox) -> list[ContourLevel]:
    """Contour lines at every ``interval_m`` of elevation, clipped to ``clip`` (WGS84)."""
    z = np.ma.masked_invalid(dem.elevation.astype(np.float64))
    if z.count() == 0 or z.min() == z.max():
        return []
    xs = dem.west + (np.arange(dem.cols) + 0.5) * dem.pixel_width_deg
    ys = dem.north - (np.arange(dem.rows) + 0.5) * dem.pixel_height_deg
    generator = contour_generator(xs, ys, z)
    window: BaseGeometry = box(*clip.as_tuple())

    levels: list[ContourLevel] = []
    for level in contour_levels(float(z.min()), float(z.max()), interval_m):
        raw = cast("list[NDArray[np.float64]]", generator.lines(level))
        lines = [LineString(np.round(points, 6)) for points in raw if len(points) >= 2]
        if not lines:
            continue
        clipped = MultiLineString(lines).intersection(window)
        parts = [g for g in getattr(clipped, "geoms", [clipped]) if isinstance(g, LineString)]
        parts = [g for g in parts if not g.is_empty and g.length > 0]
        if parts:
            levels.append(ContourLevel(level, MultiLineString(parts)))
    return levels


def derive_terrain(dem: DemRaster, bbox: BBox, interval_m: float) -> DerivedTerrain:
    """Slope summary/legend, slope-class grid and contours for the site ``bbox``.

    Raises :class:`DemUnavailableError` if the grid has no elevation values at all.
    """
    if not np.isfinite(dem.elevation).any():
        raise DemUnavailableError("the elevation source returned no data for this area")

    slope_pct = compute_slope_pct(dem)
    rows, cols = _site_window(dem, bbox)
    site_elev = dem.elevation[rows, cols]
    site_slope = slope_pct[rows, cols]
    site_classes = classify_slope(site_slope)

    valid_elev = site_elev[np.isfinite(site_elev)]
    valid_slope = site_slope[np.isfinite(site_slope)]
    if valid_elev.size == 0:
        # The padded grid has data but the site itself falls in a gap.
        raise DemUnavailableError("the elevation source has a gap over this site")

    flags: list[str] = []
    ocean = bool(np.all(valid_elev == 0.0))
    if ocean:
        flags.append("ocean")  # sea level / water: nothing to derive
    if valid_elev.size < site_elev.size:
        flags.append("partial_nodata")
    relief = float(valid_elev.max() - valid_elev.min())
    max_pct = float(valid_slope.max()) if valid_slope.size else 0.0
    if not ocean and max_pct < FLAT_MAX_PCT:
        flags.append("flat")

    contours = [] if ocean else compute_contours(dem, interval_m, bbox)
    if not contours:
        flags.append("no_contours")

    known = site_classes[site_classes >= 0]
    legend = [
        {
            **cls,
            "area_fraction": round(float(np.mean(known == idx)), 4) if known.size else 0.0,
        }
        for idx, cls in enumerate(SLOPE_CLASSES)
    ]
    mean_pct = float(valid_slope.mean()) if valid_slope.size else 0.0
    summary: dict[str, Any] = {
        "elevation_m": {
            "min": round(float(valid_elev.min()), 1),
            "max": round(float(valid_elev.max()), 1),
            "mean": round(float(valid_elev.mean()), 1),
            "relief": round(relief, 1),
        },
        "slope_pct": {"mean": round(mean_pct, 1), "max": round(max_pct, 1)},
        "slope_deg": {
            "mean": round(math.degrees(math.atan(mean_pct / 100)), 1),
            "max": round(math.degrees(math.atan(max_pct / 100)), 1),
        },
        "valid_fraction": round(float(valid_elev.size / site_elev.size), 4),
        "contour_count": len(contours),
        "legend": legend,
        "flags": flags,
    }
    slope_grid: dict[str, Any] = {
        "west": dem.west + (cols.start or 0) * dem.pixel_width_deg,
        "north": dem.north - (rows.start or 0) * dem.pixel_height_deg,
        "pixel_width_deg": dem.pixel_width_deg,
        "pixel_height_deg": dem.pixel_height_deg,
        "width": int(site_classes.shape[1]),
        "height": int(site_classes.shape[0]),
        # Row 0 is the northern edge; null = unknown.
        "classes": [[None if v < 0 else int(v) for v in row] for row in site_classes],
    }
    return DerivedTerrain(contours, summary, slope_grid, flags)
