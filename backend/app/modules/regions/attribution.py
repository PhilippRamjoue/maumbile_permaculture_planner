"""Build the data behind the in-app credits page from provider metadata."""

from __future__ import annotations

from pydantic import BaseModel

from app.core.geo import BBox
from app.modules.regions.providers import DataProvider
from app.modules.regions.resolver import NoProviderAvailableError, RegionResolver


class SourceInfo(BaseModel):
    key: str
    category: str
    attribution: str
    license: str
    terms_url: str
    cacheable: bool

    @classmethod
    def from_provider(cls, provider: DataProvider) -> SourceInfo:
        return cls(
            key=provider.key,
            category=provider.category,
            attribution=provider.attribution,
            license=provider.license,
            terms_url=provider.terms_url,
            cacheable=provider.cacheable,
        )


def _unique(providers: list[DataProvider]) -> list[DataProvider]:
    seen: dict[str, DataProvider] = {}
    for provider in providers:
        seen.setdefault(provider.key, provider)
    return list(seen.values())


def sources_for_region(
    resolver: RegionResolver, country_code: str, bbox: BBox | None = None
) -> list[SourceInfo]:
    """Sources relevant to a country.

    With a ``bbox``: the provider actually resolved per category (what a site there uses).
    Without: every provider in the country's chains (primary and fallbacks).
    """
    providers: list[DataProvider] = []
    for category in resolver.categories(country_code):
        if bbox is None:
            providers.extend(resolver.chain(country_code, category))
            continue
        try:
            providers.append(resolver.resolve(country_code, bbox, category))
        except NoProviderAvailableError:
            continue
    return [SourceInfo.from_provider(p) for p in _unique(providers)]


def all_sources(resolver: RegionResolver) -> list[SourceInfo]:
    return [SourceInfo.from_provider(p) for p in resolver.registry.all()]
