"""Read-only share links for plans (additive)."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_plan_shares"
down_revision: str | None = "0005_terrain_generations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "plan_shares",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "plan_id", sa.Uuid(), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("plan_id", name="uq_plan_shares_plan_id"),
        sa.UniqueConstraint("token_hash", name="uq_plan_shares_token_hash"),
    )


def downgrade() -> None:
    op.drop_table("plan_shares")
