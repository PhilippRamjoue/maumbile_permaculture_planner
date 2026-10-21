"""Process-wide resolver wiring. Tests override ``get_resolver`` via dependency_overrides."""

from __future__ import annotations

from functools import lru_cache

from app.modules.imagery.providers import register_imagery_providers
from app.modules.regions.catalog import builtin_registry
from app.modules.regions.providers import ProviderRegistry
from app.modules.regions.resolver import RegionResolver
from app.modules.regions.seed import seed_profile_store


@lru_cache(maxsize=1)
def get_resolver() -> RegionResolver:
    registry = builtin_registry()
    # Real adapters replace the metadata-only catalog entries (same keys).
    register_imagery_providers(registry)
    return RegionResolver(registry, seed_profile_store())


def get_registry() -> ProviderRegistry:
    """The shared registry; WP4/WP5 adapters register themselves here at startup."""
    return get_resolver().registry
