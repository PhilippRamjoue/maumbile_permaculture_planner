"""Contract test for every adapter, plus checks specific to the built-in ones."""

from __future__ import annotations

import pytest

from app.modules.imagery.providers import (
    EsriWorldImageryProvider,
    ImageryProvider,
    Sentinel2CloudlessProvider,
    register_imagery_providers,
)
from app.modules.imagery.tests.contract import ProviderFactory, assert_imagery_provider_contract
from app.modules.imagery.tests.stubs import JPEG_TILE, StubUpstream
from app.modules.regions.catalog import BUILTIN_PROVIDERS, builtin_registry

# Add new adapters here: the contract is the bar they must clear.
ADAPTERS: dict[str, ProviderFactory] = {
    "esri": lambda client: EsriWorldImageryProvider(client=client),
    "sentinel2": lambda client: Sentinel2CloudlessProvider(client=client),
}


@pytest.mark.parametrize("factory", ADAPTERS.values(), ids=ADAPTERS.keys())
async def test_adapter_satisfies_contract(factory: ProviderFactory) -> None:
    await assert_imagery_provider_contract(factory)


def test_cacheable_flags_follow_the_providers_terms() -> None:
    assert EsriWorldImageryProvider().cacheable is False
    assert Sentinel2CloudlessProvider().cacheable is True


@pytest.mark.parametrize("cls", [EsriWorldImageryProvider, Sentinel2CloudlessProvider])
def test_adapter_metadata_matches_catalog(cls: type[ImageryProvider]) -> None:
    """Adapters replace catalog entries, so rights metadata must not drift from them."""
    adapter = cls()
    entry = next(p for p in BUILTIN_PROVIDERS if p.key == adapter.key)
    assert (adapter.attribution, adapter.license, adapter.terms_url, adapter.cacheable) == (
        entry.attribution,
        entry.license,
        entry.terms_url,
        entry.cacheable,
    )


def test_adapters_are_registered_in_place_of_catalog_entries() -> None:
    registry = builtin_registry()
    register_imagery_providers(registry)
    for key in ("esri_world_imagery", "sentinel2_cloudless"):
        assert isinstance(registry.get(key), ImageryProvider)
    assert len(registry) == len(BUILTIN_PROVIDERS)


async def test_tile_urls_use_the_providers_axis_order() -> None:
    esri, eox = StubUpstream(), StubUpstream()
    assert await EsriWorldImageryProvider(client=esri.client()).get_tile(10, 5, 7) == JPEG_TILE
    assert await Sentinel2CloudlessProvider(client=eox.client()).get_tile(10, 5, 7) == JPEG_TILE
    # Both providers address tiles as z/y/x.
    assert str(esri.requests[0].url).endswith("/tile/10/7/5")
    assert str(eox.requests[0].url).endswith("/GoogleMapsCompatible/10/7/5.jpg")
