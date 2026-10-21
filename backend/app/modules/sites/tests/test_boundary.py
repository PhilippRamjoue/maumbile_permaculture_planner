"""Unit tests for boundary validation (no database)."""

from __future__ import annotations

import pytest

from app.modules.sites.service import InvalidBoundaryError, build_boundary

# ~111 m x ~111 m square near Nairobi.
SQUARE = [(36.800, -1.300), (36.801, -1.300), (36.801, -1.299), (36.800, -1.299)]


def test_ring_is_closed_and_counter_clockwise() -> None:
    m = build_boundary(SQUARE[::-1])  # clockwise input
    coords = list(m.polygon.exterior.coords)
    assert coords[0] == coords[-1]
    assert m.polygon.exterior.is_ccw


def test_already_closed_ring_is_accepted() -> None:
    m = build_boundary([*SQUARE, SQUARE[0]])
    assert len(m.polygon.exterior.coords) == 5


def test_derived_fields() -> None:
    m = build_boundary(SQUARE)
    assert m.utm_epsg == 32737  # southern hemisphere, zone 37
    assert m.bbox == [36.800, -1.300, 36.801, -1.299]
    assert m.centroid.x == pytest.approx(36.8005)
    assert m.centroid.y == pytest.approx(-1.2995)


def test_bowtie_is_rejected() -> None:
    with pytest.raises(InvalidBoundaryError, match="Self-intersection"):
        build_boundary([(36.800, -1.300), (36.801, -1.299), (36.801, -1.300), (36.800, -1.299)])


@pytest.mark.parametrize(
    "ring",
    [
        [(36.8, -1.3), (36.8, -1.3), (36.801, -1.3)],  # only 2 distinct points
        [(36.8, -1.3), (36.801, -1.3), (36.802, -1.3)],  # collinear
    ],
)
def test_degenerate_rings_are_rejected(ring: list[tuple[float, float]]) -> None:
    with pytest.raises(InvalidBoundaryError):
        build_boundary(ring)
