"""Track terrain inputs and fence stale background jobs.

Existing rows have unknown inputs and are lazily recomputed on their next POST.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_terrain_generations"
down_revision: str | None = "0004_terrain"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("terrain_results", sa.Column("input_key", sa.String(64), nullable=True))
    op.add_column("terrain_results", sa.Column("job_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    op.drop_column("terrain_results", "job_id")
    op.drop_column("terrain_results", "input_key")
