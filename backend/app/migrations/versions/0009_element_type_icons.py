"""Element type icons: each palette entry's map glyph (additive data refresh).

``element_types.icon`` existed but held names nothing drew. It now names a glyph of the bundled
icon set (``app.modules.planning.icons``): ``NULL`` for lines and overlays, which are drawn as
styled lines and areas. The mapping below is a frozen copy; ``planning.seed`` is the live source
and a test keeps the two in step. Features already placed are untouched: their icon follows
their palette entry.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_element_type_icons"
down_revision: str | None = "0008_plan_goals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ICONS: dict[str, str | None] = {
    "house": "house",
    "shed": "shed",
    "greenhouse": "greenhouse",
    "chicken_coop": "egg",
    "toilet": "outhouse",
    "bed": "bed",
    "food_forest": "trees",
    "tree": "tree",
    "shrub": "shrub",
    "herb_spiral": "spiral",
    "nursery": "sprout",
    "compost": "mound",
    "pond": "drop",
    "swale": None,
    "water_tank": "tank",
    "well": "well",
    "stream": None,
    "fence": None,
    "hedge": None,
    "windbreak": None,
    "paddock": "paw",
    "beehive": "hive",
    "path": None,
    "road": None,
    "zone": None,
    "sector": None,
    "note": "note",
}

# The unused names the catalog carried before (lucide-style), restored on downgrade.
PREVIOUS: dict[str, str] = {
    "house": "home",
    "shed": "warehouse",
    "greenhouse": "greenhouse",
    "chicken_coop": "egg",
    "toilet": "toilet",
    "bed": "sprout",
    "food_forest": "trees",
    "tree": "tree",
    "shrub": "leaf",
    "herb_spiral": "spiral",
    "nursery": "seedling",
    "compost": "recycle",
    "pond": "droplets",
    "swale": "waves",
    "water_tank": "cylinder",
    "well": "circle-dot",
    "stream": "waves",
    "fence": "fence",
    "hedge": "hedge",
    "windbreak": "wind",
    "paddock": "paw-print",
    "beehive": "hexagon",
    "path": "route",
    "road": "road",
    "zone": "target",
    "sector": "compass",
    "note": "message-square",
}


def _set(icons: dict[str, str | None]) -> None:
    update = sa.text("UPDATE element_types SET icon = :icon WHERE key = :key")
    for key, icon in icons.items():
        op.execute(update.bindparams(key=key, icon=icon))


def upgrade() -> None:
    _set(ICONS)


def downgrade() -> None:
    _set(dict(PREVIOUS))
