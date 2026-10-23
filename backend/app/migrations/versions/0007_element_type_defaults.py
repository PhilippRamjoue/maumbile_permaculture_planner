"""Element type defaults: per-type needs/yields and clearer colours (additive).

Adds ``element_types.default_properties`` (the ``needs`` / ``yields`` a placed element starts
with) and refreshes the existing rows' ``default_style`` and ``default_properties`` by ``key``.
The catalog below is a frozen copy: ``app.modules.planning.seed`` is the live source, a test keeps
the two in step, and a later change ships as a further migration. Features already placed keep
their own style and functions.
"""

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_element_type_defaults"
down_revision: str | None = "0006_plan_shares"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CATALOG: dict[str, dict[str, Any]] = {
    "house": {
        "default_style": {"fill": "#a0522d", "fill_opacity": 0.7, "stroke": "#a0522d"},
        "default_properties": {"needs": [], "yields": ["shelter", "security"]},
    },
    "shed": {
        "default_style": {"fill": "#bf8f6b", "fill_opacity": 0.7, "stroke": "#bf8f6b"},
        "default_properties": {"needs": [], "yields": ["shelter", "security"]},
    },
    "greenhouse": {
        "default_style": {"fill": "#4db6ac", "fill_opacity": 0.4, "stroke": "#4db6ac"},
        "default_properties": {"needs": ["water"], "yields": ["food", "heat"]},
    },
    "chicken_coop": {
        "default_style": {"fill": "#ff9800", "fill_opacity": 0.4, "stroke": "#ff9800"},
        "default_properties": {
            "needs": ["water", "fodder"],
            "yields": ["food", "fertility", "pest control"],
        },
    },
    "toilet": {
        "default_style": {"fill": "#795548", "stroke": "#ffffff", "radius": 8},
        "default_properties": {"needs": [], "yields": ["fertility"]},
    },
    "bed": {
        "default_style": {"fill": "#7cb342", "fill_opacity": 0.4, "stroke": "#7cb342"},
        "default_properties": {"needs": ["water", "fertility"], "yields": ["food"]},
    },
    "food_forest": {
        "default_style": {"fill": "#1b7a34", "fill_opacity": 0.4, "stroke": "#1b7a34"},
        "default_properties": {"needs": ["water"], "yields": ["food", "shade", "habitat", "mulch"]},
    },
    "tree": {
        "default_style": {"fill": "#2e9e44", "stroke": "#ffffff", "radius": 9},
        "default_properties": {"needs": ["water"], "yields": ["shade", "windbreak", "habitat"]},
    },
    "shrub": {
        "default_style": {"fill": "#8bc34a", "stroke": "#ffffff", "radius": 8},
        "default_properties": {"needs": ["water"], "yields": ["food", "habitat"]},
    },
    "herb_spiral": {
        "default_style": {"fill": "#cddc39", "stroke": "#ffffff", "radius": 8},
        "default_properties": {"needs": ["water"], "yields": ["food", "pollination"]},
    },
    "nursery": {
        "default_style": {"fill": "#aed581", "fill_opacity": 0.4, "stroke": "#aed581"},
        "default_properties": {"needs": ["water"], "yields": ["food", "income"]},
    },
    "compost": {
        "default_style": {"fill": "#6d4c41", "stroke": "#ffffff", "radius": 8},
        "default_properties": {"needs": ["water"], "yields": ["fertility", "mulch"]},
    },
    "pond": {
        "default_style": {"fill": "#1e88e5", "fill_opacity": 0.6, "stroke": "#1e88e5"},
        "default_properties": {"needs": [], "yields": ["water", "habitat", "pest control"]},
    },
    "swale": {
        "default_style": {"stroke": "#0277bd", "stroke_width": 4},
        "default_properties": {"needs": [], "yields": ["water", "habitat"]},
    },
    "water_tank": {
        "default_style": {"fill": "#0d47a1", "stroke": "#ffffff", "radius": 9},
        "default_properties": {"needs": [], "yields": ["water"]},
    },
    "well": {
        "default_style": {"fill": "#1a237e", "stroke": "#ffffff", "radius": 9},
        "default_properties": {"needs": [], "yields": ["water"]},
    },
    "stream": {
        "default_style": {"stroke": "#4fc3f7", "stroke_width": 3},
        "default_properties": {"needs": [], "yields": ["water", "habitat"]},
    },
    "fence": {
        "default_style": {"stroke": "#5d4037", "stroke_width": 2, "dash": True},
        "default_properties": {"needs": [], "yields": ["security", "privacy"]},
    },
    "hedge": {
        "default_style": {"stroke": "#33691e", "stroke_width": 5},
        "default_properties": {"needs": [], "yields": ["windbreak", "privacy", "habitat", "fuel"]},
    },
    "windbreak": {
        "default_style": {"stroke": "#1b5e20", "stroke_width": 6},
        "default_properties": {"needs": [], "yields": ["windbreak", "shelter", "habitat"]},
    },
    "paddock": {
        "default_style": {"fill": "#dce775", "fill_opacity": 0.4, "stroke": "#dce775"},
        "default_properties": {"needs": ["water", "fodder"], "yields": ["fertility", "food"]},
    },
    "beehive": {
        "default_style": {"fill": "#fbc02d", "stroke": "#ffffff", "radius": 8},
        "default_properties": {"needs": ["water"], "yields": ["pollination", "food", "income"]},
    },
    "path": {
        "default_style": {"stroke": "#8d6e63", "stroke_width": 4},
        "default_properties": {"needs": [], "yields": ["access"]},
    },
    "road": {
        "default_style": {"stroke": "#616161", "stroke_width": 5},
        "default_properties": {"needs": [], "yields": ["access"]},
    },
    "zone": {
        "default_style": {"fill": "#ffa726", "fill_opacity": 0.25, "stroke": "#ffa726"},
        "default_properties": {},
    },
    "sector": {
        "default_style": {"fill": "#ef5350", "fill_opacity": 0.25, "stroke": "#ef5350"},
        "default_properties": {},
    },
    "note": {
        "default_style": {"fill": "#fdd835", "stroke": "#ffffff", "radius": 8},
        "default_properties": {},
    },
}


def upgrade() -> None:
    op.add_column(
        "element_types",
        sa.Column(
            "default_properties",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    update = sa.text(
        "UPDATE element_types SET default_style = CAST(:style AS jsonb), "
        "default_properties = CAST(:properties AS jsonb) WHERE key = :key"
    )
    for key, entry in CATALOG.items():
        op.execute(
            update.bindparams(
                key=key,
                style=json.dumps(entry["default_style"]),
                properties=json.dumps(entry["default_properties"]),
            )
        )


def downgrade() -> None:
    # The refreshed colours stay: they are data, and the previous revision accepts any style.
    op.drop_column("element_types", "default_properties")
