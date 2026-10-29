"""Seeded region profiles (data, not logic). Add a country by adding an entry here."""

from __future__ import annotations

from app.modules.regions.profiles import (
    GLOBAL_PROFILE_CODE,
    MapDefaults,
    RegionProfile,
    RegionProfileStore,
)

_EAST_AFRICA_IMAGERY = ["esri_world_imagery", "osm_standard", "sentinel2_cloudless"]
_EAST_AFRICA_ELEVATION = ["copernicus_dem_glo30"]

SEED_PROFILES: tuple[RegionProfile, ...] = (
    RegionProfile(
        country_code="KE",
        name="Kenya",
        providers={"imagery": _EAST_AFRICA_IMAGERY, "elevation": _EAST_AFRICA_ELEVATION},
        map=MapDefaults(center_lon=37.9, center_lat=0.0, zoom=6),
    ),
    RegionProfile(
        country_code="TZ",
        name="Tanzania",
        providers={"imagery": _EAST_AFRICA_IMAGERY, "elevation": _EAST_AFRICA_ELEVATION},
        map=MapDefaults(center_lon=34.9, center_lat=-6.4, zoom=6),
    ),
    RegionProfile(
        country_code=GLOBAL_PROFILE_CODE,
        name="Global fallback",
        providers={
            "imagery": ["sentinel2_cloudless"],
            "elevation": ["copernicus_dem_glo30"],
        },
        map=MapDefaults(center_lon=20.0, center_lat=0.0, zoom=2),
    ),
)


def seed_profile_store() -> RegionProfileStore:
    return RegionProfileStore(SEED_PROFILES)
