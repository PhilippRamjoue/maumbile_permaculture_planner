"""Element type footprints: each palette entry's shape and real-world size (additive).

Adds ``element_types.shape`` (``point`` | ``line`` | ``area`` | ``round`` | ``rect``) and the
nullable default size in metres: ``default_diameter_m`` for round entries, ``default_width_m`` (east
to west) by ``default_length_m`` (north to south) for rectangular ones. The editor places a round or
rectangular entry as a to-scale footprint polygon with one click.

Entries that used to be map pins but have a footprint (tree, shrub, herb spiral, compost, water
tank, well, compost toilet) become polygon entries with an area style. Features already placed keep
their point geometry and their own style. The values below are a frozen copy:
``app.modules.planning.seed`` is the live source and a test keeps the two in step.
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_element_type_footprints"
down_revision: str | None = "0009_element_type_icons"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# key: (shape, default_width_m, default_length_m, default_diameter_m)
SHAPES: dict[str, tuple[str, float | None, float | None, float | None]] = {
    "house": ("rect", 8.0, 6.0, None),
    "shed": ("rect", 3.0, 3.0, None),
    "greenhouse": ("rect", 3.0, 6.0, None),
    "chicken_coop": ("rect", 2.0, 3.0, None),
    "toilet": ("rect", 1.5, 1.5, None),
    "bed": ("rect", 1.2, 4.0, None),
    "food_forest": ("area", None, None, None),
    "tree": ("round", None, None, 4.0),
    "shrub": ("round", None, None, 1.5),
    "herb_spiral": ("round", None, None, 2.0),
    "nursery": ("rect", 3.0, 3.0, None),
    "compost": ("rect", 1.0, 1.0, None),
    "pond": ("round", None, None, 3.0),
    "swale": ("line", None, None, None),
    "water_tank": ("round", None, None, 2.0),
    "well": ("round", None, None, 1.0),
    "stream": ("line", None, None, None),
    "fence": ("line", None, None, None),
    "hedge": ("line", None, None, None),
    "windbreak": ("line", None, None, None),
    "paddock": ("area", None, None, None),
    "beehive": ("point", None, None, None),
    "path": ("line", None, None, None),
    "road": ("line", None, None, None),
    "zone": ("area", None, None, None),
    "sector": ("area", None, None, None),
    "note": ("point", None, None, None),
}


def _area(color: str, opacity: float) -> dict[str, object]:
    return {"fill": color, "fill_opacity": opacity, "stroke": color}


def _pin(color: str, radius: int) -> dict[str, object]:
    return {"fill": color, "stroke": "#ffffff", "radius": radius}


# key: (style as a footprint polygon, style as it was a pin)
RESTYLED: dict[str, tuple[dict[str, object], dict[str, object]]] = {
    "toilet": (_area("#795548", 0.7), _pin("#795548", 8)),
    "tree": (_area("#2e9e44", 0.55), _pin("#2e9e44", 9)),
    "shrub": (_area("#8bc34a", 0.55), _pin("#8bc34a", 8)),
    "herb_spiral": (_area("#cddc39", 0.6), _pin("#cddc39", 8)),
    "compost": (_area("#6d4c41", 0.7), _pin("#6d4c41", 8)),
    "water_tank": (_area("#0d47a1", 0.8), _pin("#0d47a1", 9)),
    "well": (_area("#1a237e", 0.8), _pin("#1a237e", 9)),
}


def _restyle(geometry_type: str, index: int) -> None:
    update = sa.text(
        "UPDATE element_types SET geometry_type = :geometry_type, "
        "default_style = CAST(:style AS jsonb) WHERE key = :key"
    )
    for key, styles in RESTYLED.items():
        op.execute(
            update.bindparams(key=key, geometry_type=geometry_type, style=json.dumps(styles[index]))
        )


def upgrade() -> None:
    op.add_column(
        "element_types",
        sa.Column("shape", sa.String(10), server_default="area", nullable=False),
    )
    op.add_column("element_types", sa.Column("default_width_m", sa.Float(), nullable=True))
    op.add_column("element_types", sa.Column("default_length_m", sa.Float(), nullable=True))
    op.add_column("element_types", sa.Column("default_diameter_m", sa.Float(), nullable=True))
    update = sa.text(
        "UPDATE element_types SET shape = :shape, default_width_m = :width, "
        "default_length_m = :length, default_diameter_m = :diameter WHERE key = :key"
    )
    for key, (shape, width, length, diameter) in SHAPES.items():
        op.execute(
            update.bindparams(key=key, shape=shape, width=width, length=length, diameter=diameter)
        )
    _restyle("polygon", 0)


def downgrade() -> None:
    _restyle("point", 1)
    op.drop_column("element_types", "default_diameter_m")
    op.drop_column("element_types", "default_length_m")
    op.drop_column("element_types", "default_width_m")
    op.drop_column("element_types", "shape")
