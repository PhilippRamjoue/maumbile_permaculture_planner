"""The export module's own view of a plan: plain data, no ORM objects, no database."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class ExportLayer:
    id: uuid.UUID
    name: str
    sort_order: int
    visible: bool
    role: str | None = None


@dataclass(frozen=True)
class ExportElementType:
    id: int
    key: str
    name: str
    feature_type: str
    geometry_type: str
    default_style: dict[str, Any]
    # A glyph key of ``planning.icons`` (None: drawn as a styled line or area).
    icon: str | None = None


@dataclass(frozen=True)
class ExportFeature:
    id: uuid.UUID
    layer_id: uuid.UUID
    feature_type: str
    element_type_id: int | None
    geometry: dict[str, Any]
    properties: dict[str, Any]
    length_m: float
    area_m2: float


@dataclass(frozen=True)
class PlanDocument:
    """Everything an export needs, frozen at one moment."""

    plan_id: uuid.UUID
    name: str
    description: str | None
    updated_at: datetime
    site_name: str
    boundary: dict[str, Any]  # GeoJSON Polygon (WGS84)
    layers: list[ExportLayer]
    features: list[ExportFeature]
    element_types: dict[int, ExportElementType] = field(default_factory=dict)
    # ``{"priorities": [...], "vision": "..."}`` as stored on the plan, if the owner set any.
    goals: dict[str, Any] | None = None
