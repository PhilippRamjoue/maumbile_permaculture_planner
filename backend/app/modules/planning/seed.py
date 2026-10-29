"""Seeded ElementType catalog (data, not logic). Add a palette entry by adding a row here.

Applied by the ``0003_planning`` migration. Later changes ship as a new migration that
upserts by ``key``.
"""

from __future__ import annotations

from typing import Any

from app.modules.planning.icons import ICON_BY_TYPE


def _fill(color: str, opacity: float = 0.4) -> dict[str, Any]:
    return {"fill": color, "fill_opacity": opacity, "stroke": color}


def _line(
    color: str,
    width: float = 3,
    dash: bool = False,
    width_m: float | None = None,
    row: tuple[str, float] | None = None,
) -> dict[str, Any]:
    style: dict[str, Any] = {"stroke": color, "stroke_width": width}
    if dash:
        style["dash"] = True
    if width_m is not None:
        style["width_m"] = width_m  # real-world width: the editor draws the line to scale
    if row is not None:  # drawn as a row of this glyph, this many metres apart
        style["row_icon"], style["row_spacing_m"] = row
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
    (
        "toilet",
        "Compost toilet",
        "structure",
        "element",
        "polygon",
        "toilet",
        _fill("#795548", 0.7),
    ),
    # growing
    ("bed", "Garden bed", "growing", "element", "polygon", "sprout", _fill("#7cb342")),
    ("food_forest", "Food forest", "growing", "element", "polygon", "trees", _fill("#1b7a34")),
    ("tree", "Tree", "growing", "element", "polygon", "tree", _fill("#2e9e44", 0.55)),
    ("shrub", "Shrub", "growing", "element", "polygon", "leaf", _fill("#8bc34a", 0.55)),
    (
        "herb_spiral",
        "Herb spiral",
        "growing",
        "element",
        "polygon",
        "spiral",
        _fill("#cddc39", 0.6),
    ),
    ("nursery", "Nursery", "growing", "element", "polygon", "seedling", _fill("#aed581")),
    ("compost", "Compost", "growing", "element", "polygon", "recycle", _fill("#6d4c41", 0.7)),
    # water
    ("pond", "Pond", "water", "element", "polygon", "droplets", _fill("#1e88e5", 0.6)),
    ("swale", "Swale", "water", "element", "line", "waves", _line("#0277bd", 4)),
    ("water_tank", "Water tank", "water", "element", "polygon", "cylinder", _fill("#0d47a1", 0.8)),
    ("well", "Well", "water", "element", "polygon", "circle-dot", _fill("#1a237e", 0.8)),
    ("stream", "Stream", "water", "element", "line", "waves", _line("#4fc3f7", 3)),
    # boundaries
    ("fence", "Fence", "boundary", "element", "line", "fence", _line("#5d4037", 2, dash=True)),
    (
        "hedge",
        "Hedge",
        "boundary",
        "element",
        "line",
        "hedge",
        _line("#33691e", 5, row=("shrub", 1.5)),
    ),
    (
        "windbreak",
        "Windbreak",
        "boundary",
        "element",
        "line",
        "wind",
        _line("#1b5e20", 6, row=("tree", 4.0)),
    ),
    # animals
    ("paddock", "Paddock", "animals", "element", "polygon", "paw-print", _fill("#dce775")),
    ("beehive", "Beehive", "animals", "element", "point", "hexagon", _pin("#fbc02d")),
    # access
    ("path", "Path", "access", "path", "line", "route", _line("#8d6e63", 4, width_m=1.0)),
    ("road", "Road", "access", "path", "line", "road", _line("#616161", 5, width_m=4.0)),
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

# The real-world footprint of each palette entry. ``round`` and ``rect`` entries are placed as a
# to-scale polygon with one click, at the size below: a diameter, or a width (east-west) by a length
# (north-south) before any rotation. ``point`` and ``line`` entries are drawn as before, and
# ``area`` entries (zones, paddocks, a food forest) are shaped by hand to fit the land.
_SHAPES: dict[str, tuple[str, float | None, float | None, float | None]] = {
    # key: (shape, width_m, length_m, diameter_m)
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

# The current catalog: ``geometry_type``, ``default_style``, ``default_properties`` (needs /
# yields),
# the map ``icon`` (a glyph key from ``planning.icons``, None for lines and overlays) and the
# footprint (``shape`` plus its default size) per key. ``0007_element_type_defaults``,
# ``0009_element_type_icons``, ``0010_element_type_footprints``, ``0013_path_widths`` and
# ``0014_row_icons`` hold frozen
# copies; a test keeps them in step, so a change here ships together with a new migration.
ELEMENT_TYPE_CATALOG: dict[str, dict[str, Any]] = {
    row["key"]: {
        "geometry_type": row["geometry_type"],
        "default_style": row["default_style"],
        "default_properties": _FUNCTIONS.get(row["key"], {}),
        "icon": ICON_BY_TYPE[row["key"]],
        "shape": _SHAPES[row["key"]][0],
        "default_width_m": _SHAPES[row["key"]][1],
        "default_length_m": _SHAPES[row["key"]][2],
        "default_diameter_m": _SHAPES[row["key"]][3],
    }
    for row in ELEMENT_TYPES
}
