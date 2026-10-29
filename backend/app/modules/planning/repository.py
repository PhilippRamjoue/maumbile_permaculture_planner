"""Data access for the planning domain: the only layer that touches the DB session."""

from __future__ import annotations

import copy
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from geoalchemy2 import Geography
from geoalchemy2.shape import from_shape
from shapely.geometry.base import BaseGeometry
from sqlalchemy import ColumnElement, case, cast, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.geo import WGS84_SRID
from app.modules.planning.models import ElementType, Feature, Layer, Plan


@dataclass(frozen=True)
class MeasuredFeature:
    """A stored feature plus its authoritative PostGIS measurements."""

    feature: Feature
    length_m: float
    area_m2: float


@dataclass(frozen=True)
class ImportLayerRow:
    """A layer to create when importing a plan from a portable bundle."""

    name: str
    role: str | None
    sort_order: int
    visible: bool


@dataclass(frozen=True)
class ImportFeatureRow:
    """A feature to create on import: geometry already parsed, element type already resolved."""

    feature_type: str
    element_type_id: int | None
    layer_index: int
    shape: BaseGeometry
    properties: dict[str, Any]


class FeatureWriteConflict(Exception):
    """A batch collided with an id owned by another plan; the entire write was rolled back."""


class StaleDesign(Exception):
    """The caller's revision no longer matches the stored design."""


def _measures(geometry: Any) -> tuple[ColumnElement[float], ColumnElement[float]]:
    """``(length_m, area_m2)`` SQL expressions for a geometry, measured on the geography.

    Length is the line length, or the perimeter for a polygon; area is zero for non-polygons.
    """
    geog = cast(geometry, Geography)
    length = case(
        (func.GeometryType(geometry) == "POLYGON", func.ST_Perimeter(geog)),
        else_=func.ST_Length(geog),
    )
    return length, func.ST_Area(geog)


class PlanningRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── element types ──────────────────────────────────────────────────────────────────────
    async def list_element_types(self) -> list[ElementType]:
        stmt = select(ElementType).order_by(ElementType.sort_order, ElementType.id)
        return list((await self._session.execute(stmt)).scalars())

    async def existing_element_type_ids(self, ids: set[int]) -> set[int]:
        if not ids:
            return set()
        stmt = select(ElementType.id).where(ElementType.id.in_(ids))
        return set((await self._session.execute(stmt)).scalars())

    # ── plans ──────────────────────────────────────────────────────────────────────────────
    async def get_plan(self, plan_id: uuid.UUID, *, lock: bool = False) -> Plan | None:
        """Fetch a non-deleted plan."""
        stmt = select(Plan).where(Plan.id == plan_id, Plan.deleted_at.is_(None))
        if lock:
            stmt = stmt.with_for_update()
        return (
            await self._session.execute(stmt.execution_options(populate_existing=True))
        ).scalar_one_or_none()

    async def advance_plan(
        self, plan_id: uuid.UUID, expected: int | None = None, *, legacy: bool = True
    ) -> None:
        stmt = update(Plan).where(Plan.id == plan_id, Plan.deleted_at.is_(None))
        if expected is not None:
            stmt = stmt.where(Plan.revision == expected)
        elif legacy:
            stmt = stmt.where(Plan.revision_required.is_(False))
        values: dict[str, Any] = {"revision": Plan.revision + 1, "updated_at": func.now()}
        if expected is not None:
            values["revision_required"] = True
        result = await self._session.execute(stmt.values(**values).returning(Plan.id))
        if result.scalar_one_or_none() is None:
            raise StaleDesign

    async def commit(self) -> None:
        await self._session.commit()

    async def write_layers(self, plan_id: uuid.UUID, layers: Sequence[dict[str, Any]]) -> None:
        for values in layers:
            layer_id = values["id"]
            changes = {k: v for k, v in values.items() if k != "id" and v is not None}
            if changes:
                await self._session.execute(
                    update(Layer)
                    .where(Layer.id == layer_id, Layer.plan_id == plan_id)
                    .values(**changes)
                )

    async def write_goals(self, plan: Plan, goals: dict[str, Any] | None) -> None:
        plan.goals = goals
        await self._session.flush()

    async def list_plans(
        self, site_id: uuid.UUID, limit: int, offset: int
    ) -> tuple[list[Plan], int]:
        live = (Plan.site_id == site_id, Plan.deleted_at.is_(None))
        total = (
            await self._session.execute(select(func.count()).select_from(Plan).where(*live))
        ).scalar_one()
        stmt = (
            select(Plan)
            .where(*live)
            .order_by(Plan.created_at.desc(), Plan.id)
            .limit(limit)
            .offset(offset)
        )
        return list((await self._session.execute(stmt)).scalars()), int(total)

    async def add_plan(self, plan: Plan, layers: Sequence[Layer]) -> Plan:
        """Insert a plan together with its initial layers, atomically."""
        self._session.add(plan)
        await self._session.flush()
        for layer in layers:
            layer.plan_id = plan.id
        self._session.add_all(layers)
        await self._session.commit()
        await self._session.refresh(plan)
        return plan

    async def duplicate_plan(self, source: Plan, name: str) -> Plan:
        """Copy a plan's layers, features and goals into a new plan, in one transaction.

        The source row is locked first, so a save in flight cannot leave the copy with half of an
        edit. Every layer and feature gets a fresh id (a feature id belongs to one plan for good;
        reusing one would be a cross-plan write), and features are pointed at the new layers.
        Timestamps carry over, so lists keep their order.
        """
        locked = await self.get_plan(source.id, lock=True)
        if locked is None:  # deleted while we waited for the lock
            raise StaleDesign
        duplicate = Plan(
            site_id=locked.site_id,
            name=name,
            description=locked.description,
            goals=copy.deepcopy(locked.goals),
        )
        self._session.add(duplicate)
        await self._session.flush()
        layer_ids: dict[uuid.UUID, uuid.UUID] = {}
        for layer in await self.list_layers(locked.id):
            layer_ids[layer.id] = uuid.uuid4()
            self._session.add(
                Layer(
                    id=layer_ids[layer.id],
                    plan_id=duplicate.id,
                    name=layer.name,
                    role=layer.role,
                    sort_order=layer.sort_order,
                    visible=layer.visible,
                    created_at=layer.created_at,
                )
            )
        await self._session.flush()  # the layers exist before features point at them
        stored = await self._session.execute(select(Feature).where(Feature.plan_id == locked.id))
        for feature in stored.scalars():
            self._session.add(
                Feature(
                    id=uuid.uuid4(),
                    plan_id=duplicate.id,
                    layer_id=layer_ids[feature.layer_id],
                    geometry=feature.geometry,
                    feature_type=feature.feature_type,
                    element_type_id=feature.element_type_id,
                    properties=copy.deepcopy(feature.properties),
                    created_at=feature.created_at,
                    updated_at=feature.updated_at,
                )
            )
        await self._session.commit()
        await self._session.refresh(duplicate)
        return duplicate

    async def import_plan(
        self,
        site_id: uuid.UUID,
        *,
        name: str,
        description: str | None,
        goals: dict[str, Any] | None,
        layers: Sequence[ImportLayerRow],
        features: Sequence[ImportFeatureRow],
    ) -> Plan:
        """Create a plan with its layers and features from already-validated bundle data.

        Every layer and feature gets a fresh id, and features point at the new layers by index.
        No id is ever taken from the bundle, so an import can never write across another plan.
        One transaction, like :meth:`duplicate_plan`.
        """
        plan = Plan(site_id=site_id, name=name, description=description, goals=copy.deepcopy(goals))
        self._session.add(plan)
        await self._session.flush()
        layer_ids: list[uuid.UUID] = []
        for spec in layers:
            layer_id = uuid.uuid4()
            layer_ids.append(layer_id)
            self._session.add(
                Layer(
                    id=layer_id,
                    plan_id=plan.id,
                    name=spec.name,
                    role=spec.role,
                    sort_order=spec.sort_order,
                    visible=spec.visible,
                )
            )
        await self._session.flush()  # the layers exist before features point at them
        for feature in features:
            self._session.add(
                Feature(
                    id=uuid.uuid4(),
                    plan_id=plan.id,
                    layer_id=layer_ids[feature.layer_index],
                    geometry=_to_wkb(feature.shape),
                    feature_type=feature.feature_type,
                    element_type_id=feature.element_type_id,
                    properties=copy.deepcopy(feature.properties),
                )
            )
        await self._session.commit()
        await self._session.refresh(plan)
        return plan

    async def update_plan(self, plan: Plan, **values: Any) -> Plan:
        await self.advance_plan(plan.id, legacy="goals" in values)
        for key, value in values.items():
            setattr(plan, key, value)
        await self._session.commit()
        await self._session.refresh(plan)
        return plan

    async def soft_delete_plan(self, plan: Plan) -> None:
        await self.advance_plan(plan.id, legacy=False)
        plan.deleted_at = datetime.now(UTC)
        await self._session.commit()

    # ── layers ─────────────────────────────────────────────────────────────────────────────
    async def list_layers(self, plan_id: uuid.UUID) -> list[Layer]:
        stmt = select(Layer).where(Layer.plan_id == plan_id).order_by(Layer.sort_order, Layer.id)
        return list((await self._session.execute(stmt)).scalars())

    async def get_layer(self, layer_id: uuid.UUID) -> Layer | None:
        return (
            await self._session.execute(select(Layer).where(Layer.id == layer_id))
        ).scalar_one_or_none()

    async def next_layer_order(self, plan_id: uuid.UUID) -> int:
        stmt = select(func.coalesce(func.max(Layer.sort_order) + 1, 0)).where(
            Layer.plan_id == plan_id
        )
        return int((await self._session.execute(stmt)).scalar_one())

    async def add_layer(self, layer: Layer) -> Layer:
        await self.advance_plan(layer.plan_id)
        self._session.add(layer)
        await self._session.commit()
        await self._session.refresh(layer)
        return layer

    async def update_layer(self, layer: Layer, **values: Any) -> Layer:
        await self.advance_plan(layer.plan_id)
        for key, value in values.items():
            setattr(layer, key, value)
        await self._session.commit()
        await self._session.refresh(layer)
        return layer

    async def delete_layer(self, layer: Layer) -> None:
        """Delete a layer; its features go with it (``ON DELETE CASCADE``)."""
        await self.advance_plan(layer.plan_id)
        await self._session.delete(layer)
        await self._session.commit()

    async def layer_ids_in_plan(self, plan_id: uuid.UUID, ids: set[uuid.UUID]) -> set[uuid.UUID]:
        if not ids:
            return set()
        stmt = select(Layer.id).where(Layer.plan_id == plan_id, Layer.id.in_(ids))
        return set((await self._session.execute(stmt)).scalars())

    # ── features ───────────────────────────────────────────────────────────────────────────
    def _measured_select(self) -> Any:
        length, area = _measures(Feature.geometry)
        return select(Feature, length.label("length_m"), area.label("area_m2"))

    async def get_feature(self, feature_id: uuid.UUID) -> MeasuredFeature | None:
        stmt = self._measured_select().where(Feature.id == feature_id)
        row = (await self._session.execute(stmt.execution_options(populate_existing=True))).first()
        return None if row is None else MeasuredFeature(row[0], float(row[1]), float(row[2]))

    async def get_features(
        self, plan_id: uuid.UUID, feature_ids: Sequence[uuid.UUID]
    ) -> list[MeasuredFeature]:
        """Features by id, in the order requested (missing ids are skipped)."""
        stmt = self._measured_select().where(
            Feature.plan_id == plan_id, Feature.id.in_(feature_ids)
        )
        rows = (await self._session.execute(stmt.execution_options(populate_existing=True))).all()
        by_id = {r[0].id: MeasuredFeature(r[0], float(r[1]), float(r[2])) for r in rows}
        return [by_id[i] for i in feature_ids if i in by_id]

    async def list_features(
        self,
        plan_id: uuid.UUID,
        layer_id: uuid.UUID | None = None,
        feature_type: str | None = None,
    ) -> list[MeasuredFeature]:
        stmt = self._measured_select().where(Feature.plan_id == plan_id)
        if layer_id is not None:
            stmt = stmt.where(Feature.layer_id == layer_id)
        if feature_type is not None:
            stmt = stmt.where(Feature.feature_type == feature_type)
        stmt = stmt.order_by(Feature.created_at, Feature.id)
        rows = (await self._session.execute(stmt)).all()
        return [MeasuredFeature(r[0], float(r[1]), float(r[2])) for r in rows]

    async def ids_in_other_plans(self, plan_id: uuid.UUID, ids: set[uuid.UUID]) -> set[uuid.UUID]:
        """Of ``ids``, those already used by a feature of a *different* plan."""
        if not ids:
            return set()
        stmt = select(Feature.id).where(Feature.id.in_(ids), Feature.plan_id != plan_id)
        return set((await self._session.execute(stmt)).scalars())

    async def upsert_features(
        self,
        plan_id: uuid.UUID,
        rows: Sequence[dict[str, Any]],
        deleted_ids: Sequence[uuid.UUID] = (),
        *,
        commit: bool = True,
    ) -> None:
        """Insert-or-update features keyed by id in one statement/transaction.

        Each row: ``id, layer_id, feature_type, element_type_id, properties`` plus ``shape``
        (a Shapely geometry, stored as WGS84). The ``WHERE plan_id`` guard makes it impossible
        to overwrite another plan's feature even under a race with the pre-check.
        """
        if commit:
            await self.advance_plan(plan_id)
        if not rows:
            if deleted_ids:
                await self._session.execute(
                    delete(Feature).where(Feature.plan_id == plan_id, Feature.id.in_(deleted_ids))
                )
            if commit:
                await self._session.commit()
            return
        values = [
            {
                "id": r["id"],
                "plan_id": plan_id,
                "layer_id": r["layer_id"],
                "geometry": _to_wkb(r["shape"]),
                "feature_type": r["feature_type"],
                "element_type_id": r["element_type_id"],
                "properties": r["properties"],
            }
            for r in rows
        ]
        stmt = pg_insert(Feature).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=[Feature.id],
            set_={
                "layer_id": stmt.excluded.layer_id,
                "geometry": stmt.excluded.geometry,
                "feature_type": stmt.excluded.feature_type,
                "element_type_id": stmt.excluded.element_type_id,
                "properties": stmt.excluded.properties,
                "updated_at": func.now(),
            },
            where=Feature.plan_id == stmt.excluded.plan_id,
        )
        result = await self._session.execute(stmt.returning(Feature.id))
        if len(result.scalars().all()) != len(rows):
            await self._session.rollback()
            raise FeatureWriteConflict
        if deleted_ids:
            await self._session.execute(
                delete(Feature).where(Feature.plan_id == plan_id, Feature.id.in_(deleted_ids))
            )
        if commit:
            await self._session.commit()

    async def update_feature(self, feature: Feature, **values: Any) -> None:
        await self.advance_plan(feature.plan_id)
        if "shape" in values:
            feature.geometry = _to_wkb(values.pop("shape"))
        for key, value in values.items():
            setattr(feature, key, value)
        await self._session.commit()

    async def delete_feature(self, feature: Feature) -> None:
        await self.advance_plan(feature.plan_id)
        await self._session.execute(delete(Feature).where(Feature.id == feature.id))
        await self._session.commit()

    # ── measurement ────────────────────────────────────────────────────────────────────────
    async def measure(self, shape: BaseGeometry) -> tuple[float, float]:
        """Authoritative ``(length_m, area_m2)`` of a geometry via PostGIS on the geography."""
        geom = func.ST_SetSRID(func.ST_GeomFromText(shape.wkt), WGS84_SRID)
        length, area = _measures(geom)
        row = (await self._session.execute(select(length, area))).one()
        return float(row[0]), float(row[1])


def _to_wkb(shape: BaseGeometry) -> Any:
    return from_shape(shape, srid=WGS84_SRID)
