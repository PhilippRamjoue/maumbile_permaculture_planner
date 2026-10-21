"""Generic provider resolver. All region knowledge lives in the profile data."""

from __future__ import annotations

import structlog

from app.core.geo import BBox
from app.modules.regions.profiles import RegionProfileStore
from app.modules.regions.providers import DataProvider, ProviderRegistry

log = structlog.get_logger(__name__)


class NoProviderAvailableError(LookupError):
    """No provider in the country chain or the global fallback covers the request."""

    def __init__(self, country_code: str, category: str) -> None:
        super().__init__(f"no {category!r} provider covers the requested area for {country_code!r}")
        self.country_code = country_code
        self.category = category


class RegionResolver:
    def __init__(self, registry: ProviderRegistry, profiles: RegionProfileStore) -> None:
        self.registry = registry
        self.profiles = profiles

    def chain(self, country_code: str, category: str) -> list[DataProvider]:
        """Providers to try in order: the country's chain, then the global ``"*"`` chain.

        Keys without a registered adapter are skipped (a profile may name an adapter that
        is not deployed yet); duplicates keep their first position.
        """
        keys: list[str] = []
        for profile in (self.profiles.get(country_code), self.profiles.fallback):
            if profile is not None:
                keys.extend(profile.chain(category))

        providers: list[DataProvider] = []
        seen: set[str] = set()
        for key in keys:
            if key in seen:
                continue
            seen.add(key)
            provider = self.registry.get(key)
            if provider is None:
                log.warning("region_provider_not_registered", key=key, category=category)
                continue
            providers.append(provider)
        return providers

    def resolve(self, country_code: str, bbox: BBox, category: str) -> DataProvider:
        """First provider in the chain whose ``covers(bbox)`` is true."""
        for provider in self.chain(country_code, category):
            if provider.covers(bbox):
                return provider
        raise NoProviderAvailableError(country_code, category)

    def categories(self, country_code: str) -> list[str]:
        """Categories that have a chain for this country or the global fallback."""
        names: dict[str, None] = {}
        for profile in (self.profiles.get(country_code), self.profiles.fallback):
            if profile is not None:
                names.update(dict.fromkeys(c for c, keys in profile.providers.items() if keys))
        return list(names)
