"""Integration tests for the planning API against a real PostGIS container (needs Docker)."""

from __future__ import annotations

import math
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.modules.planning.seed import ELEMENT_TYPE_CATALOG

pytestmark = pytest.mark.integration

API = "/api/v1"
R_AUTHALIC = 6_371_007.2  # m; independent spherical reference for area checks
R_MEAN = 6_371_008.8  # m; mean Earth radius for the haversine length reference

POINT = {"type": "Point", "coordinates": [36.8050, -1.2950]}
LINE = {
    "type": "LineString",
    "coordinates": [[36.8010, -1.2990], [36.8030, -1.2960], [36.806, -1.296]],
}
POLYGON = {
    "type": "Polygon",
    "coordinates": [
        [[36.802, -1.298], [36.804, -1.298], [36.804, -1.296], [36.802, -1.296], [36.802, -1.298]]
    ],
}


def layer_id(plan: dict[str, Any], name: str = "Elements") -> str:
    return next(layer["id"] for layer in plan["layers"] if layer["name"] == name)


def feat(lid: str, feature_type: str, geometry: dict[str, Any], **kw: Any) -> dict[str, Any]:
    return {
        "id": str(kw.pop("id", uuid.uuid4())),
        "layer_id": lid,
        "feature_type": feature_type,
        "geometry": geometry,
        "properties": kw.pop("properties", {}),
        **kw,
    }


def haversine_m(lng0: float, lat0: float, lng1: float, lat1: float) -> float:
    p0, p1 = math.radians(lat0), math.radians(lat1)
    a = (
        math.sin((p1 - p0) / 2) ** 2
        + math.cos(p0) * math.cos(p1) * math.sin(math.radians(lng1 - lng0) / 2) ** 2
    )
    return 2 * R_MEAN * math.asin(math.sqrt(a))


# ── element types ──────────────────────────────────────────────────────────────────────────
async def test_element_types_are_seeded(api: AsyncClient) -> None:
    resp = await api.get(f"{API}/element-types")
    assert resp.status_code == 200, resp.text
    by_key = {e["key"]: e for e in resp.json()}
    assert {"house", "bed", "tree", "pond", "swale", "fence", "path", "zone", "sector"} <= set(
        by_key
    )
    assert by_key["swale"]["geometry_type"] == "line"
    assert by_key["zone"]["feature_type"] == "zone"
    assert isinstance(by_key["house"]["default_style"], dict)


async def test_element_types_carry_default_functions_and_colours(api: AsyncClient) -> None:
    by_key = {e["key"]: e for e in (await api.get(f"{API}/element-types")).json()}

    # A tree needs water and a tank gives it, so that link exists as soon as both are placed.
    assert "water" in by_key["tree"]["default_properties"]["needs"]
    assert {"shade", "windbreak", "habitat"} <= set(by_key["tree"]["default_properties"]["yields"])
    for key in ("water_tank", "pond", "swale", "well"):
        assert "water" in by_key[key]["default_properties"]["yields"], key
    assert by_key["house"]["default_properties"]["needs"] == []

    assert by_key["tree"]["default_style"]["fill"].startswith("#")
    assert by_key["path"]["default_style"]["stroke"] == "#8d6e63"  # brown
    assert by_key["water_tank"]["default_style"]["fill"] == "#0d47a1"  # dark blue
    assert by_key["zone"]["default_properties"] == {}


async def test_migrated_catalog_matches_the_seed(api: AsyncClient) -> None:
    """The seed is the live catalog; a change to it must come with a new migration."""
    by_key = {e["key"]: e for e in (await api.get(f"{API}/element-types")).json()}
    for key, entry in ELEMENT_TYPE_CATALOG.items():
        assert by_key[key]["default_style"] == entry["default_style"], key
        assert by_key[key]["default_properties"] == entry["default_properties"], key
        assert by_key[key]["icon"] == entry["icon"], key


# ── plans & layers ─────────────────────────────────────────────────────────────────────────
async def test_plan_crud(api: AsyncClient, site: dict[str, Any]) -> None:
    created = await api.post(
        f"{API}/sites/{site['id']}/plans", json={"name": "Plan A", "description": "first"}
    )
    assert created.status_code == 201
    plan = created.json()
    assert plan["site_id"] == site["id"]
    assert [layer["name"] for layer in plan["layers"]] == [
        "Zones",
        "Sectors",
        "Elements",
        "Paths",
        "Annotations",
    ]

    listing = await api.get(f"{API}/sites/{site['id']}/plans")
    assert listing.json()["total"] == 1

    got = await api.get(f"{API}/plans/{plan['id']}")
    assert got.json()["name"] == "Plan A"
    assert len(got.json()["layers"]) == 5

    patched = await api.patch(f"{API}/plans/{plan['id']}", json={"name": "Plan B"})
    assert patched.json()["name"] == "Plan B"
    assert patched.json()["description"] == "first"

    assert (await api.delete(f"{API}/plans/{plan['id']}")).status_code == 204
    assert (await api.get(f"{API}/plans/{plan['id']}")).status_code == 404
    assert (await api.get(f"{API}/sites/{site['id']}/plans")).json()["total"] == 0


async def test_layer_crud_and_cascade(api: AsyncClient, plan: dict[str, Any]) -> None:
    created = await api.post(f"{API}/plans/{plan['id']}/layers", json={"name": "Water"})
    assert created.status_code == 201
    layer = created.json()
    assert layer["sort_order"] == 5 and layer["visible"] is True

    patched = await api.patch(f"{API}/layers/{layer['id']}", json={"visible": False, "name": "H2O"})
    assert patched.json()["visible"] is False and patched.json()["name"] == "H2O"

    saved = await api.post(
        f"{API}/plans/{plan['id']}/features", json=feat(layer["id"], "element", POINT)
    )
    assert saved.status_code == 201

    layers = await api.get(f"{API}/plans/{plan['id']}/layers")
    assert len(layers.json()) == 6

    assert (await api.delete(f"{API}/layers/{layer['id']}")).status_code == 204
    remaining = await api.get(f"{API}/plans/{plan['id']}/features")
    assert remaining.json()["features"] == []  # cascaded


# ── features: batch upsert round-trip ──────────────────────────────────────────────────────
async def test_batch_upsert_roundtrips_identically(api: AsyncClient, plan: dict[str, Any]) -> None:
    types = {e["key"]: e["id"] for e in (await api.get(f"{API}/element-types")).json()}
    elements = layer_id(plan)
    batch = [
        feat(
            elements, "element", POINT, element_type_id=types["tree"], properties={"name": "Mango"}
        ),
        feat(elements, "element", LINE, element_type_id=types["swale"]),
        feat(
            elements, "element", POLYGON, element_type_id=types["bed"], properties={"crop": "kale"}
        ),
        feat(layer_id(plan, "Paths"), "path", LINE, properties={"width_m": 1.5}),
        feat(
            layer_id(plan, "Zones"),
            "zone",
            POLYGON,
            properties={"zone_number": 1, "name": "Kitchen garden"},
        ),
        feat(
            layer_id(plan, "Sectors"),
            "sector",
            POLYGON,
            properties={"sector_kind": "wind", "bearing_from": 60, "bearing_to": 120},
        ),
    ]
    resp = await api.post(f"{API}/plans/{plan['id']}/features:batch", json={"features": batch})
    assert resp.status_code == 200, resp.text
    returned = resp.json()["features"]
    assert [f["id"] for f in returned] == [b["id"] for b in batch]  # input order kept

    listing = await api.get(f"{API}/plans/{plan['id']}/features")
    assert listing.json()["type"] == "FeatureCollection"
    stored = {f["id"]: f for f in listing.json()["features"]}
    assert len(stored) == len(batch)
    for sent in batch:
        got = stored[sent["id"]]
        assert got["type"] == "Feature"
        assert got["geometry"] == sent["geometry"]  # identical GeoJSON
        assert got["properties"] == sent["properties"]
        assert got["layer_id"] == sent["layer_id"]
        assert got["feature_type"] == sent["feature_type"]
        assert got["element_type_id"] == sent.get("element_type_id")
        single = (await api.get(f"{API}/features/{sent['id']}")).json()
        assert single == got

    # Measurements ride along on every read.
    polygon = next(f for f in stored.values() if f["properties"].get("crop") == "kale")
    assert polygon["area_m2"] > 0 and polygon["length_m"] > 0
    point = next(f for f in stored.values() if f["properties"].get("name") == "Mango")
    assert point["area_m2"] == 0 and point["length_m"] == 0


async def test_batch_upsert_is_idempotent_and_updates(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    lid = layer_id(plan)
    a, b = feat(lid, "element", POINT), feat(lid, "element", POLYGON)
    url = f"{API}/plans/{plan['id']}/features:batch"
    assert (await api.post(url, json={"features": [a, b]})).status_code == 200
    assert (await api.post(url, json={"features": [a, b]})).status_code == 200  # replay
    assert len((await api.get(f"{API}/plans/{plan['id']}/features")).json()["features"]) == 2

    moved = {
        **a,
        "geometry": {"type": "Point", "coordinates": [36.807, -1.292]},
        "properties": {"n": 2},
    }
    assert (await api.post(url, json={"features": [moved]})).status_code == 200
    features = (await api.get(f"{API}/plans/{plan['id']}/features")).json()["features"]
    assert len(features) == 2
    updated = next(f for f in features if f["id"] == a["id"])
    assert updated["geometry"] == moved["geometry"] and updated["properties"] == {"n": 2}


async def test_batch_is_all_or_nothing(api: AsyncClient, plan: dict[str, Any]) -> None:
    lid = layer_id(plan)
    good = feat(lid, "element", POINT)
    bad = feat(lid, "element", POINT, layer_id=str(uuid.uuid4()))  # layer not in this plan
    resp = await api.post(
        f"{API}/plans/{plan['id']}/features:batch", json={"features": [good, bad]}
    )
    assert resp.status_code == 422
    assert (await api.get(f"{API}/plans/{plan['id']}/features")).json()["features"] == []


async def test_batch_rejects_duplicate_ids_and_unknown_element_type(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    lid = layer_id(plan)
    f = feat(lid, "element", POINT)
    url = f"{API}/plans/{plan['id']}/features:batch"
    assert (await api.post(url, json={"features": [f, f]})).status_code == 422
    unknown = feat(lid, "element", POINT, element_type_id=99999)
    assert (await api.post(url, json={"features": [unknown]})).status_code == 422


async def test_feature_ids_cannot_be_hijacked_across_plans(
    api: AsyncClient, site: dict[str, Any], plan: dict[str, Any]
) -> None:
    other = (await api.post(f"{API}/sites/{site['id']}/plans", json={"name": "Other"})).json()
    f = feat(layer_id(plan), "element", POINT)
    assert (
        await api.post(f"{API}/plans/{plan['id']}/features:batch", json={"features": [f]})
    ).status_code == 200
    clash = {**f, "layer_id": layer_id(other)}
    resp = await api.post(f"{API}/plans/{other['id']}/features:batch", json={"features": [clash]})
    assert resp.status_code == 409
    # The original is untouched.
    assert (await api.get(f"{API}/features/{f['id']}")).json()["plan_id"] == plan["id"]


# ── features: typed properties & single-feature endpoints ──────────────────────────────────
async def test_typed_properties_are_validated(api: AsyncClient, plan: dict[str, Any]) -> None:
    zones, sectors = layer_id(plan, "Zones"), layer_id(plan, "Sectors")
    url = f"{API}/plans/{plan['id']}/features"
    bad = [
        feat(zones, "zone", POLYGON),  # no zone_number
        feat(zones, "zone", POLYGON, properties={"zone_number": 7}),
        feat(zones, "zone", POINT, properties={"zone_number": 1}),  # zones are polygons
        feat(sectors, "sector", POLYGON, properties={"sector_kind": "wind"}),  # no bearings
        feat(
            sectors,
            "sector",
            POLYGON,
            properties={"sector_kind": "sun", "bearing_from": 400, "bearing_to": 10},
        ),
        feat(
            sectors,
            "sector",
            POLYGON,
            properties={"sector_kind": "lava", "bearing_from": 1, "bearing_to": 2},
        ),
    ]
    for body in bad:
        resp = await api.post(url, json=body)
        assert resp.status_code == 422, (body, resp.text)
    ok = await api.post(
        url,
        json=feat(
            sectors,
            "sector",
            POLYGON,
            properties={
                "sector_kind": "sun",
                "bearing_from": 90,
                "bearing_to": 270,
                "season": "dry",
            },
        ),
    )
    assert ok.status_code == 201, ok.text


async def test_invalid_geometry_is_rejected(api: AsyncClient, plan: dict[str, Any]) -> None:
    lid = layer_id(plan)
    bowtie = {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]}
    multi = {"type": "MultiPoint", "coordinates": [[1, 1]]}
    for geom in (bowtie, multi, {"type": "Point", "coordinates": [999, 0]}):
        resp = await api.post(f"{API}/plans/{plan['id']}/features", json=feat(lid, "element", geom))
        assert resp.status_code == 422, geom


async def test_single_feature_create_get_patch_delete(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    lid = layer_id(plan)
    created = await api.post(
        f"{API}/plans/{plan['id']}/features",
        json={"layer_id": lid, "feature_type": "element", "geometry": POINT},  # id server-side
    )
    assert created.status_code == 201, created.text
    fid = created.json()["id"]

    patched = await api.patch(f"{API}/features/{fid}", json={"properties": {"name": "Well"}})
    assert patched.status_code == 200 and patched.json()["properties"] == {"name": "Well"}
    assert patched.json()["geometry"] == POINT  # untouched

    # The merged feature is re-validated: a point cannot become a zone.
    assert (
        await api.patch(f"{API}/features/{fid}", json={"feature_type": "zone"})
    ).status_code == 422
    moved = await api.patch(f"{API}/features/{fid}", json={"geometry": LINE})
    assert moved.json()["geometry"] == LINE and moved.json()["length_m"] > 0

    # Re-creating an existing id through the single endpoint is a conflict (batch is the upsert).
    dup = await api.post(
        f"{API}/plans/{plan['id']}/features", json=feat(lid, "element", POINT, id=fid)
    )
    assert dup.status_code == 409

    assert (await api.delete(f"{API}/features/{fid}")).status_code == 204
    assert (await api.get(f"{API}/features/{fid}")).status_code == 404


async def test_list_features_filters(api: AsyncClient, plan: dict[str, Any]) -> None:
    elements, paths = layer_id(plan), layer_id(plan, "Paths")
    batch = [feat(elements, "element", POINT), feat(paths, "path", LINE)]
    await api.post(f"{API}/plans/{plan['id']}/features:batch", json={"features": batch})
    by_layer = await api.get(f"{API}/plans/{plan['id']}/features", params={"layer_id": paths})
    assert [f["feature_type"] for f in by_layer.json()["features"]] == ["path"]
    by_type = await api.get(
        f"{API}/plans/{plan['id']}/features", params={"feature_type": "element"}
    )
    assert [f["feature_type"] for f in by_type.json()["features"]] == ["element"]


# ── measurement ────────────────────────────────────────────────────────────────────────────
async def test_measure_matches_postgis_and_reference(api: AsyncClient, engine: AsyncEngine) -> None:
    line = {"type": "LineString", "coordinates": [[36.80, -1.30], [36.81, -1.29]]}
    resp = await api.post(f"{API}/features:measure", json={"geometry": line})
    assert resp.status_code == 200, resp.text
    got = resp.json()
    assert got["area_m2"] == 0

    async with engine.connect() as conn:
        pg = (
            await conn.execute(
                text(
                    "SELECT ST_Length("
                    "ST_GeogFromText('SRID=4326;LINESTRING(36.80 -1.30, 36.81 -1.29)'))"
                )
            )
        ).scalar_one()
    assert got["length_m"] == pytest.approx(float(pg), rel=1e-9)
    # Independent spherical reference (sphere vs ellipsoid: well under 0.5%).
    assert got["length_m"] == pytest.approx(haversine_m(36.80, -1.30, 36.81, -1.29), rel=0.005)


async def test_measure_polygon_area_and_perimeter(api: AsyncClient, engine: AsyncEngine) -> None:
    square = {
        "type": "Polygon",
        "coordinates": [
            [
                [36.800, -1.300],
                [36.810, -1.300],
                [36.810, -1.290],
                [36.800, -1.290],
                [36.800, -1.300],
            ]
        ],
    }
    got = (await api.post(f"{API}/features:measure", json={"geometry": square})).json()

    ref_area = (
        R_AUTHALIC**2
        * math.radians(0.01)
        * (math.sin(math.radians(-1.290)) - math.sin(math.radians(-1.300)))
    )
    assert got["area_m2"] == pytest.approx(ref_area, rel=0.005)

    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    "SELECT ST_Area(g), ST_Perimeter(g) FROM "
                    "(SELECT ST_GeogFromText('SRID=4326;POLYGON(("
                    "36.8 -1.3,36.81 -1.3,36.81 -1.29,36.8 -1.29,36.8 -1.3))') g) s"
                )
            )
        ).one()
    assert got["area_m2"] == pytest.approx(float(row[0]), rel=1e-9)
    assert got["length_m"] == pytest.approx(float(row[1]), rel=1e-9)  # perimeter

    # A saved feature reports the same authoritative numbers.
    point = (await api.post(f"{API}/features:measure", json={"geometry": POINT})).json()
    assert point == {"length_m": 0, "area_m2": 0}


async def test_measure_rejects_bad_geometry(api: AsyncClient) -> None:
    resp = await api.post(
        f"{API}/features:measure", json={"geometry": {"type": "Point", "coordinates": [500, 0]}}
    )
    assert resp.status_code == 422


async def test_saved_feature_measurements_match_measure_endpoint(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    created = (
        await api.post(
            f"{API}/plans/{plan['id']}/features", json=feat(layer_id(plan), "element", POLYGON)
        )
    ).json()
    measured = (await api.post(f"{API}/features:measure", json={"geometry": POLYGON})).json()
    assert created["area_m2"] == pytest.approx(measured["area_m2"], rel=1e-9)
    assert created["length_m"] == pytest.approx(measured["length_m"], rel=1e-9)


# ── ownership ──────────────────────────────────────────────────────────────────────────────
async def test_non_owner_is_forbidden_everywhere(
    api: AsyncClient,
    act_as: Callable[[uuid.UUID], None],
    site: dict[str, Any],
    plan: dict[str, Any],
) -> None:
    lid = layer_id(plan)
    f = feat(lid, "element", POINT)
    assert (
        await api.post(f"{API}/plans/{plan['id']}/features:batch", json={"features": [f]})
    ).status_code == 200

    act_as(uuid.uuid4())  # a different signed-in user
    p, s = plan["id"], site["id"]
    attempts = [
        api.get(f"{API}/sites/{s}/plans"),
        api.post(f"{API}/sites/{s}/plans", json={"name": "x"}),
        api.get(f"{API}/plans/{p}"),
        api.patch(f"{API}/plans/{p}", json={"name": "x"}),
        api.delete(f"{API}/plans/{p}"),
        api.get(f"{API}/plans/{p}/layers"),
        api.post(f"{API}/plans/{p}/layers", json={"name": "x"}),
        api.patch(f"{API}/layers/{lid}", json={"name": "x"}),
        api.delete(f"{API}/layers/{lid}"),
        api.get(f"{API}/plans/{p}/features"),
        api.post(f"{API}/plans/{p}/features", json=feat(lid, "element", POINT)),
        api.post(
            f"{API}/plans/{p}/features:batch", json={"features": [feat(lid, "element", POINT)]}
        ),
        api.get(f"{API}/features/{f['id']}"),
        api.patch(f"{API}/features/{f['id']}", json={"properties": {"x": 1}}),
        api.delete(f"{API}/features/{f['id']}"),
    ]
    for coro in attempts:
        resp = await coro
        assert resp.status_code in (403, 404), (resp.request.method, resp.request.url, resp.text)


async def test_owner_data_survives_non_owner_attempts(
    api: AsyncClient,
    act_as: Callable[[uuid.UUID], None],
    owner_id: uuid.UUID,
    plan: dict[str, Any],
) -> None:
    f = feat(layer_id(plan), "element", POINT)
    await api.post(f"{API}/plans/{plan['id']}/features:batch", json={"features": [f]})
    act_as(uuid.uuid4())
    await api.delete(f"{API}/features/{f['id']}")
    await api.delete(f"{API}/plans/{plan['id']}")
    act_as(owner_id)
    assert (await api.get(f"{API}/features/{f['id']}")).status_code == 200
    assert (await api.get(f"{API}/plans/{plan['id']}")).status_code == 200


async def test_unknown_resources_are_404(api: AsyncClient) -> None:
    missing = uuid.uuid4()
    assert (await api.get(f"{API}/plans/{missing}")).status_code == 404
    assert (await api.get(f"{API}/features/{missing}")).status_code == 404
    assert (await api.post(f"{API}/sites/{missing}/plans", json={"name": "x"})).status_code == 404


async def test_requires_authentication(engine: AsyncEngine) -> None:
    from httpx import ASGITransport

    from app.main import app

    # No dependency overrides: the real current_user dependency rejects cookie-less requests.
    app.dependency_overrides.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as anon:
        assert (await anon.get(f"{API}/element-types")).status_code == 401
        assert (await anon.get(f"{API}/plans/{uuid.uuid4()}")).status_code == 401
        resp = await anon.post(f"{API}/features:measure", json={"geometry": POINT})
        assert resp.status_code == 401


async def test_plan_name_rejects_null_but_description_can_be_cleared(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    url = f"{API}/plans/{plan['id']}"
    assert (await api.patch(url, json={"name": None})).status_code == 422
    response = await api.patch(url, json={"description": None})
    assert response.status_code == 200 and response.json()["description"] is None
    assert response.json()["name"] == plan["name"]


async def test_plan_goals_are_optional_validated_and_clearable(
    api: AsyncClient, plan: dict[str, Any]
) -> None:
    url = f"{API}/plans/{plan['id']}"
    assert plan["goals"] is None
    goals = {"priorities": ["water", "food", "water"], "vision": "A shady food forest."}
    response = await api.patch(url, json={"goals": goals})
    assert response.status_code == 200
    assert response.json()["goals"] == {
        "priorities": ["water", "food"],
        "vision": "A shady food forest.",
    }
    # Other edits leave the goals alone, and they come back on the detail read.
    assert (await api.patch(url, json={"name": "Renamed"})).json()["goals"]["vision"]
    assert (await api.get(url)).json()["goals"]["priorities"] == ["water", "food"]
    # Unknown priorities and over-long text are rejected; null clears.
    assert (await api.patch(url, json={"goals": {"priorities": ["gold"]}})).status_code == 422
    assert (await api.patch(url, json={"goals": {"vision": "x" * 2001}})).status_code == 422
    cleared = await api.patch(url, json={"goals": None})
    assert cleared.status_code == 200 and cleared.json()["goals"] is None


async def test_batch_conflict_after_precheck_rolls_back_every_write(
    api: AsyncClient, site: dict[str, Any], plan: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.planning.repository import PlanningRepository

    other = (await api.post(f"{API}/sites/{site['id']}/plans", json={"name": "Other"})).json()
    existing = feat(layer_id(other), "element", POINT, properties={"private": "other plan"})
    assert (
        await api.post(f"{API}/plans/{other['id']}/features:batch", json={"features": [existing]})
    ).status_code == 200

    async def stale_precheck(self, plan_id, ids):
        # Deterministically simulate a collision becoming visible only during the SQL write.
        return set()

    monkeypatch.setattr(PlanningRepository, "ids_in_other_plans", stale_precheck)
    good = feat(layer_id(plan), "element", POINT)
    clash = {**existing, "layer_id": layer_id(plan)}
    response = await api.post(
        f"{API}/plans/{plan['id']}/features:batch", json={"features": [good, clash]}
    )
    assert response.status_code == 409
    assert "private" not in response.text
    assert (await api.get(f"{API}/plans/{plan['id']}/features")).json()["features"] == []
    original = (await api.get(f"{API}/features/{existing['id']}")).json()
    assert original["plan_id"] == other["id"]
    assert original["properties"] == existing["properties"]


async def test_batch_deletes_are_atomic_and_scoped_to_the_plan(
    api: AsyncClient, site: dict[str, Any], plan: dict[str, Any]
) -> None:
    url = f"{API}/plans/{plan['id']}/features:batch"
    original = feat(layer_id(plan), "element", POINT)
    await api.post(url, json={"features": [original]})
    # A validation failure must not delete the original.
    bad = feat(str(uuid.uuid4()), "element", POINT)
    response = await api.post(url, json={"features": [bad], "deleted_ids": [original["id"]]})
    assert response.status_code == 422
    assert (await api.get(f"{API}/features/{original['id']}")).status_code == 200
    other = (await api.post(f"{API}/sites/{site['id']}/plans", json={"name": "Other"})).json()
    foreign = feat(layer_id(other), "element", POINT)
    await api.post(f"{API}/plans/{other['id']}/features:batch", json={"features": [foreign]})
    replacement = feat(layer_id(plan), "element", POINT)
    response = await api.post(
        url, json={"features": [replacement], "deleted_ids": [original["id"], foreign["id"]]}
    )
    assert response.status_code == 200
    assert (await api.get(f"{API}/features/{original['id']}")).status_code == 404
    assert (await api.get(f"{API}/features/{foreign['id']}")).status_code == 200
    assert (
        await api.post(url, json={"features": [], "deleted_ids": [replacement["id"]]})
    ).status_code == 200
    assert (
        await api.post(url, json={"features": [], "deleted_ids": [replacement["id"]]})
    ).status_code == 200
    assert (await api.get(f"{API}/plans/{plan['id']}/features")).json()["features"] == []


async def test_batch_cannot_delete_and_upsert_the_same_id(api: AsyncClient, plan: dict[str, Any]):
    item = feat(layer_id(plan), "element", POINT)
    response = await api.post(
        f"{API}/plans/{plan['id']}/features:batch",
        json={"features": [item], "deleted_ids": [item["id"]]},
    )
    assert response.status_code == 422
