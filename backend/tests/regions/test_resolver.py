"""Resolver tests use stub adapters, so they need neither a DB nor the real providers."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.core.geo import BBox
from app.modules.regions.profiles import (
    GLOBAL_PROFILE_CODE,
    RegionProfile,
    RegionProfileStore,
)
from app.modules.regions.providers import (
    DataProvider,
    DuplicateProviderError,
    ProviderRegistry,
    StaticProvider,
)
from app.modules.regions.resolver import NoProviderAvailableError, RegionResolver
from app.modules.regions.seed import seed_profile_store

NAIROBI = BBox(36.80, -1.30, 36.82, -1.28)
BERLIN = BBox(13.40, 52.50, 13.42, 52.52)


@dataclass
class StubProvider:
    key: str
    category: str
    attribution: str = "stub"
    license: str = "stub-license"
    terms_url: str = "https://example.org/terms"
    cacheable: bool = True
    covering: bool = True

    def covers(self, bbox: BBox) -> bool:
        return self.covering


def make_resolver(
    esri_covers: bool = True,
) -> tuple[RegionResolver, StubProvider, StubProvider, StubProvider]:
    esri = StubProvider("esri_world_imagery", "imagery", cacheable=False, covering=esri_covers)
    s2 = StubProvider("sentinel2_cloudless", "imagery")
    dem = StubProvider("copernicus_dem_glo30", "elevation")
    return RegionResolver(ProviderRegistry([esri, s2, dem]), seed_profile_store()), esri, s2, dem


def test_stub_satisfies_protocol() -> None:
    assert isinstance(StubProvider("k", "imagery"), DataProvider)


def test_kenya_imagery_resolves_to_esri() -> None:
    resolver, esri, _, _ = make_resolver()
    assert resolver.resolve("KE", NAIROBI, "imagery") is esri


def test_country_code_is_case_insensitive() -> None:
    resolver, esri, _, _ = make_resolver()
    assert resolver.resolve("ke", NAIROBI, "imagery") is esri


def test_falls_back_to_sentinel2_when_esri_does_not_cover() -> None:
    resolver, _, s2, _ = make_resolver(esri_covers=False)
    assert resolver.resolve("KE", NAIROBI, "imagery") is s2


def test_unknown_country_resolves_via_global_profile() -> None:
    resolver, _, s2, dem = make_resolver()
    assert resolver.profiles.get("ZZ") is None
    assert resolver.resolve("ZZ", BERLIN, "imagery") is s2
    assert resolver.resolve("ZZ", BERLIN, "elevation") is dem


def test_elevation_resolves() -> None:
    resolver, _, _, dem = make_resolver()
    assert resolver.resolve("KE", NAIROBI, "elevation") is dem


def test_unregistered_chain_entries_are_skipped() -> None:
    profiles = RegionProfileStore(
        [
            RegionProfile(country_code="DE", providers={"imagery": ["de_dop", "esri"]}),
            RegionProfile(country_code=GLOBAL_PROFILE_CODE, providers={"imagery": ["s2"]}),
        ]
    )
    esri = StubProvider("esri", "imagery")
    resolver = RegionResolver(ProviderRegistry([esri, StubProvider("s2", "imagery")]), profiles)
    assert resolver.resolve("DE", BERLIN, "imagery") is esri


def test_raises_when_nothing_in_chain_covers() -> None:
    resolver, _, s2, _ = make_resolver(esri_covers=False)
    s2.covering = False
    with pytest.raises(NoProviderAvailableError):
        resolver.resolve("KE", NAIROBI, "imagery")


def test_chain_is_country_then_global_without_duplicates() -> None:
    resolver, *_ = make_resolver()
    assert [p.key for p in resolver.chain("KE", "imagery")] == [
        "esri_world_imagery",
        "sentinel2_cloudless",
    ]


def test_unknown_category_raises() -> None:
    resolver, *_ = make_resolver()
    with pytest.raises(NoProviderAvailableError):
        resolver.resolve("KE", NAIROBI, "soil")


def test_new_region_needs_no_resolver_change() -> None:
    """Adding Germany = one adapter + one profile (data); the resolver is untouched."""
    resolver, _, _, _ = make_resolver()
    dop = StubProvider("de_dop_orthophoto", "imagery", license="DL-DE-BY-2.0")
    resolver.registry.register(dop)
    resolver.profiles.add(
        RegionProfile(
            country_code="DE",
            providers={"imagery": ["de_dop_orthophoto", "esri_world_imagery"]},
        )
    )
    assert resolver.resolve("DE", BERLIN, "imagery") is dop
    dop.covering = False
    assert resolver.resolve("DE", BERLIN, "imagery").key == "esri_world_imagery"
    # An unrelated country is unaffected.
    assert resolver.resolve("KE", NAIROBI, "imagery").key == "esri_world_imagery"


def test_categories_are_open_ended() -> None:
    profiles = RegionProfileStore(
        [RegionProfile(country_code=GLOBAL_PROFILE_CODE, providers={"climate": ["worldclim"]})]
    )
    worldclim = StubProvider("worldclim", "climate")
    resolver = RegionResolver(ProviderRegistry([worldclim]), profiles)
    assert resolver.resolve("KE", NAIROBI, "climate") is worldclim


def test_profile_store_requires_global_profile() -> None:
    with pytest.raises(ValueError, match="global fallback"):
        RegionProfileStore([RegionProfile(country_code="KE")])


def test_registry_rejects_duplicates_unless_replace() -> None:
    registry = ProviderRegistry([StubProvider("a", "imagery")])
    with pytest.raises(DuplicateProviderError):
        registry.register(StubProvider("a", "imagery"))
    replacement = StubProvider("a", "imagery", attribution="new")
    registry.register(replacement, replace=True)
    assert registry.get("a") is replacement
    assert len(registry) == 1
    assert "a" in registry
    assert registry.by_category("imagery") == [replacement]


def test_static_provider_coverage_bbox() -> None:
    kenya = StaticProvider(
        "k", "imagery", "a", "l", "https://x", True, coverage=BBox(33.0, -5.0, 42.0, 6.0)
    )
    assert kenya.covers(NAIROBI)
    assert not kenya.covers(BERLIN)
    assert StaticProvider("g", "imagery", "a", "l", "https://x", True).covers(BERLIN)
