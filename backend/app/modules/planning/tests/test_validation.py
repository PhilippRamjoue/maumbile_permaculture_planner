"""Unit tests for geometry/property validation and the seed catalog (no database)."""

from __future__ import annotations

from typing import Any

import pytest

from app.modules.planning.seed import ELEMENT_TYPES
from app.modules.planning.validation import (
    FEATURE_TYPES,
    FeatureValidationError,
    parse_geometry,
    validate_feature,
)

POINT = {"type": "Point", "coordinates": [36.8, -1.3]}
LINE = {"type": "LineString", "coordinates": [[36.8, -1.3], [36.81, -1.3]]}
SQUARE = {
    "type": "Polygon",
    "coordinates": [[[36.8, -1.3], [36.81, -1.3], [36.81, -1.29], [36.8, -1.29], [36.8, -1.3]]],
}


@pytest.mark.parametrize("geom", [POINT, LINE, SQUARE])
def test_parse_accepts_point_line_polygon(geom: dict[str, Any]) -> None:
    assert parse_geometry(geom).geom_type == geom["type"]


@pytest.mark.parametrize(
    "geom",
    [
        {"type": "MultiPoint", "coordinates": [[1, 1]]},
        {"type": "Point", "coordinates": [36.8, -1.3, 1500]},  # 3D
        {"type": "Point", "coordinates": [200, 0]},  # lng out of range
        {"type": "Point", "coordinates": [0, 95]},  # lat out of range
        {"type": "LineString", "coordinates": [[1, 1], [1, 1]]},  # degenerate
        {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]},  # bowtie
        {"type": "Point"},  # no coordinates
        {},
    ],
)
def test_parse_rejects_bad_geometry(geom: dict[str, Any]) -> None:
    with pytest.raises(FeatureValidationError):
        parse_geometry(geom)


def test_zone_requires_zone_number_0_to_5() -> None:
    poly = parse_geometry(SQUARE)
    validate_feature("zone", poly, {"zone_number": 0})
    validate_feature("zone", poly, {"zone_number": 5, "name": "Orchard"})
    for bad in (
        {},
        {"zone_number": 6},
        {"zone_number": -1},
        {"zone_number": "1"},
        {"zone_number": 1.5},
        {"zone_number": True},
    ):
        with pytest.raises(FeatureValidationError):
            validate_feature("zone", poly, bad)


def test_sector_requires_kind_and_bearings() -> None:
    poly = parse_geometry(SQUARE)
    ok = {"sector_kind": "wind", "bearing_from": 45, "bearing_to": 135.5}
    validate_feature("sector", poly, ok)
    for bad in (
        {},
        {**ok, "sector_kind": "lava"},
        {**ok, "bearing_from": 360},
        {**ok, "bearing_to": -1},
        {**ok, "bearing_to": "N"},
        {k: v for k, v in ok.items() if k != "bearing_from"},
    ):
        with pytest.raises(FeatureValidationError):
            validate_feature("sector", poly, bad)


def test_geometry_must_suit_feature_type() -> None:
    with pytest.raises(FeatureValidationError):
        validate_feature("zone", parse_geometry(POINT), {"zone_number": 1})
    with pytest.raises(FeatureValidationError):
        validate_feature("path", parse_geometry(SQUARE), {})
    validate_feature("element", parse_geometry(POINT), {})
    validate_feature("path", parse_geometry(LINE), {})
    with pytest.raises(FeatureValidationError):
        validate_feature("nonsense", parse_geometry(POINT), {})


def test_seed_catalog_is_consistent() -> None:
    keys = [e["key"] for e in ELEMENT_TYPES]
    assert len(keys) == len(set(keys))
    assert {"house", "bed", "tree", "pond", "swale", "fence", "path", "zone", "sector"} <= set(keys)
    for entry in ELEMENT_TYPES:
        assert entry["feature_type"] in FEATURE_TYPES
        assert entry["geometry_type"] in {"point", "line", "polygon"}
