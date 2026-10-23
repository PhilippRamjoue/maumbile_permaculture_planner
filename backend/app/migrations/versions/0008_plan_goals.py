"""Plan goals: what the owner wants from the land (additive).

Adds the nullable ``plans.goals`` JSONB column (``{"priorities": [...], "vision": "..."}``).
Existing plans simply have no goals; nothing is backfilled.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_plan_goals"
down_revision: str | None = "0007_element_type_defaults"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("plans", sa.Column("goals", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("plans", "goals")
