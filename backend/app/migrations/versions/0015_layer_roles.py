"""Stable layer roles survive display-name edits; custom layers remain unassigned."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_layer_roles"
down_revision: str | None = "0014_row_icons"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("layers", sa.Column("role", sa.String(20), nullable=True))
    # Only one standard destination per role per plan, including older duplicate names.
    op.execute("""
        WITH candidates AS (
            SELECT id, CASE name
                WHEN 'Zones' THEN 'zone' WHEN 'Sectors' THEN 'sector'
                WHEN 'Elements' THEN 'element' WHEN 'Paths' THEN 'path'
                WHEN 'Annotations' THEN 'annotation' END AS role,
                row_number() OVER (PARTITION BY plan_id, name ORDER BY created_at, id) AS n
            FROM layers
        )
        UPDATE layers SET role = candidates.role FROM candidates
        WHERE layers.id = candidates.id AND candidates.n = 1
    """)
    op.create_check_constraint(
        "ck_layers_role",
        "layers",
        "role IS NULL OR role IN ('zone', 'sector', 'element', 'path', 'annotation')",
    )
    op.create_unique_constraint("uq_layers_plan_role", "layers", ["plan_id", "role"])


def downgrade() -> None:
    op.drop_constraint("uq_layers_plan_role", "layers", type_="unique")
    op.drop_constraint("ck_layers_role", "layers", type_="check")
    op.drop_column("layers", "role")
