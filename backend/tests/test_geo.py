from __future__ import annotations

import pytest

from app.core.geo import bbox_of, geojson_to_shape, shape_to_geojson, utm_epsg


def test_utm_epsg_nairobi() -> None:
    # Nairobi ~ (36.82E, 1.29S) -> UTM zone 37 south -> 32737
    assert utm_epsg(36.8219, -1.2921) == 32737


def test_utm_epsg_dar_es_salaam() -> None:
    # Dar es Salaam ~ (39.21E, 6.79S) -> UTM zone 37 south -> 32737
    assert utm_epsg(39.2083, -6.7924) == 32737


def test_utm_epsg_northern_hemisphere() -> None:
    # Berlin ~ (13.40E, 52.52N) -> UTM zone 33 north -> 32633
    assert utm_epsg(13.4050, 52.5200) == 32633


@pytest.mark.parametrize("bad", [(-181.0, 0.0), (181.0, 0.0), (0.0, 91.0), (0.0, -91.0)])
def test_utm_epsg_rejects_out_of_range(bad: tuple[float, float]) -> None:
    with pytest.raises(ValueError):
        utm_epsg(*bad)


def test_geojson_roundtrip() -> None:
    gj = {"type": "Point", "coordinates": [36.8, -1.3]}
    geom = geojson_to_shape(gj)
    assert geom.geom_type == "Point"
    back = shape_to_geojson(geom)
    assert back["type"] == "Point"
    assert tuple(back["coordinates"]) == (36.8, -1.3)


def test_bbox_of_polygon() -> None:
    gj = {
        "type": "Polygon",
        "coordinates": [[[36.0, -1.0], [36.0, -2.0], [37.0, -2.0], [37.0, -1.0], [36.0, -1.0]]],
    }
    bbox = bbox_of(geojson_to_shape(gj))
    assert bbox.as_tuple() == (36.0, -2.0, 37.0, -1.0)
