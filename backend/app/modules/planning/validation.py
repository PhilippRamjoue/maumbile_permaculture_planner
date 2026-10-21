"""Pure validation for feature geometry and typed properties. No DB, no FastAPI."""

from __future__ import annotations

from typing import Any

from shapely.errors import ShapelyError
from shapely.geometry import LineString, Polygon, shape
from shapely.geometry.base import BaseGeometry
from shapely.validation import explain_validity

FEATURE_TYPES = ("zone", "sector", "element", "path", "annotation")
ALLOWED_GEOMETRY = ("Point", "LineString", "Polygon")

ZONE_NUMBERS = range(0, 6)  # permaculture zones 0-5
SECTOR_KINDS = ("sun", "wind", "fire", "view", "water", "wildlife", "noise")

# feature_type -> geometry types it may use (absent = any of point/line/polygon).
_GEOMETRY_FOR_TYPE: dict[str, tuple[str, ...]] = {
    "zone": ("Polygon",),
    "sector": ("Polygon",),
    "path": ("LineString",),
}


class FeatureValidationError(ValueError):
    """A feature's geometry or properties are not acceptable."""


def parse_geometry(geometry: dict[str, Any]) -> BaseGeometry:
    """Validate a GeoJSON geometry (2D Point/LineString/Polygon in WGS84) and return a shape."""
    gtype = geometry.get("type")
    if gtype not in ALLOWED_GEOMETRY:
        raise FeatureValidationError(
            f"Unsupported geometry type {gtype!r}; expected Point, LineString or Polygon."
        )
    try:
        geom = shape(geometry)
    except (ShapelyError, ValueError, TypeError, IndexError, KeyError, AttributeError) as exc:
        raise FeatureValidationError(f"Malformed {gtype} geometry: {exc}") from exc
    if geom.is_empty:
        raise FeatureValidationError("Geometry is empty.")
    if geom.has_z:
        raise FeatureValidationError("Only 2D [lng, lat] coordinates are supported.")
    min_x, min_y, max_x, max_y = geom.bounds
    if min_x < -180.0 or max_x > 180.0 or min_y < -90.0 or max_y > 90.0:
        raise FeatureValidationError("Coordinates out of range (expected [lng, lat] in WGS84).")
    if isinstance(geom, LineString) and len(set(geom.coords)) < 2:
        raise FeatureValidationError("A LineString needs at least 2 distinct points.")
    if isinstance(geom, Polygon) and not geom.is_valid:
        raise FeatureValidationError(f"Invalid polygon: {explain_validity(geom)}.")
    return geom


def _check_bearing(properties: dict[str, Any], name: str) -> None:
    value = properties.get(name)
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise FeatureValidationError(f"sector requires properties.{name}, a number of degrees.")
    if not 0 <= value < 360:
        raise FeatureValidationError(f"sector properties.{name} must be in [0, 360).")


def validate_properties(feature_type: str, properties: dict[str, Any]) -> None:
    """Zones need ``zone_number``; sectors need ``sector_kind`` and two bearings."""
    if feature_type == "zone":
        n = properties.get("zone_number")
        if isinstance(n, bool) or not isinstance(n, int) or n not in ZONE_NUMBERS:
            raise FeatureValidationError("zone requires properties.zone_number, an integer 0-5.")
    elif feature_type == "sector":
        if properties.get("sector_kind") not in SECTOR_KINDS:
            raise FeatureValidationError(
                f"sector requires properties.sector_kind, one of {', '.join(SECTOR_KINDS)}."
            )
        _check_bearing(properties, "bearing_from")
        _check_bearing(properties, "bearing_to")


def validate_feature(feature_type: str, geometry: BaseGeometry, properties: dict[str, Any]) -> None:
    """Cross-field rules: known type, geometry fits the type, typed properties."""
    if feature_type not in FEATURE_TYPES:
        raise FeatureValidationError(
            f"Unknown feature_type {feature_type!r}; expected one of {', '.join(FEATURE_TYPES)}."
        )
    allowed = _GEOMETRY_FOR_TYPE.get(feature_type)
    if allowed and geometry.geom_type not in allowed:
        raise FeatureValidationError(
            f"A {feature_type} must be a {' or '.join(allowed)}, not {geometry.geom_type}."
        )
    validate_properties(feature_type, properties)
