"""Hedge and windbreak rows: ``row_icon`` and ``row_spacing_m`` in the default style (data only).

A line drawn from the hedge or windbreak palette entry copies these onto the feature, and the
editor shows it as a row of that glyph, that many metres apart, along the line. Features already
drawn have neither and stay plain lines. The values are a frozen copy:
``app.modules.planning.seed`` is the live source and a test keeps the two in step.
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_row_icons"
down_revision: str | None = "0013_path_widths"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# key: (glyph, metres between icons)
ROWS: dict[str, tuple[str, float]] = {"hedge": ("shrub", 1.5), "windbreak": ("tree", 4.0)}


def upgrade() -> None:
    update = sa.text(
        "UPDATE element_types SET default_style = default_style || CAST(:row AS jsonb) "
        "WHERE key = :key"
    )
    for key, (icon, spacing) in ROWS.items():
        row = json.dumps({"row_icon": icon, "row_spacing_m": spacing})
        op.execute(update.bindparams(key=key, row=row))


def downgrade() -> None:
    for key in ROWS:
        op.execute(
            sa.text(
                "UPDATE element_types SET default_style = default_style - 'row_icon' "
                "- 'row_spacing_m' WHERE key = :key"
            ).bindparams(key=key)
        )
