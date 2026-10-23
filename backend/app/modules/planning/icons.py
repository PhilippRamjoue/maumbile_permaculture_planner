"""The map icon set: a few dozen strokes per glyph on a 24 x 24 grid, drawn the same everywhere.

One definition feeds every renderer: the editor map and palette (via the generated
``frontend/src/entities/generated/icons.ts``) and the server-side PNG/PDF export (Pillow). Glyphs
are plain geometry, so they carry no icon-font or licence baggage and stay crisp and legible when
printed in black and white: each is a line drawing (round caps) with a few solid shapes.

An op is ``{"path": [[x, y], ...], "closed": bool, "fill": bool}`` (a polyline or polygon) or
``{"circle": [x, y, r], "fill": bool}``.
"""

from __future__ import annotations

import math
from typing import Any

Op = dict[str, Any]
Glyph = list[Op]


def _line(*points: tuple[float, float]) -> Op:
    return {"path": [list(p) for p in points], "closed": False, "fill": False}


def _shape(*points: tuple[float, float], fill: bool = False) -> Op:
    return {"path": [list(p) for p in points], "closed": True, "fill": fill}


def _dot(x: float, y: float, r: float, fill: bool = True) -> Op:
    return {"circle": [x, y, r], "fill": fill}


def _round(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [(round(x, 2), round(y, 2)) for x, y in points]


def _ellipse(cx: float, cy: float, rx: float, ry: float, n: int = 16) -> list[tuple[float, float]]:
    return _round(
        [
            (cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n))
            for i in range(n)
        ]
    )


def _egg(cx: float, cy: float, rx: float, ry: float, n: int = 18) -> list[tuple[float, float]]:
    # Wider at the bottom than at the top.
    return _round(
        [
            (
                cx + rx * math.cos(2 * math.pi * i / n) * (1 + 0.2 * math.sin(2 * math.pi * i / n)),
                cy + ry * math.sin(2 * math.pi * i / n),
            )
            for i in range(n)
        ]
    )


def _teardrop() -> list[tuple[float, float]]:
    # A point at the top, then the lower round part from the right side through the bottom.
    arc = [
        (12 + 6.5 * math.cos(math.radians(t)), 14.5 - 6.5 * math.sin(math.radians(t)))
        for t in range(30, -211, -30)
    ]
    return _round([(12, 3), *arc])


def _spiral() -> list[tuple[float, float]]:
    steps = 36
    return _round(
        [
            (
                12 + (1 + 8 * i / steps) * math.cos(2.2 * 2 * math.pi * i / steps),
                12 + (1 + 8 * i / steps) * math.sin(2.2 * 2 * math.pi * i / steps),
            )
            for i in range(steps + 1)
        ]
    )


GLYPHS: dict[str, Glyph] = {
    "tree": [_dot(12, 9, 6.5), _line((12, 15), (12, 21))],
    "trees": [
        _dot(7.5, 10, 4.5),
        _dot(16.5, 10, 4.5),
        _line((7.5, 14), (7.5, 20)),
        _line((16.5, 14), (16.5, 20)),
    ],
    "shrub": [_dot(7.5, 15, 4), _dot(16.5, 15, 4), _dot(12, 10, 4.5), _line((4, 20), (20, 20))],
    "sprout": [
        _line((12, 21), (12, 11)),
        _shape((12, 15), (6, 16), (4, 9), (10, 9), fill=True),
        _shape((12, 12), (14, 6), (20, 5), (19, 11), fill=True),
    ],
    "bed": [
        _shape((4, 6), (20, 6), (20, 18), (4, 18)),
        _dot(8, 12, 1.6),
        _dot(12, 12, 1.6),
        _dot(16, 12, 1.6),
    ],
    "spiral": [_line(*_spiral())],
    "house": [
        _shape((4, 11), (12, 4), (20, 11), (20, 20), (4, 20)),
        _shape((10, 20), (10, 15), (14, 15), (14, 20), fill=True),
    ],
    "shed": [_shape((4, 10), (20, 6), (20, 20), (4, 20)), _line((9, 20), (9, 14), (15, 14))],
    "greenhouse": [
        _shape((4, 20), (4, 13), (7, 8), (12, 5), (17, 8), (20, 13), (20, 20)),
        _line((12, 5), (12, 20)),
        _line((4, 13), (20, 13)),
    ],
    "egg": [
        _shape(*_egg(12, 13, 5.5, 7.5)),
        _dot(10, 11, 1),
        _dot(14, 14, 1),
        _dot(10.5, 16.5, 1),
    ],
    "outhouse": [
        _shape((6, 4), (18, 4), (18, 21), (6, 21)),
        _line((6, 8), (18, 8)),
        _dot(15, 14, 1.2),
    ],
    "drop": [_shape(*_teardrop(), fill=True)],
    "tank": [
        _shape((6.5, 5), (17.5, 5), (17.5, 20), (6.5, 20)),
        _line((6.5, 9), (17.5, 9)),
        _line((6.5, 16), (17.5, 16)),
    ],
    "well": [_dot(12, 12, 8, fill=False), _dot(12, 12, 3.5)],
    "paw": [
        _shape(*_ellipse(12, 16, 5, 4), fill=True),
        _dot(5.8, 11, 2.2),
        _dot(9.6, 6.8, 2.2),
        _dot(14.4, 6.8, 2.2),
        _dot(18.2, 11, 2.2),
    ],
    "hive": [
        _shape((12, 3), (19, 7.5), (19, 16.5), (12, 21), (5, 16.5), (5, 7.5)),
        _line((5, 12), (19, 12)),
    ],
    "mound": [_shape((3, 20), (8, 12), (12, 9), (16, 12), (21, 20), fill=True)],
    "note": [
        _shape((4, 5), (20, 5), (20, 16), (11, 16), (6, 20), (7, 16), (4, 16)),
        _line((8, 9), (16, 9)),
        _line((8, 12), (14, 12)),
    ],
}

# Which glyph each palette entry (by key) is drawn with. Lines (swale, fence, path, ...) and the
# planning overlays (zone, sector) are drawn as styled lines and areas, not with an icon.
ICON_BY_TYPE: dict[str, str | None] = {
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
