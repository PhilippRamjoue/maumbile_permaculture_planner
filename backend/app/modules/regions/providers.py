"""The shared ``DataProvider`` interface and the provider registry."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from app.core.geo import BBox


@runtime_checkable
class DataProvider(Protocol):
    """Shared base for every data source, of any category.

    Rights metadata lives on the provider so the in-app credits page and the map
    attribution control are generated from it and cannot drift (docs/DATA_SOURCES.md).
    Category-specific adapters (imagery tiles, DEM windows, ...) add their own methods.
    """

    # Read-only members, so frozen dataclasses (and plain classes) satisfy the protocol.
    @property
    def key(self) -> str:
        """Stable id used in region profiles, e.g. "esri_world_imagery"."""
        ...

    @property
    def category(self) -> str:
        """ "imagery" | "elevation" | "climate" | ..."""
        ...

    @property
    def attribution(self) -> str:
        """Human-readable credit line shown in-app."""
        ...

    @property
    def license(self) -> str:
        """SPDX id or short name, e.g. "CC-BY-4.0"."""
        ...

    @property
    def terms_url(self) -> str:
        """Link users can open to verify rights."""
        ...

    @property
    def cacheable(self) -> bool:
        """May we store responses? (per the source's ToS)"""
        ...

    def covers(self, bbox: BBox) -> bool: ...


@dataclass(frozen=True)
class StaticProvider:
    """A metadata-only provider whose coverage is a fixed bounding box (or global).

    Used for the built-in catalog (``catalog.py``) and as a handy stub. Real adapters
    (WP4/WP5) replace these entries in the registry with ``register(..., replace=True)``.
    """

    key: str
    category: str
    attribution: str
    license: str
    terms_url: str
    cacheable: bool
    coverage: BBox | None = None  # None = global

    def covers(self, bbox: BBox) -> bool:
        if self.coverage is None:
            return True
        c = self.coverage
        return (
            bbox.min_lon >= c.min_lon
            and bbox.max_lon <= c.max_lon
            and bbox.min_lat >= c.min_lat
            and bbox.max_lat <= c.max_lat
        )


class DuplicateProviderError(ValueError):
    """Raised when registering a provider key that already exists."""


class ProviderRegistry:
    """Keyed collection of providers; adapters register themselves here."""

    def __init__(self, providers: Iterable[DataProvider] = ()) -> None:
        self._providers: dict[str, DataProvider] = {}
        for provider in providers:
            self.register(provider)

    def register(self, provider: DataProvider, *, replace: bool = False) -> None:
        if provider.key in self._providers and not replace:
            raise DuplicateProviderError(f"provider {provider.key!r} is already registered")
        self._providers[provider.key] = provider

    def get(self, key: str) -> DataProvider | None:
        return self._providers.get(key)

    def all(self) -> list[DataProvider]:
        return list(self._providers.values())

    def by_category(self, category: str) -> list[DataProvider]:
        return [p for p in self._providers.values() if p.category == category]

    def __contains__(self, key: object) -> bool:
        return key in self._providers

    def __len__(self) -> int:
        return len(self._providers)
