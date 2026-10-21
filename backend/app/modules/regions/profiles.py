"""Region profiles: per-country provider chains and map defaults, as data."""

from __future__ import annotations

from collections.abc import Iterable

from pydantic import BaseModel, Field

GLOBAL_PROFILE_CODE = "*"


def normalize_country_code(code: str) -> str:
    """Upper-case ISO-3166 alpha-2 code; the global fallback ``"*"`` is kept as is."""
    return code.strip().upper()


class MapDefaults(BaseModel):
    center_lon: float
    center_lat: float
    zoom: int


class RegionProfile(BaseModel):
    """Ordered provider keys per category (primary first) plus defaults for one country."""

    country_code: str
    name: str = ""
    providers: dict[str, list[str]] = Field(default_factory=dict)
    units: str = "metric"
    map: MapDefaults | None = None

    def chain(self, category: str) -> list[str]:
        return self.providers.get(category, [])


class RegionProfileStore:
    """Lookup of profiles by country code; guarantees a global ``"*"`` profile exists."""

    def __init__(self, profiles: Iterable[RegionProfile]) -> None:
        self._profiles = {normalize_country_code(p.country_code): p for p in profiles}
        if GLOBAL_PROFILE_CODE not in self._profiles:
            raise ValueError(f"a global fallback profile ({GLOBAL_PROFILE_CODE!r}) is required")

    def add(self, profile: RegionProfile) -> None:
        self._profiles[normalize_country_code(profile.country_code)] = profile

    def get(self, country_code: str) -> RegionProfile | None:
        """The profile registered for exactly this country, if any."""
        return self._profiles.get(normalize_country_code(country_code))

    @property
    def fallback(self) -> RegionProfile:
        return self._profiles[GLOBAL_PROFILE_CODE]

    def effective(self, country_code: str) -> RegionProfile:
        """The country's profile, or the global one if the country has none."""
        return self.get(country_code) or self.fallback

    def all(self) -> list[RegionProfile]:
        return list(self._profiles.values())
