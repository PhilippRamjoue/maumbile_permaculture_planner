"""ORM model for a site (a piece of land)."""

from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import DateTime, Float, Integer, String, Uuid, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.geo import WGS84_SRID


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Owner is the authenticated user that created the site (set from auth's current_user in the
    # router; see app/modules/sites/router.py). Kept a bare, nullable column — NOT yet a DB-level
    # FK to users.id — a deliberate, documented deferral (see docs/PROJECT_STATUS.md "Known
    # deferrals"). Integrity is enforced at the app layer; the FK + NOT NULL is a planned hardening.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # ISO-3166-1 alpha-2. Nullable: derivation from the centroid is best-effort.
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True, index=True)

    # Geometry columns get a GiST index by default (spatial_index=True).
    boundary: Mapped[WKBElement] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=WGS84_SRID), nullable=False
    )
    centroid: Mapped[WKBElement] = mapped_column(
        Geometry(geometry_type="POINT", srid=WGS84_SRID), nullable=False
    )
    # [min_lng, min_lat, max_lng, max_lat]
    bbox: Mapped[list[float]] = mapped_column(ARRAY(Float), nullable=False)
    area_m2: Mapped[float] = mapped_column(Float, nullable=False)
    utm_epsg: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
