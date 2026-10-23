"""ORM models for the planning domain: ElementType catalog, Plan, Layer, Feature."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.geo import WGS84_SRID


class ElementType(Base):
    """Seeded palette catalog (house, bed, pond, ...). Data, not code: see ``seed.py``."""

    __tablename__ = "element_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # The feature_type a feature placed from this palette entry gets (zone, element, path...).
    feature_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Geometry the editor should draw for this entry: point | line | polygon.
    geometry_type: Mapped[str] = mapped_column(String(20), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    default_style: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    # Properties a feature placed from this entry starts with, e.g. its typical `needs` / `yields`.
    default_properties: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # What the owner wants from the land (``PlanGoals``): optional, validated at the API edge.
    goals: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Layer(Base):
    __tablename__ = "layers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    visible: Mapped[bool] = mapped_column(nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Feature(Base):
    """A drawn thing. Zones and sectors are Features with typed ``properties``.

    ``id`` is client-supplied (batch upsert is idempotent on it). ``plan_id`` is denormalised
    from the layer so a plan's features load without a join and an id can never be hijacked
    across plans.
    """

    __tablename__ = "features"
    __table_args__ = (
        CheckConstraint(
            "GeometryType(geometry) IN ('POINT', 'LINESTRING', 'POLYGON')",
            name="ck_features_geometry_type",
        ),
        CheckConstraint(
            "feature_type IN ('zone', 'sector', 'element', 'path', 'annotation')",
            name="ck_features_feature_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    layer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("layers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # PostGIS typmods allow a single type, so the point/line/polygon restriction is a CHECK.
    geometry: Mapped[WKBElement] = mapped_column(
        Geometry(geometry_type="GEOMETRY", srid=WGS84_SRID), nullable=False
    )
    feature_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    element_type_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("element_types.id"), nullable=True
    )
    properties: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
