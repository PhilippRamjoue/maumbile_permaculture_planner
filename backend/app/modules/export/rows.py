"""Bounded planting rows at ground distances, matching the editor's row semantics."""

import math
from typing import Any

EARTH_RADIUS_M = 6_371_008.8
MAX_ROW_ICONS = 1500


def row_points(geometry: dict[str, Any], spacing: float) -> list[tuple[float, float]]:
    if geometry.get("type") != "LineString" or not math.isfinite(spacing) or spacing <= 0:
        return []
    points = geometry["coordinates"]
    lengths = []
    for a, b in zip(points, points[1:], strict=False):
        lat1, lat2 = math.radians(a[1]), math.radians(b[1])
        h = (
            math.sin((lat2 - lat1) / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(math.radians(b[0] - a[0]) / 2) ** 2
        )
        lengths.append(2 * EARTH_RADIUS_M * math.asin(math.sqrt(min(1, max(0, h)))))
    total = sum(lengths)
    if total <= 0:
        return []
    step = max(spacing, total / MAX_ROW_ICONS)
    segment, before = 0, 0.0
    result = []
    for n in range(min(MAX_ROW_ICONS + 1, math.floor((total + 1e-3) / step) + 1)):
        at = n * step
        while segment < len(lengths) - 1 and at > before + lengths[segment]:
            before += lengths[segment]
            segment += 1
        a, b = points[segment], points[segment + 1]
        t = min(1, max(0, (at - before) / lengths[segment])) if lengths[segment] > 0 else 0
        result.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return result
