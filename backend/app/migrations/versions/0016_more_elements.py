"""More palette entries: East-African smallholder elements (additive data).

Adds twelve ``element_types`` rows — banana circle, keyhole garden, orchard, goat pen, cattle shed,
pig pen, rabbit hutch, fish pond, borehole, dam, grain store and biogas digester — with their map
glyph, footprint and default needs / yields. Upserts by ``key`` so it is correct whether the row is
absent (an already-deployed database) or was bulk-inserted by ``0003_planning`` with only its early
columns (a fresh database): unlike the earlier per-column migrations, which only touch the original
keys, this sets every current column for each new key. The values are a frozen copy;
``app.modules.planning.seed`` is the live source and a test keeps the two in step. Features already
placed are untouched.
"""

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0016_more_elements"
down_revision: str | None = "0015_layer_roles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _fill(color: str, opacity: float = 0.4) -> dict[str, Any]:
    return {"fill": color, "fill_opacity": opacity, "stroke": color}


def _line_style(color: str, width: float) -> dict[str, Any]:
    return {"stroke": color, "stroke_width": width}


# Frozen snapshot. key: (name, category, geometry_type, icon glyph, style, needs, yields,
#                        shape, width_m, length_m, diameter_m, sort_order)
ROWS: tuple[tuple[Any, ...], ...] = (
    (
        "banana_circle",
        "Banana circle",
        "growing",
        "polygon",
        "banana_circle",
        _fill("#9ccc65", 0.5),
        ["water", "fertility"],
        ["food", "mulch", "shade"],
        "round",
        None,
        None,
        3.0,
        27,
    ),
    (
        "keyhole_garden",
        "Keyhole garden",
        "growing",
        "polygon",
        "keyhole_garden",
        _fill("#c0ca33", 0.5),
        ["water"],
        ["food", "fertility"],
        "round",
        None,
        None,
        3.0,
        28,
    ),
    (
        "orchard",
        "Orchard",
        "growing",
        "polygon",
        "orchard",
        _fill("#2e7d32", 0.45),
        ["water"],
        ["food", "shade", "habitat"],
        "area",
        None,
        None,
        None,
        29,
    ),
    (
        "goat_pen",
        "Goat pen",
        "animals",
        "polygon",
        "goat_pen",
        _fill("#bcaaa4"),
        ["water", "fodder"],
        ["fertility", "food"],
        "rect",
        3.0,
        4.0,
        None,
        30,
    ),
    (
        "cattle_shed",
        "Cattle shed",
        "animals",
        "polygon",
        "cattle_shed",
        _fill("#a1887f"),
        ["water", "fodder"],
        ["fertility", "food"],
        "rect",
        5.0,
        6.0,
        None,
        31,
    ),
    (
        "pig_pen",
        "Pig pen",
        "animals",
        "polygon",
        "pig_pen",
        _fill("#f48fb1", 0.55),
        ["water", "fodder"],
        ["fertility", "food"],
        "rect",
        2.0,
        3.0,
        None,
        32,
    ),
    (
        "rabbit_hutch",
        "Rabbit hutch",
        "animals",
        "polygon",
        "rabbit_hutch",
        _fill("#d7ccc8", 0.6),
        ["water", "fodder"],
        ["food", "fertility"],
        "rect",
        1.0,
        2.0,
        None,
        33,
    ),
    (
        "fish_pond",
        "Fish pond",
        "water",
        "polygon",
        "fish_pond",
        _fill("#0288d1", 0.55),
        [],
        ["food", "habitat"],
        "round",
        None,
        None,
        4.0,
        34,
    ),
    (
        "borehole",
        "Borehole",
        "water",
        "polygon",
        "borehole",
        _fill("#283593", 0.8),
        [],
        ["water"],
        "round",
        None,
        None,
        1.0,
        35,
    ),
    (
        "dam",
        "Dam",
        "water",
        "line",
        None,
        _line_style("#01579b", 6),
        [],
        ["water", "habitat"],
        "line",
        None,
        None,
        None,
        36,
    ),
    (
        "grain_store",
        "Grain store",
        "structure",
        "polygon",
        "grain_store",
        _fill("#8d6e63", 0.7),
        [],
        ["shelter", "security"],
        "rect",
        2.0,
        2.0,
        None,
        37,
    ),
    (
        "biogas",
        "Biogas digester",
        "structure",
        "polygon",
        "biogas",
        _fill("#5d4037", 0.7),
        [],
        ["fuel", "heat", "fertility"],
        "round",
        None,
        None,
        2.0,
        38,
    ),
)

KEYS = [row[0] for row in ROWS]

_INSERT = sa.text(
    "INSERT INTO element_types "
    "(key, name, category, feature_type, geometry_type, icon, default_style, "
    " default_properties, sort_order, shape, default_width_m, default_length_m, "
    " default_diameter_m) "
    "VALUES (:key, :name, :category, 'element', :geometry_type, :icon, "
    " CAST(:style AS jsonb), CAST(:properties AS jsonb), :sort_order, :shape, "
    " :width, :length, :diameter) "
    "ON CONFLICT (key) DO UPDATE SET "
    " name = EXCLUDED.name, category = EXCLUDED.category, "
    " feature_type = EXCLUDED.feature_type, geometry_type = EXCLUDED.geometry_type, "
    " icon = EXCLUDED.icon, default_style = EXCLUDED.default_style, "
    " default_properties = EXCLUDED.default_properties, sort_order = EXCLUDED.sort_order, "
    " shape = EXCLUDED.shape, default_width_m = EXCLUDED.default_width_m, "
    " default_length_m = EXCLUDED.default_length_m, "
    " default_diameter_m = EXCLUDED.default_diameter_m"
)


def upgrade() -> None:
    for (
        key,
        name,
        category,
        geometry_type,
        icon,
        style,
        needs,
        yields_,
        shape,
        width,
        length,
        diameter,
        sort_order,
    ) in ROWS:
        op.execute(
            _INSERT.bindparams(
                key=key,
                name=name,
                category=category,
                geometry_type=geometry_type,
                icon=icon,
                style=json.dumps(style),
                properties=json.dumps({"needs": needs, "yields": yields_}),
                sort_order=sort_order,
                shape=shape,
                width=width,
                length=length,
                diameter=diameter,
            )
        )


def downgrade() -> None:
    keys = tuple(KEYS)
    # Let any placed feature outlive its palette entry, then drop the entries.
    op.execute(
        sa.text(
            "UPDATE features SET element_type_id = NULL WHERE element_type_id IN "
            "(SELECT id FROM element_types WHERE key IN :keys)"
        ).bindparams(sa.bindparam("keys", value=keys, expanding=True))
    )
    op.execute(
        sa.text("DELETE FROM element_types WHERE key IN :keys").bindparams(
            sa.bindparam("keys", value=keys, expanding=True)
        )
    )
