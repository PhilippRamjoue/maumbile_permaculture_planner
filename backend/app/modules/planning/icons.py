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


def _arc(
    cx: float, cy: float, r: float, a0: float, a1: float, n: int = 12
) -> list[tuple[float, float]]:
    # Degrees, clockwise with y pointing down: 0° is east, 90° south, 180° west, 270° north.
    return _round(
        [
            (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
            for a in (a0 + (a1 - a0) * i / n for i in range(n + 1))
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
    # A bold banana crescent with a short stalk.
    "banana_circle": [
        _shape(
            (8, 4), (13, 6), (16, 12), (14, 18), (9, 20), (11, 16), (12, 11), (10, 7), fill=True
        ),
        _line((8, 4), (6, 2)),
    ],
    # A round bed with a central compost basket and the wedge path that reaches it.
    "keyhole_garden": [
        _dot(12, 12, 8, fill=False),
        _dot(12, 12, 2.4, fill=False),
        _line((9.5, 19.5), (12, 12)),
        _line((14.5, 19.5), (12, 12)),
    ],
    # Three young fruit trees, a small grove.
    "orchard": [
        _dot(7, 9, 3, fill=False),
        _line((7, 12), (7, 17)),
        _dot(17, 9, 3, fill=False),
        _line((17, 12), (17, 17)),
        _dot(12, 13, 3, fill=False),
        _line((12, 16), (12, 20)),
    ],
    # A goat's head: horns swept back, a wispy beard.
    "goat_pen": [
        _shape((9, 10), (15, 10), (14, 17), (12, 19), (10, 17), fill=False),
        _line((9, 10), (6, 5)),
        _line((15, 10), (18, 5)),
        _line((12, 19), (12, 22)),
        _dot(10.6, 13, 0.7, fill=True),
        _dot(13.4, 13, 0.7, fill=True),
    ],
    # A cow's head: wide horns and a broad muzzle.
    "cattle_shed": [
        _shape((8, 9), (16, 9), (16, 15), (12, 19), (8, 15), fill=False),
        _line((8, 9), (3, 6)),
        _line((16, 9), (21, 6)),
        _shape((10, 15), (14, 15), (14, 18), (10, 18), fill=False),
        _dot(11, 16.6, 0.7, fill=True),
        _dot(13, 16.6, 0.7, fill=True),
        _dot(9.9, 12, 0.7, fill=True),
        _dot(14.1, 12, 0.7, fill=True),
    ],
    # A pig's head: round, with pricked ears and a snout.
    "pig_pen": [
        _dot(12, 13, 6, fill=False),
        _shape((8.5, 5), (11, 9), (8, 9.5), fill=True),
        _shape((15.5, 5), (16, 9.5), (13, 9), fill=True),
        _dot(12, 15, 2.6, fill=False),
        _dot(11, 15, 0.6, fill=True),
        _dot(13, 15, 0.6, fill=True),
        _dot(9.9, 11.5, 0.7, fill=True),
        _dot(14.1, 11.5, 0.7, fill=True),
    ],
    # A rabbit: round head with two tall ears.
    "rabbit_hutch": [
        _dot(12, 14, 4, fill=False),
        _shape((10, 11), (8.5, 3), (11.4, 10.4), fill=True),
        _shape((14, 11), (15.5, 3), (12.6, 10.4), fill=True),
        _dot(10.6, 14, 0.7, fill=True),
        _dot(13.4, 14, 0.7, fill=True),
        _dot(12, 16, 0.8, fill=True),
    ],
    # A fish, side on, with a fanned tail.
    "fish_pond": [
        _shape((4, 12), (11, 7), (18, 12), (11, 17), fill=False),
        _shape((18, 12), (22, 8), (22, 16), fill=True),
        _dot(8, 11, 0.9, fill=True),
    ],
    # A cased borehole into the ground, water at the head.
    "borehole": [
        _line((7, 21), (17, 21)),
        _shape((10.5, 21), (10.5, 6), (13.5, 6), (13.5, 21), fill=False),
        _dot(12, 3.2, 1.6, fill=True),
    ],
    # A granary basket on stilts under a conical roof.
    "grain_store": [
        _shape((5, 9), (12, 4), (19, 9), fill=True),
        _shape((7, 9), (17, 9), (16, 17), (8, 17), fill=False),
        _line((9, 17), (9, 21)),
        _line((15, 17), (15, 21)),
    ],
    # A biogas digester: a buried dome with its gas outlet.
    "biogas": [
        _line((4, 18), (20, 18)),
        _line(*_arc(12, 18, 7, 180, 360)),
        _shape((11, 11), (13, 11), (13, 6), (11, 6), fill=False),
        _dot(12, 4, 1.4, fill=True),
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
    "banana_circle": "banana_circle",
    "keyhole_garden": "keyhole_garden",
    "orchard": "orchard",
    "goat_pen": "goat_pen",
    "cattle_shed": "cattle_shed",
    "pig_pen": "pig_pen",
    "rabbit_hutch": "rabbit_hutch",
    "fish_pond": "fish_pond",
    "borehole": "borehole",
    "dam": None,
    "grain_store": "grain_store",
    "biogas": "biogas",
}
