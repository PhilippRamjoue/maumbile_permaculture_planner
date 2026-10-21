"""Stored terrain: one result row per site, plus one MULTILINESTRING row per contour level."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import DateTime, Float, ForeignKey, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.geo import WGS84_SRID

# Lifecycle: pending -> running -> ready | failed. "not_requested" is only ever an API value.
PENDING = "pending"
RUNNING = "running"
READY = "ready"
FAILED = "failed"


class TerrainResult(Base):
    """Terrain for a site. ``site_id`` is unique: terrain is immutable, so there is one."""

    __tablename__ = "terrain_results"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    contour_interval_m: Mapped[float] = mapped_column(Float, nullable=False)
    dem_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attribution: Mapped[str | None] = mapped_column(String(512), nullable=True)
    resolution_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Stats + slope legend with per-class area share; slope class grid for the overlay.
    slope_summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    slope_grid: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Bumped on every state change; a pending/running row that stops moving is considered dead.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TerrainContour(Base):
    """All lines of one contour elevation for a site (WGS84, clipped to the site bbox)."""

    __tablename__ = "terrain_contours"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    terrain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("terrain_results.id", ondelete="CASCADE"), nullable=False, index=True
    )
    elevation_m: Mapped[float] = mapped_column(Float, nullable=False)
    geom: Mapped[WKBElement] = mapped_column(
        Geometry(geometry_type="MULTILINESTRING", srid=WGS84_SRID), nullable=False
    )
