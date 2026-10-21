"""Imagery use cases: pick the provider for a site, serve tiles, enforce the cache policy."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from app.core.geo import BBox
from app.modules.imagery.providers import ImageryProvider
from app.modules.imagery.repository import TileCacheRepository
from app.modules.regions.profiles import GLOBAL_PROFILE_CODE
from app.modules.regions.resolver import NoProviderAvailableError, RegionResolver

CacheStatus = Literal["HIT", "MISS", "BYPASS"]

# Cacheable sources (CC-BY mosaics) change rarely; a month keeps the table small-ish while
# still picking up provider-side corrections.
DEFAULT_TILE_TTL = timedelta(days=30)

_PNG = b"\x89PNG\r\n\x1a\n"
_JPEG = b"\xff\xd8\xff"


class ImageryError(Exception):
    """Base class for imagery domain errors."""


class NoImageryProviderError(ImageryError):
    """No usable imagery provider covers this site."""


class TileNotFoundError(ImageryError):
    """The tile is outside the provider's zoom/grid range or the provider has no such tile."""


def sniff_media_type(data: bytes) -> str:
    """Providers return JPEG or PNG under our ``.png`` URL; report what the bytes really are."""
    if data.startswith(_PNG):
        return "image/png"
    if data.startswith(_JPEG):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


@dataclass(frozen=True)
class TileResult:
    data: bytes
    media_type: str
    provider: ImageryProvider
    cache_status: CacheStatus


class ImageryService:
    def __init__(
        self,
        resolver: RegionResolver,
        cache: TileCacheRepository,
        *,
        ttl: timedelta = DEFAULT_TILE_TTL,
    ) -> None:
        self._resolver = resolver
        self._cache = cache
        self._ttl = ttl

    def resolve_provider(self, country_code: str | None, bbox: BBox) -> ImageryProvider:
        """Imagery provider for a site's country/bbox; unknown country -> global fallback."""
        try:
            provider = self._resolver.resolve(country_code or GLOBAL_PROFILE_CODE, bbox, "imagery")
        except NoProviderAvailableError as exc:
            raise NoImageryProviderError(str(exc)) from exc
        if not isinstance(provider, ImageryProvider):
            # A metadata-only catalog entry whose adapter is not registered/deployed.
            raise NoImageryProviderError(f"provider {provider.key!r} cannot serve tiles")
        return provider

    async def tile(
        self,
        country_code: str | None,
        bbox: BBox,
        z: int,
        x: int,
        y: int,
        *,
        now: datetime | None = None,
    ) -> TileResult:
        provider = self.resolve_provider(country_code, bbox)
        if z > provider.max_zoom or x >= 2**z or y >= 2**z:
            raise TileNotFoundError(f"tile {z}/{x}/{y} is outside {provider.key!r}'s range")

        now = now or datetime.now(UTC)
        # The cache policy lives here, in one place: never store (or serve stored) tiles for
        # providers whose terms forbid it.
        if provider.cacheable:
            cached = await self._cache.get(provider.key, z, x, y, now=now)
            if cached is not None:
                return TileResult(cached.content, cached.media_type, provider, "HIT")

        data = await provider.get_tile(z, x, y)
        if data is None:
            raise TileNotFoundError(f"{provider.key!r} has no tile {z}/{x}/{y}")
        media_type = sniff_media_type(data)

        if not provider.cacheable:
            return TileResult(data, media_type, provider, "BYPASS")
        await self._cache.put(
            provider.key,
            z,
            x,
            y,
            content=data,
            media_type=media_type,
            fetched_at=now,
            expires_at=now + self._ttl,
        )
        return TileResult(data, media_type, provider, "MISS")
