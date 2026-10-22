"""Business logic for plans, layers and features. No FastAPI imports.

Ownership is plan -> site -> owner, checked through the ``SiteAccess`` port so this module
never reaches into the sites module's internals.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

from geoalchemy2.shape import to_shape

from app.core.geo import shape_to_geojson
from app.modules.planning.models import ElementType, Layer, Plan
from app.modules.planning.repository import (
    FeatureWriteConflict,
    MeasuredFeature,
    PlanningRepository,
)
from app.modules.planning.validation import (
    FeatureValidationError,
    parse_geometry,
    validate_feature,
)

DEFAULT_LAYERS = ("Zones", "Sectors", "Elements", "Paths", "Annotations")


class PlanningError(Exception):
    """Base class for domain errors raised by the planning service."""


class NotFoundError(PlanningError):
    def __init__(self, what: str) -> None:
        super().__init__(f"{what} not found")


class ForbiddenError(PlanningError):
    """The caller does not own the site the resource belongs to."""


class ConflictError(PlanningError):
    """The request clashes with existing data (e.g. a feature id owned by another plan)."""


class InvalidFeatureError(PlanningError):
    """A feature failed validation (geometry, typed properties, or a bad reference)."""


class SiteAccess(Protocol):
    """Port to the sites module: raise NotFoundError / ForbiddenError unless the caller owns it."""

    async def ensure_owner(self, site_id: uuid.UUID, owner_id: uuid.UUID) -> None: ...


@dataclass(frozen=True)
class FeatureInput:
    layer_id: uuid.UUID
    feature_type: str
    geometry: dict[str, Any]
    element_type_id: int | None = None
    properties: dict[str, Any] = field(default_factory=dict)
    id: uuid.UUID | None = None


class PlanningService:
    def __init__(self, repo: PlanningRepository, sites: SiteAccess) -> None:
        self._repo = repo
        self._sites = sites

    # ── catalog & measurement ──────────────────────────────────────────────────────────────
    async def list_element_types(self) -> list[ElementType]:
        return await self._repo.list_element_types()

    async def measure(self, geometry: dict[str, Any]) -> tuple[float, float]:
        shape = self._parse(geometry)
        return await self._repo.measure(shape)

    # ── plans ──────────────────────────────────────────────────────────────────────────────
    async def _plan(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> Plan:
        plan = await self._repo.get_plan(plan_id)
        if plan is None:
            raise NotFoundError("Plan")
        await self._sites.ensure_owner(plan.site_id, owner_id)
        return plan

    async def create_plan(
        self, site_id: uuid.UUID, owner_id: uuid.UUID, *, name: str, description: str | None
    ) -> Plan:
        await self._sites.ensure_owner(site_id, owner_id)
        layers = [Layer(name=n, sort_order=i, visible=True) for i, n in enumerate(DEFAULT_LAYERS)]
        return await self._repo.add_plan(
            Plan(site_id=site_id, name=name, description=description), layers
        )

    async def list_plans(
        self, site_id: uuid.UUID, owner_id: uuid.UUID, limit: int, offset: int
    ) -> tuple[list[Plan], int]:
        await self._sites.ensure_owner(site_id, owner_id)
        return await self._repo.list_plans(site_id, limit, offset)

    async def get_plan(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> tuple[Plan, list[Layer]]:
        plan = await self._plan(plan_id, owner_id)
        return plan, await self._repo.list_layers(plan.id)

    async def update_plan(self, plan_id: uuid.UUID, owner_id: uuid.UUID, **changes: Any) -> Plan:
        plan = await self._plan(plan_id, owner_id)
        return await self._repo.update_plan(plan, **changes)

    async def delete_plan(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        await self._repo.soft_delete_plan(await self._plan(plan_id, owner_id))

    # ── layers ─────────────────────────────────────────────────────────────────────────────
    async def _layer(self, layer_id: uuid.UUID, owner_id: uuid.UUID) -> Layer:
        layer = await self._repo.get_layer(layer_id)
        if layer is None:
            raise NotFoundError("Layer")
        await self._plan(layer.plan_id, owner_id)  # also hides layers of deleted plans
        return layer

    async def list_layers(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> list[Layer]:
        await self._plan(plan_id, owner_id)
        return await self._repo.list_layers(plan_id)

    async def create_layer(
        self,
        plan_id: uuid.UUID,
        owner_id: uuid.UUID,
        *,
        name: str,
        sort_order: int | None,
        visible: bool,
    ) -> Layer:
        await self._plan(plan_id, owner_id)
        if sort_order is None:
            sort_order = await self._repo.next_layer_order(plan_id)
        return await self._repo.add_layer(
            Layer(plan_id=plan_id, name=name, sort_order=sort_order, visible=visible)
        )

    async def update_layer(self, layer_id: uuid.UUID, owner_id: uuid.UUID, **changes: Any) -> Layer:
        layer = await self._layer(layer_id, owner_id)
        return await self._repo.update_layer(layer, **changes)

    async def delete_layer(self, layer_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        await self._repo.delete_layer(await self._layer(layer_id, owner_id))

    # ── features ───────────────────────────────────────────────────────────────────────────
    @staticmethod
    def _parse(geometry: dict[str, Any]) -> Any:
        try:
            return parse_geometry(geometry)
        except FeatureValidationError as exc:
            raise InvalidFeatureError(str(exc)) from exc

    def _prepare(self, item: FeatureInput) -> dict[str, Any]:
        """Validate one feature and return the row values (with a parsed ``shape``)."""
        shape = self._parse(item.geometry)
        try:
            validate_feature(item.feature_type, shape, item.properties)
        except FeatureValidationError as exc:
            raise InvalidFeatureError(str(exc)) from exc
        return {
            "id": item.id if item.id is not None else uuid.uuid4(),
            "layer_id": item.layer_id,
            "feature_type": item.feature_type,
            "element_type_id": item.element_type_id,
            "properties": item.properties,
            "shape": shape,
        }

    async def _check_references(self, plan_id: uuid.UUID, rows: Sequence[dict[str, Any]]) -> None:
        layer_ids = {r["layer_id"] for r in rows}
        missing_layers = layer_ids - await self._repo.layer_ids_in_plan(plan_id, layer_ids)
        if missing_layers:
            raise InvalidFeatureError(
                "Unknown layer_id for this plan: " + ", ".join(sorted(map(str, missing_layers)))
            )
        type_ids = {r["element_type_id"] for r in rows if r["element_type_id"] is not None}
        missing_types = type_ids - await self._repo.existing_element_type_ids(type_ids)
        if missing_types:
            raise InvalidFeatureError(
                "Unknown element_type_id: " + ", ".join(map(str, sorted(missing_types)))
            )

    async def list_features(
        self,
        plan_id: uuid.UUID,
        owner_id: uuid.UUID,
        *,
        layer_id: uuid.UUID | None = None,
        feature_type: str | None = None,
    ) -> list[MeasuredFeature]:
        await self._plan(plan_id, owner_id)
        return await self._repo.list_features(plan_id, layer_id, feature_type)

    async def upsert_features(
        self,
        plan_id: uuid.UUID,
        owner_id: uuid.UUID,
        items: Sequence[FeatureInput],
        deleted_ids: Sequence[uuid.UUID] = (),
    ) -> list[MeasuredFeature]:
        """Idempotent batch upsert keyed by feature id; all-or-nothing. Returns input order."""
        await self._plan(plan_id, owner_id)
        rows = [self._prepare(i) for i in items]
        ids = [r["id"] for r in rows]
        if len(set(ids)) != len(ids):
            raise InvalidFeatureError("Feature ids must be unique within a batch.")
        await self._check_references(plan_id, rows)
        taken = await self._repo.ids_in_other_plans(plan_id, set(ids))
        if taken:
            raise ConflictError(
                "Feature ids already used by another plan: " + ", ".join(sorted(map(str, taken)))
            )
        try:
            await self._repo.upsert_features(plan_id, rows, deleted_ids)
        except FeatureWriteConflict as exc:
            raise ConflictError("Feature ids already used by another plan") from exc
        return await self._repo.get_features(plan_id, ids)

    async def create_feature(
        self, plan_id: uuid.UUID, owner_id: uuid.UUID, item: FeatureInput
    ) -> MeasuredFeature:
        """Create one feature; unlike the batch, an existing id is a conflict, not an update."""
        await self._plan(plan_id, owner_id)
        if item.id is not None and await self._repo.get_feature(item.id) is not None:
            raise ConflictError(f"Feature {item.id} already exists")
        (created,) = await self.upsert_features(plan_id, owner_id, [item])
        return created

    async def _feature(self, feature_id: uuid.UUID, owner_id: uuid.UUID) -> MeasuredFeature:
        found = await self._repo.get_feature(feature_id)
        if found is None:
            raise NotFoundError("Feature")
        await self._plan(found.feature.plan_id, owner_id)
        return found

    async def get_feature(self, feature_id: uuid.UUID, owner_id: uuid.UUID) -> MeasuredFeature:
        return await self._feature(feature_id, owner_id)

    async def update_feature(
        self, feature_id: uuid.UUID, owner_id: uuid.UUID, **changes: Any
    ) -> MeasuredFeature:
        """Partial update. The merged feature is re-validated as a whole."""
        current = (await self._feature(feature_id, owner_id)).feature
        merged = FeatureInput(
            id=current.id,
            layer_id=changes.get("layer_id") or current.layer_id,
            feature_type=changes.get("feature_type") or current.feature_type,
            element_type_id=changes.get("element_type_id", current.element_type_id),
            geometry=changes.get("geometry") or shape_to_geojson(to_shape(current.geometry)),
            properties=(
                changes["properties"]
                if changes.get("properties") is not None
                else current.properties
            ),
        )
        row = self._prepare(merged)
        await self._check_references(current.plan_id, [row])
        await self._repo.update_feature(
            current,
            layer_id=row["layer_id"],
            feature_type=row["feature_type"],
            element_type_id=row["element_type_id"],
            properties=row["properties"],
            shape=row["shape"],
        )
        refreshed = await self._repo.get_feature(feature_id)
        assert refreshed is not None
        return refreshed

    async def delete_feature(self, feature_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        await self._repo.delete_feature((await self._feature(feature_id, owner_id)).feature)
