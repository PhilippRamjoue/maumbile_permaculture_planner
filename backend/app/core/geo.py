"""Geospatial helpers shared across modules.

Geometry is stored in WGS84 (EPSG:4326). For accurate metric measurement a feature is
reprojected to its site's local UTM zone (or measured via PostGIS ``geography``); this
module provides the UTM-zone lookup and GeoJSON<->Shapely conversions that underpin that.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry

WGS84_SRID = 4326


@dataclass(frozen=True)
class BBox:
    """A WGS84 bounding box: (min_lon, min_lat, max_lon, max_lat)."""

    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float

    def as_tuple(self) -> tuple[float, float, float, float]:
        return (self.min_lon, self.min_lat, self.max_lon, self.max_lat)


def utm_epsg(lon: float, lat: float) -> int:
    """EPSG code of the UTM zone containing ``(lon, lat)`` in WGS84.

    Northern hemisphere -> 326xx, southern -> 327xx, where xx is the UTM zone (1..60).
    Example: Nairobi (36.82E, 1.29S) -> 32737.
    """
    if not -180.0 <= lon <= 180.0:
        raise ValueError(f"longitude out of range: {lon}")
    if not -90.0 <= lat <= 90.0:
        raise ValueError(f"latitude out of range: {lat}")

    zone = int((lon + 180.0) // 6.0) + 1
    zone = min(max(zone, 1), 60)
    hemisphere_base = 32600 if lat >= 0 else 32700
    return hemisphere_base + zone


def geojson_to_shape(geometry: dict[str, Any]) -> BaseGeometry:
    """Convert a GeoJSON geometry mapping to a Shapely geometry."""
    return shape(geometry)


def shape_to_geojson(geom: BaseGeometry) -> dict[str, Any]:
    """Convert a Shapely geometry to a GeoJSON geometry mapping."""
    return dict(mapping(geom))


def bbox_of(geom: BaseGeometry) -> BBox:
    """Return the WGS84 bounding box of a Shapely geometry."""
    min_lon, min_lat, max_lon, max_lat = geom.bounds
    return BBox(min_lon, min_lat, max_lon, max_lat)
