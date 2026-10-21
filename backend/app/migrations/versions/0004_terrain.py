"""terrain results and contour lines

Revision ID: 0004_terrain
Revises: 0003_planning
Create Date: 2026-10-21

"""

from __future__ import annotations

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_terrain"
down_revision: str | None = "0003_planning"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "terrain_results",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "site_id",
            sa.Uuid(),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("contour_interval_m", sa.Float(), nullable=False),
        sa.Column("dem_source", sa.String(64), nullable=True),
        sa.Column("attribution", sa.String(512), nullable=True),
        sa.Column("resolution_m", sa.Float(), nullable=True),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("slope_summary", postgresql.JSONB(), nullable=True),
        sa.Column("slope_grid", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "terrain_contours",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "terrain_id",
            sa.Uuid(),
            sa.ForeignKey("terrain_results.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("elevation_m", sa.Float(), nullable=False),
        sa.Column(
            "geom",
            geoalchemy2.Geometry(geometry_type="MULTILINESTRING", srid=4326, spatial_index=False),
            nullable=False,
        ),
    )
    op.create_index("ix_terrain_contours_terrain_id", "terrain_contours", ["terrain_id"])
    op.create_index(
        "idx_terrain_contours_geom", "terrain_contours", ["geom"], postgresql_using="gist"
    )


def downgrade() -> None:
    op.drop_table("terrain_contours")
    op.drop_table("terrain_results")
