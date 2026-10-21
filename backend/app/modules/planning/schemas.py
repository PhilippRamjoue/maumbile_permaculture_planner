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
    sort_order: int


# ── plans ──────────────────────────────────────────────────────────────────────────────────
class PlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)


class PlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    description: str | None
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

    @model_validator(mode="after")
    def _unique_ids(self) -> FeatureBatch:
        ids = [f.id for f in self.features]
        if len(ids) != len(set(ids)):
            raise ValueError("Feature ids must be unique within a batch.")
        return self


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
