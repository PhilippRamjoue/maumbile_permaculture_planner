"""Regression coverage for stale tabs, atomic document writes and legacy API invalidation."""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration


def feature(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "layer_id": plan["layers"][0]["id"],
        "feature_type": "element",
        "geometry": {"type": "Point", "coordinates": [36.8, -1.3]},
        "properties": {"name": "Tree"},
    }


async def test_stale_tab_cannot_overwrite_or_resurrect(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    path = f"/api/v1/plans/{plan['id']}/design"
    f = feature(plan)
    first = await api.put(path, json={"expected_revision": plan["revision"], "features": [f]})
    assert first.status_code == 200, first.text
    revision = first.json()["plan"]["revision"]
    renamed = {**f, "properties": {"name": "Renamed"}}
    response = await api.put(path, json={"expected_revision": revision, "features": [renamed]})
    assert response.status_code == 200, response.text
    assert (
        await api.put(path, json={"expected_revision": revision, "features": [f]})
    ).status_code == 409
    current = (await api.get(path)).json()
    assert current["features"]["features"][0]["properties"]["name"] == "Renamed"
    deleted = await api.put(
        path, json={"expected_revision": current["plan"]["revision"], "deleted_ids": [f["id"]]}
    )
    assert deleted.status_code == 200, deleted.text
    assert (
        await api.put(path, json={"expected_revision": revision, "features": [f]})
    ).status_code == 409
    assert (await api.get(path)).json()["features"]["features"] == []


async def test_invalid_layer_rolls_back_whole_document(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    path = f"/api/v1/plans/{plan['id']}/design"
    response = await api.put(
        path,
        json={
            "expected_revision": plan["revision"],
            "features": [feature(plan)],
            "layers": [{"id": str(uuid.uuid4()), "visible": False}],
            "goals": {"vision": "Must not persist"},
        },
    )
    assert response.status_code == 422, response.text
    current = (await api.get(path)).json()
    assert current["features"]["features"] == []
    assert current["plan"]["revision"] == plan["revision"]
    assert current["plan"]["goals"] is None


async def test_goals_and_layers_share_guard_and_legacy_writes_invalidate_it(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    path = f"/api/v1/plans/{plan['id']}/design"
    response = await api.put(
        path,
        json={
            "expected_revision": plan["revision"],
            "goals": {"vision": "Water first"},
            "layers": [{"id": plan["layers"][0]["id"], "visible": False}],
        },
    )
    assert response.status_code == 200, response.text
    saved = response.json()["plan"]
    assert saved["goals"]["vision"] == "Water first"
    assert not saved["layers"][0]["visible"]
    legacy = await api.post(
        f"/api/v1/plans/{plan['id']}/features:batch", json={"features": [feature(plan)]}
    )
    assert legacy.status_code == 409, legacy.text
    stale = await api.put(
        path, json={"expected_revision": plan["revision"], "goals": {"vision": "Stale"}}
    )
    assert stale.status_code == 409
    assert (await api.get(path)).json()["plan"]["goals"]["vision"] == "Water first"


async def test_legacy_edit_invalidates_a_snapshot_before_protection(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    path = f"/api/v1/plans/{plan['id']}"
    initial = (await api.get(f"{path}/design")).json()
    legacy = await api.post(f"{path}/features:batch", json={"features": [feature(plan)]})
    assert legacy.status_code == 200
    stale = await api.put(
        f"{path}/design", json={"expected_revision": initial["plan"]["revision"], "features": []}
    )
    assert stale.status_code == 409
