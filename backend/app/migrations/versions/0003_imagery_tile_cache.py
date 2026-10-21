"""imagery tile cache

Revision ID: 0003_imagery
Revises: 0002_sites
Create Date: 2026-10-21

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_imagery"
down_revision: str | None = "0002_sites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "imagery_tiles",
        sa.Column("provider_key", sa.String(64), primary_key=True),
        sa.Column("z", sa.SmallInteger(), primary_key=True),
        sa.Column("x", sa.Integer(), primary_key=True),
        sa.Column("y", sa.Integer(), primary_key=True),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("media_type", sa.String(64), nullable=False),
        sa.Column(
            "fetched_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("imagery_tiles")
