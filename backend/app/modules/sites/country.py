"""Offline country lookup from a coordinate.

Uses the ``reverse_geocoder`` package (bundled GeoNames cities, nearest-city match), so it
needs no network. It is a lightweight heuristic: near borders, or at sea (where it still
returns the nearest city's country), the result can be wrong. Callers may always pass an
explicit ``country_code`` to override it.
"""

from __future__ import annotations

from collections.abc import Callable

# (lng, lat) -> ISO-3166 alpha-2 code, or None if unknown.
CountryLocator = Callable[[float, float], str | None]


def locate_country(lng: float, lat: float) -> str | None:
    import reverse_geocoder  # lazy: loads a ~20 MB dataset on first use

    # mode=1 -> single process (the default multiprocessing mode misbehaves under servers).
    result = reverse_geocoder.search([(lat, lng)], mode=1, verbose=False)
    cc = result[0].get("cc") if result else None
    return str(cc).upper() if cc else None
