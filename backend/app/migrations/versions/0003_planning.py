"""planning domain: element_types (seeded), plans, layers, features

Revision ID: 0003_planning
Revises: 0002_sites
Create Date: 2026-10-21

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

from app.modules.planning.seed import ELEMENT_TYPES

revision: str = "0003_planning"
down_revision: str | None = "0002_sites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    element_types = op.create_table(
        "element_types",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("feature_type", sa.String(20), nullable=False),
        sa.Column("geometry_type", sa.String(20), nullable=False),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column(
            "default_style",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_element_types_category", "element_types", ["category"])
    op.bulk_insert(element_types, list(ELEMENT_TYPES))

    op.create_table(
        "plans",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "site_id", sa.Uuid(), sa.ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_plans_site_id", "plans", ["site_id"])

    op.create_table(
        "layers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "plan_id", sa.Uuid(), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("visible", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_layers_plan_id", "layers", ["plan_id"])

    op.create_table(
        "features",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "plan_id", sa.Uuid(), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "layer_id", sa.Uuid(), sa.ForeignKey("layers.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "geometry",
            Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("feature_type", sa.String(20), nullable=False),
        sa.Column(
            "element_type_id", sa.Integer(), sa.ForeignKey("element_types.id"), nullable=True
        ),
        sa.Column(
            "properties",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "GeometryType(geometry) IN ('POINT', 'LINESTRING', 'POLYGON')",
            name="ck_features_geometry_type",
        ),
        sa.CheckConstraint(
            "feature_type IN ('zone', 'sector', 'element', 'path', 'annotation')",
            name="ck_features_feature_type",
        ),
    )
    op.create_index("ix_features_plan_id", "features", ["plan_id"])
    op.create_index("ix_features_layer_id", "features", ["layer_id"])
    op.create_index("ix_features_feature_type", "features", ["feature_type"])
    op.execute("CREATE INDEX idx_features_geometry ON features USING gist (geometry)")


def downgrade() -> None:
    op.drop_table("features")
    op.drop_table("layers")
    op.drop_table("plans")
    op.drop_table("element_types")
