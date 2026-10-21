"""create sites table

Revision ID: 0002_sites
Revises: 0002_auth
Create Date: 2026-10-21

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision: str = "0002_sites"
down_revision: str | None = "0002_auth"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sites",
        sa.Column("id", sa.Uuid(), primary_key=True),
        # No FK yet: becomes users.id when the auth package is integrated.
        sa.Column("owner_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=True),
        sa.Column(
            "boundary",
            Geometry(geometry_type="POLYGON", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column(
            "centroid",
            Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("bbox", postgresql.ARRAY(sa.Float()), nullable=False),
        sa.Column("area_m2", sa.Float(), nullable=False),
        sa.Column("utm_epsg", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sites_owner_id", "sites", ["owner_id"])
    op.create_index("ix_sites_country_code", "sites", ["country_code"])
    op.execute("CREATE INDEX idx_sites_boundary ON sites USING gist (boundary)")
    op.execute("CREATE INDEX idx_sites_centroid ON sites USING gist (centroid)")


def downgrade() -> None:
    op.drop_table("sites")
