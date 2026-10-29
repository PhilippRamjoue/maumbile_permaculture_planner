"""Request/response models for the planning API.

Features travel as GeoJSON ``Feature`` objects: ``id``, ``geometry`` and ``properties`` are the
standard members; ``layer_id``, ``feature_type`` and ``element_type_id`` are foreign members
(RFC 7946 §6.1), so the same shape is used for input and output.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.planning.validation import (
    FeatureValidationError,
    parse_geometry,
    validate_feature,
)

FeatureType = Literal["zone", "sector", "element", "path", "annotation"]
MAX_BATCH_SIZE = 1000


# ── element types ──────────────────────────────────────────────────────────────────────────
class ElementTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    name: str
    category: str
    feature_type: FeatureType
    geometry_type: Literal["point", "line", "polygon"]
    icon: str | None
    default_style: dict[str, Any]
    default_properties: dict[str, Any]
    # ``round`` / ``rect`` entries drop a to-scale footprint with one click: a circle of the
    # diameter, or a rectangle of width (east-west) by length (north-south), in metres.
    shape: Literal["point", "line", "area", "round", "rect"]
    default_width_m: float | None
    default_length_m: float | None
    default_diameter_m: float | None
    sort_order: int


# ── plans ──────────────────────────────────────────────────────────────────────────────────
GoalPriority = Literal[
    "water",
    "food",
    "income",
    "habitat",
    "beauty",
    "shelter",
    "education",
    "low_maintenance",
]


class PlanGoals(BaseModel):
    """What the owner wants from the land: the starting point of a permaculture design."""

    priorities: list[GoalPriority] = Field(default_factory=list, max_length=8)
    vision: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def _unique(self) -> PlanGoals:
        self.priorities = list(dict.fromkeys(self.priorities))
        return self


class PlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)


class PlanDuplicate(BaseModel):
    """Optional body of a duplicate request; without a name the copy is "<name> (copy)"."""

    name: str | None = Field(default=None, min_length=1, max_length=200)


class PlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    # Omitted -> untouched; null -> cleared.
    goals: PlanGoals | None = None


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    description: str | None
    goals: PlanGoals | None
    revision: int
    created_at: datetime
    updated_at: datetime


# ── layers ─────────────────────────────────────────────────────────────────────────────────
class LayerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    # Omitted -> appended after the existing layers.
    sort_order: int | None = Field(default=None, ge=0)
    visible: bool = True


class LayerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    sort_order: int | None = Field(default=None, ge=0)
    visible: bool | None = None


class LayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_id: uuid.UUID
    name: str
    role: FeatureType | None
    sort_order: int
    visible: bool
    created_at: datetime


class PlanDetail(PlanRead):
    layers: list[LayerRead]


# ── features ───────────────────────────────────────────────────────────────────────────────
class FeatureCreate(BaseModel):
    """A feature to create. ``id`` is optional here (server-generated) but required in a batch."""

    type: Literal["Feature"] = "Feature"
    id: uuid.UUID | None = None
    layer_id: uuid.UUID
    feature_type: FeatureType
    element_type_id: int | None = None
    geometry: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate(self) -> FeatureCreate:
        try:
            validate_feature(self.feature_type, parse_geometry(self.geometry), self.properties)
        except FeatureValidationError as exc:
            raise ValueError(str(exc)) from exc
        return self


class FeatureUpsert(FeatureCreate):
    id: uuid.UUID  # required for the idempotent batch


class FeatureUpdate(BaseModel):
    """Partial update; omitted fields are untouched. ``properties`` replaces the whole object."""

    layer_id: uuid.UUID | None = None
    feature_type: FeatureType | None = None
    element_type_id: int | None = None
    geometry: dict[str, Any] | None = None
    properties: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _validate(self) -> FeatureUpdate:
        # Cross-field rules need the stored values too; the service re-checks the merged
        # feature. Here we only reject what is wrong in isolation.
        if self.geometry is not None:
            try:
                parse_geometry(self.geometry)
            except FeatureValidationError as exc:
                raise ValueError(str(exc)) from exc
        return self


class FeatureRead(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: uuid.UUID
    plan_id: uuid.UUID
    layer_id: uuid.UUID
    feature_type: FeatureType
    element_type_id: int | None
    geometry: dict[str, Any]
    properties: dict[str, Any]
    # Authoritative PostGIS measurements (geography): length of a line / perimeter of a polygon
    # in metres, and polygon area in square metres. Zero where not applicable.
    length_m: float
    area_m2: float
    created_at: datetime
    updated_at: datetime


class FeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[FeatureRead]


class FeatureBatch(BaseModel):
    features: list[FeatureUpsert] = Field(max_length=MAX_BATCH_SIZE)
    deleted_ids: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_BATCH_SIZE)

    @model_validator(mode="after")
    def _unique_ids(self) -> FeatureBatch:
        ids = [f.id for f in self.features]
        if len(ids) != len(set(ids)):
            raise ValueError("Feature ids must be unique within a batch.")
        if len(set(self.deleted_ids)) != len(self.deleted_ids) or set(ids) & set(self.deleted_ids):
            raise ValueError("Deleted ids must be unique and cannot also be upserted.")
        return self


class DesignLayer(LayerUpdate):
    id: uuid.UUID


class DesignWrite(FeatureBatch):
    """One guarded transaction; omitted domains are left untouched."""

    expected_revision: int = Field(ge=0)
    features: list[FeatureUpsert] = Field(default_factory=list, max_length=MAX_BATCH_SIZE)
    layers: list[DesignLayer] = Field(default_factory=list, max_length=100)
    goals: PlanGoals | None = None

    @model_validator(mode="after")
    def _unique_layers(self) -> DesignWrite:
        if len({layer.id for layer in self.layers}) != len(self.layers):
            raise ValueError("Layer ids must be unique.")
        return self


class DesignRead(BaseModel):
    plan: PlanDetail
    features: FeatureCollection


# ── measurement ────────────────────────────────────────────────────────────────────────────
class MeasureRequest(BaseModel):
    geometry: dict[str, Any]

    @model_validator(mode="after")
    def _validate(self) -> MeasureRequest:
        try:
            parse_geometry(self.geometry)
        except FeatureValidationError as exc:
            raise ValueError(str(exc)) from exc
        return self


class Measurement(BaseModel):
    length_m: float
    area_m2: float
