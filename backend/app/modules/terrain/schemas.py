"""Request/response models for the terrain endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

TerrainStatus = Literal["not_requested", "pending", "running", "ready", "failed", "interrupted"]

# 30 m DEMs carry metre-level vertical error; below ~0.5 m a contour is pure noise, and above
# 100 m a site shows none.
MIN_INTERVAL_M = 0.5
MAX_INTERVAL_M = 100.0


class TerrainRequestBody(BaseModel):
    """Optional body of ``POST /sites/{id}/terrain``."""

    contour_interval_m: float | None = Field(
        default=None,
        ge=MIN_INTERVAL_M,
        le=MAX_INTERVAL_M,
        description="Vertical spacing of contour lines; omit to keep the stored/default one.",
    )


class ContourFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: dict[str, Any]  # GeoJSON MultiLineString
    properties: dict[str, Any]  # {"elevation_m": float, "index": bool}


class ContourCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[ContourFeature]


class SlopeClass(BaseModel):
    label: str
    min_pct: float
    max_pct: float | None
    color: str
    area_fraction: float


class SlopeGrid(BaseModel):
    """Slope class per DEM cell over the site bbox, for rendering an overlay.

    ``classes[row][col]`` indexes ``slope.legend`` (null = unknown); row 0 is the northern edge.
    Cell ``(row, col)`` spans lon ``west + col*pixel_width_deg`` and
    lat ``north - row*pixel_height_deg`` (its north-west corner).
    """

    west: float
    north: float
    pixel_width_deg: float
    pixel_height_deg: float
    width: int
    height: int
    classes: list[list[int | None]]


class SlopeSummary(BaseModel):
    elevation_m: dict[str, float]  # min / max / mean / relief
    slope_pct: dict[str, float]  # mean / max
    slope_deg: dict[str, float]  # mean / max
    valid_fraction: float
    contour_count: int
    legend: list[SlopeClass]
    # "ocean", "flat", "partial_nodata", "no_contours": situations the UI should explain.
    flags: list[str]


class TerrainRead(BaseModel):
    site_id: uuid.UUID
    status: TerrainStatus
    contour_interval_m: float | None = None
    dem_source: str | None = None
    attribution: str | None = None
    resolution_m: float | None = None
    error: str | None = None
    requested_at: datetime | None = None
    computed_at: datetime | None = None
    # Present only when status == "ready".
    contours: ContourCollection | None = None
    slope: SlopeSummary | None = None
    slope_grid: SlopeGrid | None = None
    notice: str = "Planning aid only: derived from a ~30 m elevation model, not a survey."
