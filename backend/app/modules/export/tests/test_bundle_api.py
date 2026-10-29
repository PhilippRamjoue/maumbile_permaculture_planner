"""Site export/import bundle API tests against a real PostGIS container (needs Docker)."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from httpx import AsyncClient

from app.modules.planning.tests.test_planning_api import LINE, POINT, feat, layer_id

pytestmark = pytest.mark.integration

API = "/api/v1"

ZONE_POLY = {
    "type": "Polygon",
    "coordinates": [[[36.801, -1.299], [36.804, -1.299], [36.804, -1.296], [36.801, -1.299]]],
}
SECTOR_POLY = {
    "type": "Polygon",
    "coordinates": [[[36.805, -1.295], [36.807, -1.295], [36.806, -1.293], [36.805, -1.295]]],
}


async def _fill_plan(api: AsyncClient, plan: dict[str, Any]) -> None:
    """Put one feature of each kind — with colours and typed properties — into a plan."""
    features = [
        feat(
            layer_id(plan, "Zones"),
            "zone",
            ZONE_POLY,
            properties={"zone_number": 1, "color": "#ea580c"},
        ),
        feat(
            layer_id(plan, "Sectors"),
            "sector",
            SECTOR_POLY,
            properties={"sector_kind": "sun", "bearing_from": 90, "bearing_to": 270},
        ),
        feat(layer_id(plan, "Elements"), "element", POINT, properties={"name": "Rain tank"}),
        feat(layer_id(plan, "Paths"), "path", LINE, properties={"width_m": 1.0}),
    ]
    resp = await api.put(
        f"{API}/plans/{plan['id']}/design",
        json={"expected_revision": plan["revision"], "features": features},
    )
    assert resp.status_code == 200, resp.text


async def test_export_then_import_as_another_owner_copies_the_site(
    api: AsyncClient,
    site: dict[str, Any],
    plan: dict[str, Any],
    owner_id: uuid.UUID,
    act_as: Callable[[uuid.UUID], None],
) -> None:
    await _fill_plan(api, plan)

    exported = await api.get(f"{API}/sites/{site['id']}/export/bundle")
    assert exported.status_code == 200, exported.text
    assert exported.headers["content-type"].startswith("application/json")
    bundle = exported.json()
    assert bundle["bundle_version"] == 1
    assert len(bundle["plans"]) == 1
    assert {la["role"] for la in bundle["plans"][0]["layers"]} == {
        "zone",
        "sector",
        "element",
        "path",
        "annotation",
    }

    other = uuid.uuid4()
    act_as(other)
    imported = await api.post(f"{API}/sites/import", json=bundle)
    assert imported.status_code == 201, imported.text
    new_site_id = imported.json()["id"]
    assert new_site_id != site["id"]  # a fresh site

    plans = (await api.get(f"{API}/sites/{new_site_id}/plans")).json()
    assert len(plans["items"]) == 1
    new_plan = plans["items"][0]
    assert new_plan["id"] != plan["id"]  # a fresh plan id
    design = (await api.get(f"{API}/plans/{new_plan['id']}/design")).json()
    features = design["features"]["features"]  # a GeoJSON FeatureCollection
    assert sorted(f["feature_type"] for f in features) == ["element", "path", "sector", "zone"]
    zone = next(f for f in features if f["feature_type"] == "zone")
    assert zone["properties"]["zone_number"] == 1
    assert zone["properties"]["color"] == "#ea580c"  # custom colour survived
    element = next(f for f in features if f["feature_type"] == "element")
    assert element["element_type_id"] is None or isinstance(element["element_type_id"], int)

    # The original owner never sees the copy.
    act_as(owner_id)
    mine = (await api.get(f"{API}/sites")).json()
    assert new_site_id not in {s["id"] for s in mine["items"]}


async def test_import_rejects_an_unknown_bundle_version(
    api: AsyncClient, site: dict[str, Any]
) -> None:
    bundle = (await api.get(f"{API}/sites/{site['id']}/export/bundle")).json()
    bundle["bundle_version"] = 999
    resp = await api.post(f"{API}/sites/import", json=bundle)
    assert resp.status_code == 422


async def test_import_rejects_a_feature_that_fails_validation(
    api: AsyncClient,
    site: dict[str, Any],
    plan: dict[str, Any],
    act_as: Callable[[uuid.UUID], None],
) -> None:
    await _fill_plan(api, plan)
    bundle = (await api.get(f"{API}/sites/{site['id']}/export/bundle")).json()
    for bundle_plan in bundle["plans"]:
        for feature in bundle_plan["features"]:
            if feature["feature_type"] == "zone":
                feature["properties"] = {}  # a zone with no zone_number is invalid
    act_as(uuid.uuid4())
    resp = await api.post(f"{API}/sites/import", json=bundle)
    assert resp.status_code == 422


async def test_export_requires_owning_the_site(
    api: AsyncClient, site: dict[str, Any], act_as: Callable[[uuid.UUID], None]
) -> None:
    act_as(uuid.uuid4())  # a different account
    resp = await api.get(f"{API}/sites/{site['id']}/export/bundle")
    assert resp.status_code in (403, 404)
