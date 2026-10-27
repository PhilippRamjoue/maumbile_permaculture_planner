"""Add a revision for optimistic design concurrency control."""

import sqlalchemy as sa
from alembic import op

revision = "0011_plan_revision"
down_revision = "0010_element_type_footprints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plans", sa.Column("revision", sa.Integer(), server_default="0", nullable=False))
    op.add_column(
        "plans",
        sa.Column("revision_required", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("plans", "revision_required")
    op.drop_column("plans", "revision")
