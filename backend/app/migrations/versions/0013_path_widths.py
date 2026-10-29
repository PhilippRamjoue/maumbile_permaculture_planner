"""Path and road real-world widths: ``width_m`` in the palette entry's default style (data only).

The editor draws a path or road to scale from its ``width_m`` property, which a newly drawn feature
copies from the palette entry's style: a path is 1 m wide, a road 4 m. Features already drawn have
no ``width_m`` and keep their pixel-width look. The values are a frozen copy:
``app.modules.planning.seed`` is the live source and a test keeps the two in step.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_path_widths"
down_revision: str | None = "0012_password_recovery"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# key: width in metres
WIDTHS: dict[str, float] = {"path": 1.0, "road": 4.0}


def upgrade() -> None:
    update = sa.text(
        "UPDATE element_types SET default_style = default_style || CAST(:width AS jsonb) "
        "WHERE key = :key"
    )
    for key, width in WIDTHS.items():
        op.execute(update.bindparams(key=key, width=f'{{"width_m": {width}}}'))


def downgrade() -> None:
    for key in WIDTHS:
        op.execute(
            sa.text(
                "UPDATE element_types SET default_style = default_style - 'width_m' "
                "WHERE key = :key"
            ).bindparams(key=key)
        )
