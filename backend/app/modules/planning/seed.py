"""Seeded ElementType catalog (data, not logic). Add a palette entry by adding a row here.

Applied by the ``0003_planning`` migration. Later changes ship as a new migration that
upserts by ``key``.
"""

from __future__ import annotations

from typing import Any


def _fill(color: str, opacity: float = 0.4) -> dict[str, Any]:
    return {"fill": color, "fill_opacity": opacity, "stroke": color}


def _line(color: str, width: float = 3, dash: bool = False) -> dict[str, Any]:
    style: dict[str, Any] = {"stroke": color, "stroke_width": width}
    if dash:
        style["dash"] = True
    return style


def _pin(color: str) -> dict[str, Any]:
    return {"fill": color, "stroke": "#ffffff", "radius": 8}


# (key, name, category, feature_type, geometry_type, icon, default_style)
_ROWS: tuple[tuple[str, str, str, str, str, str, dict[str, Any]], ...] = (
    # structures
    ("house", "House", "structure", "element", "polygon", "home", _fill("#8d6e63", 0.7)),
    ("shed", "Shed", "structure", "element", "polygon", "warehouse", _fill("#a1887f", 0.7)),
    ("greenhouse", "Greenhouse", "structure", "element", "polygon", "greenhouse", _fill("#80cbc4")),
    ("chicken_coop", "Chicken coop", "structure", "element", "polygon", "egg", _fill("#ffb74d")),
    ("toilet", "Compost toilet", "structure", "element", "point", "toilet", _pin("#795548")),
    # growing
    ("bed", "Garden bed", "growing", "element", "polygon", "sprout", _fill("#7cb342")),
    ("food_forest", "Food forest", "growing", "element", "polygon", "trees", _fill("#2e7d32")),
    ("tree", "Tree", "growing", "element", "point", "tree", _pin("#388e3c")),
    ("shrub", "Shrub", "growing", "element", "point", "leaf", _pin("#689f38")),
    ("herb_spiral", "Herb spiral", "growing", "element", "point", "spiral", _pin("#9ccc65")),
    ("nursery", "Nursery", "growing", "element", "polygon", "seedling", _fill("#aed581")),
    ("compost", "Compost", "growing", "element", "point", "recycle", _pin("#6d4c41")),
    # water
    ("pond", "Pond", "water", "element", "polygon", "droplets", _fill("#29b6f6", 0.6)),
    ("swale", "Swale", "water", "element", "line", "waves", _line("#0277bd", 4)),
    ("water_tank", "Water tank", "water", "element", "point", "cylinder", _pin("#0288d1")),
    ("well", "Well", "water", "element", "point", "circle-dot", _pin("#01579b")),
    ("stream", "Stream", "water", "element", "line", "waves", _line("#4fc3f7", 3)),
    # boundaries
    ("fence", "Fence", "boundary", "element", "line", "fence", _line("#5d4037", 2, dash=True)),
    ("hedge", "Hedge", "boundary", "element", "line", "hedge", _line("#33691e", 5)),
    ("windbreak", "Windbreak", "boundary", "element", "line", "wind", _line("#1b5e20", 6)),
    # animals
    ("paddock", "Paddock", "animals", "element", "polygon", "paw-print", _fill("#dce775")),
    ("beehive", "Beehive", "animals", "element", "point", "hexagon", _pin("#fbc02d")),
    # access
    ("path", "Path", "access", "path", "line", "route", _line("#bcaaa4", 3)),
    ("road", "Road", "access", "path", "line", "road", _line("#757575", 5)),
    # planning overlays
    ("zone", "Zone", "planning", "zone", "polygon", "target", _fill("#ffa726", 0.25)),
    ("sector", "Sector", "planning", "sector", "polygon", "compass", _fill("#ef5350", 0.25)),
    ("note", "Note", "planning", "annotation", "point", "message-square", _pin("#fdd835")),
)

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
