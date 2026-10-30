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
class ExportSlopeClass:
    """One slope band of the legend: its colour, percentage range and share of the land."""

    label: str
    min_pct: float
    max_pct: float | None
    color: str
    area_fraction: float


@dataclass(frozen=True)
class ExportSlopeGrid:
    """Slope class per DEM cell over the site bbox. ``classes[row][col]`` indexes the legend
    (None = unknown); row 0 is the northern edge. Cell ``(row, col)`` has its north-west corner
    at lon ``west + col*pixel_width_deg``, lat ``north - row*pixel_height_deg``."""

    west: float
    north: float
    pixel_width_deg: float
    pixel_height_deg: float
    width: int
    height: int
    classes: list[list[int | None]]


@dataclass(frozen=True)
class ExportContour:
    elevation_m: float
    index: bool  # an index contour, drawn heavier and labelled
    geometry: dict[str, Any]  # GeoJSON MultiLineString (WGS84)


@dataclass(frozen=True)
class ExportTerrain:
    """A site's computed terrain, ready to draw on its own export page. Any part may be missing."""

    contour_interval_m: float
    attribution: str | None
    legend: list[ExportSlopeClass]
    grid: ExportSlopeGrid | None
    contours: list[ExportContour]
    elevation_m: dict[str, float] | None  # min / max / mean / relief
    slope_pct: dict[str, float] | None  # mean / max
    flags: list[str]


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
    # The site's slope/contour terrain, when it has been computed; drawn on its own page.
    terrain: ExportTerrain | None = None
