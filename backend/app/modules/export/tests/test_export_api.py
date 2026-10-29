"""Export and share-link API tests against a real PostGIS container (needs Docker)."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Callable
from io import BytesIO
from typing import Any

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.main import app
from app.modules.auth.dependencies import current_user
from app.modules.planning.repository import PlanningRepository
from app.modules.planning.tests.test_planning_api import POINT, POLYGON, feat, layer_id

pytestmark = pytest.mark.integration

API = "/api/v1"
LINE = {"type": "LineString", "coordinates": [[36.801, -1.299], [36.803, -1.296]]}


async def test_export_holds_one_design_revision_during_a_concurrent_save(
    api: AsyncClient,
    plan: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = f"{API}/plans/{plan['id']}"
    original = feat(layer_id(plan), "element", POINT, properties={"name": "Before"})
    response = await api.put(
        f"{path}/design",
        json={
            "expected_revision": plan["revision"],
            "features": [original],
            "goals": {"vision": "Before"},
        },
    )
    revision = response.json()["plan"]["revision"]
    reading, release, writing = asyncio.Event(), asyncio.Event(), asyncio.Event()
    list_features = PlanningRepository.list_features
    advance = PlanningRepository.advance_plan
    pause_next = True

    async def paused_read(self: PlanningRepository, *args: Any, **kwargs: Any) -> Any:
        nonlocal pause_next
        if pause_next:
            pause_next = False
            reading.set()
            await release.wait()
        return await list_features(self, *args, **kwargs)

    async def observed_write(self: PlanningRepository, *args: Any, **kwargs: Any) -> None:
        writing.set()
        await advance(self, *args, **kwargs)

    monkeypatch.setattr(PlanningRepository, "list_features", paused_read)
    monkeypatch.setattr(PlanningRepository, "advance_plan", observed_write)
    export = asyncio.create_task(api.get(f"{path}/export"))
    save: asyncio.Task[Any] | None = None
    try:
        await asyncio.wait_for(reading.wait(), 5)
        changed = {**original, "properties": {"name": "After"}}
        save = asyncio.create_task(
            api.put(
                f"{path}/design",
                json={
                    "expected_revision": revision,
                    "features": [changed],
                    "goals": {"vision": "After"},
                },
            )
        )
        await asyncio.wait_for(writing.wait(), 5)
        # The export has already read plan metadata. The writer cannot pass its row lock
        # until the rest of the snapshot has been read and its transaction released.
        assert not save.done()
        release.set()
        exported = await asyncio.wait_for(export, 10)
        saved = await asyncio.wait_for(save, 10)
        assert saved.status_code == 200, saved.text
        assert exported.json()["plan"]["goals"]["vision"] == "Before"
        assert exported.json()["features"][0]["properties"]["name"] == "Before"
        latest = (await api.get(f"{path}/export")).json()
        assert latest["plan"]["goals"]["vision"] == "After"
        assert latest["features"][0]["properties"]["name"] == "After"
    finally:
        release.set()
        tasks = [export] + ([save] if save is not None else [])
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def seed(api: AsyncClient, plan: dict[str, Any]) -> list[dict[str, Any]]:
    types = {t["key"]: t["id"] for t in (await api.get(f"{API}/element-types")).json()}
    features = [
        feat(
            layer_id(plan, "Zones"),
            "zone",
            POLYGON,
            properties={"zone_number": 2, "name": "Orchard", "color": "#ffa726"},
        ),
        feat(
            layer_id(plan),
            "element",
            POINT,
            element_type_id=types["tree"],
            properties={"name": "Mango"},
        ),
        feat(layer_id(plan, "Paths"), "path", LINE, element_type_id=types["path"]),
    ]
    resp = await api.post(f"{API}/plans/{plan['id']}/features:batch", json={"features": features})
    assert resp.status_code == 200, resp.text
    return features


# ── GeoJSON ────────────────────────────────────────────────────────────────────────────────
async def test_geojson_export_round_trips_through_the_batch_endpoint(
    api: AsyncClient, site: dict[str, Any], plan: dict[str, Any]
) -> None:
    sent = await seed(api, plan)
    resp = await api.get(f"{API}/plans/{plan['id']}/export", params={"format": "geojson"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/geo+json")
    assert 'filename="master-plan.geojson"' in resp.headers["content-disposition"]
    exported = resp.json()
    assert exported["type"] == "FeatureCollection"
    assert exported["plan"]["name"] == "Master plan"
    assert len(exported["features"]) == 3

    # Import into a brand-new plan, mapping layers by name: nothing is lost.
    fresh = (await api.post(f"{API}/sites/{site['id']}/plans", json={"name": "Copy"})).json()
    by_name = {la["name"]: la["id"] for la in fresh["layers"]}
    old_names = {la["id"]: la["name"] for la in exported["layers"]}
    reimport = [
        {**f, "id": str(uuid.uuid4()), "layer_id": by_name[old_names[f["layer_id"]]]}
        for f in exported["features"]
    ]
    resp = await api.post(f"{API}/plans/{fresh['id']}/features:batch", json={"features": reimport})
    assert resp.status_code == 200, resp.text
    again = (await api.get(f"{API}/plans/{fresh['id']}/export")).json()  # default format
    key = lambda f: (f["feature_type"], str(f["geometry"]))  # noqa: E731
    assert sorted(map(key, again["features"])) == sorted(map(key, exported["features"]))
    assert {f["properties"].get("name") for f in again["features"]} == {"Orchard", "Mango", None}
    # And the original payload shape is directly acceptable to the same plan (idempotent).
    resp = await api.post(
        f"{API}/plans/{plan['id']}/features:batch", json={"features": exported["features"]}
    )
    assert resp.status_code == 200, resp.text
    assert {f["id"] for f in sent} == {f["id"] for f in exported["features"]}


async def test_geojson_includes_features_on_hidden_layers(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    await seed(api, plan)
    await api.patch(f"{API}/layers/{layer_id(plan, 'Zones')}", json={"visible": False})
    exported = (await api.get(f"{API}/plans/{plan['id']}/export")).json()
    assert len(exported["features"]) == 3
    assert next(la for la in exported["layers"] if la["name"] == "Zones")["visible"] is False


# ── PNG / PDF ──────────────────────────────────────────────────────────────────────────────
async def test_png_export_is_a_scaled_plan_image(api: AsyncClient, plan: dict[str, Any]) -> None:
    await seed(api, plan)
    resp = await api.get(f"{API}/plans/{plan['id']}/export", params={"format": "png"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert resp.headers["content-disposition"].startswith("attachment")
    assert resp.headers["cache-control"] == "no-store"
    img = Image.open(BytesIO(resp.content))
    assert img.size == (2339, 1654)
    assert round(img.info["dpi"][0]) == 200


async def test_pdf_export(api: AsyncClient, plan: dict[str, Any]) -> None:
    resp = await api.get(f"{API}/plans/{plan['id']}/export", params={"format": "pdf"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF-")


async def test_inline_disposition_for_embedding(api: AsyncClient, plan: dict[str, Any]) -> None:
    resp = await api.get(
        f"{API}/plans/{plan['id']}/export", params={"format": "png", "download": "false"}
    )
    assert resp.headers["content-disposition"].startswith("inline")


async def test_unknown_format_is_rejected(api: AsyncClient, plan: dict[str, Any]) -> None:
    resp = await api.get(f"{API}/plans/{plan['id']}/export", params={"format": "docx"})
    assert resp.status_code == 422


# ── ownership ──────────────────────────────────────────────────────────────────────────────
async def test_only_the_owner_can_export_or_share(
    api: AsyncClient, plan: dict[str, Any], act_as: Callable[[uuid.UUID], None]
) -> None:
    act_as(uuid.uuid4())
    for fmt in ("geojson", "png", "pdf"):
        resp = await api.get(f"{API}/plans/{plan['id']}/export", params={"format": fmt})
        assert resp.status_code == 403, fmt
    assert (await api.post(f"{API}/plans/{plan['id']}/share")).status_code == 403
    assert (await api.get(f"{API}/plans/{plan['id']}/share")).status_code == 403
    assert (await api.delete(f"{API}/plans/{plan['id']}/share")).status_code == 403


async def test_export_requires_sign_in_and_a_real_plan(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    missing = await api.get(f"{API}/plans/{uuid.uuid4()}/export")
    assert missing.status_code == 404
    await api.delete(f"{API}/plans/{plan['id']}")
    assert (await api.get(f"{API}/plans/{plan['id']}/export")).status_code == 404


async def test_anonymous_cannot_use_owner_endpoints(api: AsyncClient, plan: dict[str, Any]) -> None:
    app.dependency_overrides.pop(current_user, None)  # a visitor with no session
    assert (await api.get(f"{API}/plans/{plan['id']}/export")).status_code == 401


# ── share links ────────────────────────────────────────────────────────────────────────────
async def share(api: AsyncClient, plan: dict[str, Any]) -> str:
    resp = await api.post(f"{API}/plans/{plan['id']}/share")
    assert resp.status_code == 201, resp.text
    return str(resp.json()["token"])


async def test_share_link_gives_read_only_access_without_sign_in(
    api: AsyncClient, plan: dict[str, Any], act_as: Callable[[uuid.UUID], None]
) -> None:
    await seed(api, plan)
    assert (await api.get(f"{API}/plans/{plan['id']}/share")).json() == {
        "shared": False,
        "created_at": None,
    }
    token = await share(api, plan)
    assert len(token) >= 40
    status = (await api.get(f"{API}/plans/{plan['id']}/share")).json()
    assert status["shared"] is True and status["created_at"]
    assert token not in str(status)  # the secret is never retrievable again

    app.dependency_overrides.pop(current_user, None)  # a visitor with no session
    for fmt, kind in (("png", "image/png"), ("pdf", "application/pdf")):
        resp = await api.get(f"{API}/shared/{token}/export", params={"format": fmt})
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == kind
    geo = await api.get(f"{API}/shared/{token}/export", params={"format": "geojson"})
    assert len(geo.json()["features"]) == 3
    default = await api.get(f"{API}/shared/{token}/export")
    assert default.headers["content-type"] == "image/png"

    # The token grants nothing else: no plan endpoints, no writes, no further sharing.
    assert (await api.get(f"{API}/plans/{plan['id']}")).status_code == 401
    assert (await api.get(f"{API}/plans/{plan['id']}/export")).status_code == 401
    assert (await api.post(f"{API}/plans/{plan['id']}/share")).status_code == 401
    assert (await api.get(f"{API}/shared/{token}")).status_code == 404


async def test_unknown_or_tampered_token_is_404(api: AsyncClient, plan: dict[str, Any]) -> None:
    token = await share(api, plan)
    for bad in ("nope", token[:-1] + ("A" if token[-1] != "A" else "B"), token.upper()):
        resp = await api.get(f"{API}/shared/{bad}/export")
        assert resp.status_code == 404, bad


async def test_new_link_replaces_the_old_and_revoke_kills_it(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    first = await share(api, plan)
    second = await share(api, plan)
    assert first != second
    assert (await api.get(f"{API}/shared/{first}/export")).status_code == 404
    assert (await api.get(f"{API}/shared/{second}/export")).status_code == 200

    assert (await api.delete(f"{API}/plans/{plan['id']}/share")).status_code == 204
    assert (await api.get(f"{API}/shared/{second}/export")).status_code == 404
    assert (await api.get(f"{API}/plans/{plan['id']}/share")).json()["shared"] is False
    assert (await api.delete(f"{API}/plans/{plan['id']}/share")).status_code == 204  # idempotent


async def test_only_the_hash_is_stored(
    api: AsyncClient, plan: dict[str, Any], engine: AsyncEngine
) -> None:
    token = await share(api, plan)
    async with engine.connect() as conn:
        rows = (await conn.execute(text("SELECT token_hash FROM plan_shares"))).scalars().all()
    assert token not in rows
    assert all(len(h) == 64 for h in rows)


async def test_link_stops_working_when_the_site_changes_hands(
    api: AsyncClient, site: dict[str, Any], plan: dict[str, Any], engine: AsyncEngine
) -> None:
    token = await share(api, plan)
    assert (await api.get(f"{API}/shared/{token}/export")).status_code == 200
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE sites SET owner_id = :o WHERE id = :s"),
            {"o": uuid.uuid4(), "s": site["id"]},
        )
    assert (await api.get(f"{API}/shared/{token}/export")).status_code == 404


async def test_link_stops_working_when_the_plan_is_deleted(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    token = await share(api, plan)
    await api.delete(f"{API}/plans/{plan['id']}")
    assert (await api.get(f"{API}/shared/{token}/export")).status_code == 404


async def test_plan_without_features_exports_the_site_boundary(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    resp = await api.get(f"{API}/plans/{plan['id']}/export", params={"format": "png"})
    assert resp.status_code == 200
    assert Image.open(BytesIO(resp.content)).size == (2339, 1654)
