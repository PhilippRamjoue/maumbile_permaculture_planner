"""Built-in provider metadata, mirroring docs/DATA_SOURCES.md.

Until the real adapters land (WP4 imagery, WP5 elevation) these metadata-only entries let
the credits page and resolver work end to end. An adapter replaces its entry via
``registry.register(adapter, replace=True)`` and must keep the same ``key`` and metadata.
"""

from __future__ import annotations

from app.modules.regions.providers import ProviderRegistry, StaticProvider

ESRI_WORLD_IMAGERY = StaticProvider(
    key="esri_world_imagery",
    category="imagery",
    attribution="Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    license=(
        "Esri Terms of Use (grey for commercial; used here for a free/non-commercial "
        "deployment with attribution)"
    ),
    terms_url="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9",
    cacheable=False,
)

OSM_STANDARD = StaticProvider(
    key="osm_standard",
    category="imagery",
    attribution="© OpenStreetMap contributors",
    license="Map data ODbL 1.0; map tiles © OpenStreetMap Foundation (tile usage policy)",
    terms_url="https://www.openstreetmap.org/copyright",
    cacheable=True,
)

SENTINEL2_CLOUDLESS = StaticProvider(
    key="sentinel2_cloudless",
    category="imagery",
    attribution=(
        "Sentinel-2 cloudless — https://s2maps.eu by EOX IT Services GmbH "
        "(contains modified Copernicus Sentinel data)"
    ),
    license="CC-BY-4.0",
    terms_url="https://s2maps.eu",
    cacheable=True,
)

COPERNICUS_DEM_GLO30 = StaticProvider(
    key="copernicus_dem_glo30",
    category="elevation",
    attribution="Copernicus DEM © ESA (produced from ©Airbus DS and others)",
    license="Free for general public under the Copernicus DEM licence",
    terms_url="https://registry.opendata.aws/copernicus-dem/",
    cacheable=True,
)

BUILTIN_PROVIDERS = (ESRI_WORLD_IMAGERY, OSM_STANDARD, SENTINEL2_CLOUDLESS, COPERNICUS_DEM_GLO30)


def builtin_registry() -> ProviderRegistry:
    return ProviderRegistry(BUILTIN_PROVIDERS)
