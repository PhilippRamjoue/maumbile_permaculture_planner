"""Integration tests for the sites API against a real PostGIS container (needs Docker)."""

from __future__ import annotations

import math
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

# Authalic Earth radius (m): the area of a lat/lng quadrangle on a sphere of this radius matches
# the WGS84 ellipsoid to well under 0.1%, giving an independent reference for the PostGIS result.
R_AUTHALIC = 6_371_007.2

# A ~1.2 km x ~1.2 km plot near Nairobi (UTM 37S).
CORNERS = [(36.800, -1.300), (36.810, -1.300), (36.810, -1.290), (36.800, -1.290)]


def reference_area_m2(lng0: float, lat0: float, lng1: float, lat1: float) -> float:
    """Exact area of a lat/lng-aligned quadrangle on the authalic sphere."""
    dlam = math.radians(lng1 - lng0)
    return R_AUTHALIC**2 * dlam * (math.sin(math.radians(lat1)) - math.sin(math.radians(lat0)))


def payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "Test shamba",
        "country_code": "KE",
        "coordinates": [list(c) for c in CORNERS],
    }
    body.update(overrides)
    return body


async def test_create_site_from_four_corners(api: AsyncClient) -> None:
    resp = await api.post("/api/v1/sites", json=payload())
    assert resp.status_code == 201, resp.text
    site = resp.json()

    expected = reference_area_m2(36.800, -1.300, 36.810, -1.290)
    assert site["area_m2"] == pytest.approx(expected, rel=0.01)
    assert site["utm_epsg"] == 32737
    assert site["country_code"] == "KE"
    assert site["bbox"] == [36.800, -1.300, 36.810, -1.290]
    assert site["centroid"]["coordinates"] == pytest.approx([36.805, -1.295])
    ring = site["boundary"]["coordinates"][0]
    assert ring[0] == ring[-1] and len(ring) == 5  # closed


async def test_country_code_is_derived_when_omitted(api: AsyncClient) -> None:
    body = payload()
    del body["country_code"]
    resp = await api.post("/api/v1/sites", json=body)
    assert resp.status_code == 201, resp.text
    assert resp.json()["country_code"] == "KE"  # Nairobi


async def test_country_code_is_normalised_to_upper_case(api: AsyncClient) -> None:
    resp = await api.post("/api/v1/sites", json=payload(country_code="tz"))
    assert resp.json()["country_code"] == "TZ"


@pytest.mark.parametrize(
    "overrides",
    [
        # self-intersecting "bow-tie"
        {"coordinates": [[36.800, -1.300], [36.810, -1.290], [36.810, -1.300], [36.800, -1.290]]},
        {"coordinates": [[36.8, -1.3], [36.81, -1.3]]},  # too few points
        {"coordinates": [[36.8, -1.3], [36.81, -1.3], [36.82, -1.3]]},  # collinear
        {"coordinates": [[36.8, -1.3], [36.81, -1.3], [36.81, 95.0]]},  # latitude out of range
        {"coordinates": [[-1.3, 200.0], [-1.3, 201.0], [-1.2, 201.0]]},  # longitude out of range
        {"country_code": "KEN"},
        {"name": ""},
    ],
)
async def test_invalid_input_is_422(api: AsyncClient, overrides: dict[str, Any]) -> None:
    resp = await api.post("/api/v1/sites", json=payload(**overrides))
    assert resp.status_code == 422, resp.text
    assert resp.headers["content-type"].startswith("application/problem+json")


async def test_get_update_delete(api: AsyncClient) -> None:
    created = (await api.post("/api/v1/sites", json=payload())).json()
    url = f"/api/v1/sites/{created['id']}"

    got = await api.get(url)
    assert got.status_code == 200
    assert got.json() == created

    renamed = await api.patch(url, json={"name": "Renamed"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"
    assert renamed.json()["area_m2"] == created["area_m2"]

    # Replacing the boundary re-measures the site: a 2x taller plot has ~2x the area.
    taller = [[36.800, -1.300], [36.810, -1.300], [36.810, -1.280], [36.800, -1.280]]
    moved = (await api.patch(url, json={"coordinates": taller})).json()
    assert moved["area_m2"] == pytest.approx(created["area_m2"] * 2, rel=0.01)
    assert moved["bbox"] == [36.800, -1.300, 36.810, -1.280]

    assert (await api.patch(url, json={"coordinates": [[0, 0], [1, 1], [2, 2]]})).status_code == 422

    assert (await api.delete(url)).status_code == 204
    assert (await api.get(url)).status_code == 404
    assert (await api.delete(url)).status_code == 404


async def test_unknown_site_is_404(api: AsyncClient) -> None:
    assert (await api.get(f"/api/v1/sites/{uuid.uuid4()}")).status_code == 404


async def test_list_is_scoped_to_owner_and_paginated(
    api: AsyncClient, act_as: Callable[[uuid.UUID | None], None]
) -> None:
    alice = uuid.uuid4()
    act_as(alice)
    ids = [
        (await api.post("/api/v1/sites", json=payload(name=f"s{i}"))).json()["id"] for i in range(3)
    ]
    act_as(uuid.uuid4())
    await api.post("/api/v1/sites", json=payload(name="not alice's"))

    act_as(alice)
    page = (await api.get("/api/v1/sites", params={"limit": 2})).json()
    assert page["total"] == 3 and page["limit"] == 2 and len(page["items"]) == 2
    rest = (await api.get("/api/v1/sites", params={"limit": 2, "offset": 2})).json()
    assert len(rest["items"]) == 1
    listed = {s["id"] for s in page["items"]} | {s["id"] for s in rest["items"]}
    assert listed == set(ids)

    await api.delete(f"/api/v1/sites/{ids[0]}")
    assert (await api.get("/api/v1/sites")).json()["total"] == 2  # soft-deleted are hidden


async def test_non_owner_gets_403(
    api: AsyncClient, act_as: Callable[[uuid.UUID | None], None]
) -> None:
    act_as(uuid.uuid4())
    site_id = (await api.post("/api/v1/sites", json=payload())).json()["id"]
    url = f"/api/v1/sites/{site_id}"

    act_as(uuid.uuid4())  # a different user
    assert (await api.get(url)).status_code == 403
    assert (await api.patch(url, json={"name": "hijack"})).status_code == 403
    assert (await api.delete(url)).status_code == 403
