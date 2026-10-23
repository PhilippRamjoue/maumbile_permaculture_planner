"""Seeded ElementType catalog (data, not logic). Add a palette entry by adding a row here.

Applied by the ``0003_planning`` migration. Later changes ship as a new migration that
upserts by ``key``.
"""

from __future__ import annotations

from typing import Any

from app.modules.planning.icons import ICON_BY_TYPE


def _fill(color: str, opacity: float = 0.4) -> dict[str, Any]:
    return {"fill": color, "fill_opacity": opacity, "stroke": color}


def _line(color: str, width: float = 3, dash: bool = False) -> dict[str, Any]:
    style: dict[str, Any] = {"stroke": color, "stroke_width": width}
    if dash:
        style["dash"] = True
    return style


def _pin(color: str, radius: int = 8) -> dict[str, Any]:
    return {"fill": color, "stroke": "#ffffff", "radius": radius}


# (key, name, category, feature_type, geometry_type, icon, default_style)
_ROWS: tuple[tuple[str, str, str, str, str, str, dict[str, Any]], ...] = (
    # structures
    ("house", "House", "structure", "element", "polygon", "home", _fill("#a0522d", 0.7)),
    ("shed", "Shed", "structure", "element", "polygon", "warehouse", _fill("#bf8f6b", 0.7)),
    ("greenhouse", "Greenhouse", "structure", "element", "polygon", "greenhouse", _fill("#4db6ac")),
    ("chicken_coop", "Chicken coop", "structure", "element", "polygon", "egg", _fill("#ff9800")),
    ("toilet", "Compost toilet", "structure", "element", "point", "toilet", _pin("#795548")),
    # growing
    ("bed", "Garden bed", "growing", "element", "polygon", "sprout", _fill("#7cb342")),
    ("food_forest", "Food forest", "growing", "element", "polygon", "trees", _fill("#1b7a34")),
    ("tree", "Tree", "growing", "element", "point", "tree", _pin("#2e9e44", 9)),
    ("shrub", "Shrub", "growing", "element", "point", "leaf", _pin("#8bc34a")),
    ("herb_spiral", "Herb spiral", "growing", "element", "point", "spiral", _pin("#cddc39")),
    ("nursery", "Nursery", "growing", "element", "polygon", "seedling", _fill("#aed581")),
    ("compost", "Compost", "growing", "element", "point", "recycle", _pin("#6d4c41")),
    # water
    ("pond", "Pond", "water", "element", "polygon", "droplets", _fill("#1e88e5", 0.6)),
    ("swale", "Swale", "water", "element", "line", "waves", _line("#0277bd", 4)),
    ("water_tank", "Water tank", "water", "element", "point", "cylinder", _pin("#0d47a1", 9)),
    ("well", "Well", "water", "element", "point", "circle-dot", _pin("#1a237e", 9)),
    ("stream", "Stream", "water", "element", "line", "waves", _line("#4fc3f7", 3)),
    # boundaries
    ("fence", "Fence", "boundary", "element", "line", "fence", _line("#5d4037", 2, dash=True)),
    ("hedge", "Hedge", "boundary", "element", "line", "hedge", _line("#33691e", 5)),
    ("windbreak", "Windbreak", "boundary", "element", "line", "wind", _line("#1b5e20", 6)),
    # animals
    ("paddock", "Paddock", "animals", "element", "polygon", "paw-print", _fill("#dce775")),
    ("beehive", "Beehive", "animals", "element", "point", "hexagon", _pin("#fbc02d")),
    # access
    ("path", "Path", "access", "path", "line", "route", _line("#8d6e63", 4)),
    ("road", "Road", "access", "path", "line", "road", _line("#616161", 5)),
    # planning overlays
    ("zone", "Zone", "planning", "zone", "polygon", "target", _fill("#ffa726", 0.25)),
    ("sector", "Sector", "planning", "sector", "polygon", "compass", _fill("#ef5350", 0.25)),
    ("note", "Note", "planning", "annotation", "point", "message-square", _pin("#fdd835")),
)

# What each palette entry typically needs and yields, in the vocabulary of the editor's Functions
# step. Placing an element copies these onto it, so "tree needs water" is met as soon as a tank
# "yields water" exists. Entries not listed (zone, sector, note) carry no functions.
_FUNCTIONS: dict[str, dict[str, list[str]]] = {
    "house": {"needs": [], "yields": ["shelter", "security"]},
    "shed": {"needs": [], "yields": ["shelter", "security"]},
    "greenhouse": {"needs": ["water"], "yields": ["food", "heat"]},
    "chicken_coop": {
        "needs": ["water", "fodder"],
        "yields": ["food", "fertility", "pest control"],
    },
    "toilet": {"needs": [], "yields": ["fertility"]},
    "bed": {"needs": ["water", "fertility"], "yields": ["food"]},
    "food_forest": {"needs": ["water"], "yields": ["food", "shade", "habitat", "mulch"]},
    "tree": {"needs": ["water"], "yields": ["shade", "windbreak", "habitat"]},
    "shrub": {"needs": ["water"], "yields": ["food", "habitat"]},
    "herb_spiral": {"needs": ["water"], "yields": ["food", "pollination"]},
    "nursery": {"needs": ["water"], "yields": ["food", "income"]},
    "compost": {"needs": ["water"], "yields": ["fertility", "mulch"]},
    "pond": {"needs": [], "yields": ["water", "habitat", "pest control"]},
    "swale": {"needs": [], "yields": ["water", "habitat"]},
    "water_tank": {"needs": [], "yields": ["water"]},
    "well": {"needs": [], "yields": ["water"]},
    "stream": {"needs": [], "yields": ["water", "habitat"]},
    "fence": {"needs": [], "yields": ["security", "privacy"]},
    "hedge": {"needs": [], "yields": ["windbreak", "privacy", "habitat", "fuel"]},
    "windbreak": {"needs": [], "yields": ["windbreak", "shelter", "habitat"]},
    "paddock": {"needs": ["water", "fodder"], "yields": ["fertility", "food"]},
    "beehive": {"needs": ["water"], "yields": ["pollination", "food", "income"]},
    "path": {"needs": [], "yields": ["access"]},
    "road": {"needs": [], "yields": ["access"]},
}

# The catalog as ``0003_planning`` created it: only the columns that existed then. Frozen in shape
# because that migration bulk-inserts it; newer columns live in ``ELEMENT_TYPE_CATALOG``.
ELEMENT_TYPES: tuple[dict[str, Any], ...] = tuple(
    {
        "key": key,
        "name": name,
        "category": category,
        "feature_type": feature_type,
        "geometry_type": geometry_type,
        "icon": icon,
        "default_style": style,
        "sort_order": i,
    }
    for i, (key, name, category, feature_type, geometry_type, icon, style) in enumerate(_ROWS)
)

# The current catalog: ``default_style``, ``default_properties`` (needs / yields) and the map
# ``icon`` (a glyph key from ``planning.icons``, None for lines and overlays) per key.
# ``0007_element_type_defaults`` and ``0009_element_type_icons`` hold frozen copies; a test keeps
# them in step, so a change here ships together with a new migration.
ELEMENT_TYPE_CATALOG: dict[str, dict[str, Any]] = {
    row["key"]: {
        "default_style": row["default_style"],
        "default_properties": _FUNCTIONS.get(row["key"], {}),
        "icon": ICON_BY_TYPE[row["key"]],
    }
    for row in ELEMENT_TYPES
}
