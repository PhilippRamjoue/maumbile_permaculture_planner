"""Terrain use cases: request (compute once, then cache) and the background derivation job."""

from __future__ import annotations

import asyncio
import math
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.geo import BBox
from app.modules.regions.profiles import GLOBAL_PROFILE_CODE
from app.modules.regions.resolver import NoProviderAvailableError, RegionResolver
from app.modules.terrain.derive import derive_terrain, meters_per_degree
from app.modules.terrain.models import (
    FAILED,
    PENDING,
    READY,
    RUNNING,
    TerrainContour,
    TerrainResult,
)
from app.modules.terrain.providers import (
    DemFetchError,
    DemUnavailableError,
    ElevationProvider,
)
from app.modules.terrain.repository import TerrainRepository

log = structlog.get_logger(__name__)

# A pending/running row that has not moved for this long belongs to a job that died with its
# process (background tasks do not survive a restart); the next POST re-queues it.
STALE_AFTER = timedelta(minutes=10)
# Extra DEM cells fetched around the site so edge cells get real neighbours for slope and
# contours; the results are clipped back to the site bbox.
PAD_CELLS = 3

SessionFactory = Callable[[], AsyncSession]


class TerrainError(Exception):
    """Base class for terrain domain errors."""


class NoElevationProviderError(TerrainError):
    """No usable elevation provider covers this site."""


@dataclass(frozen=True)
class TerrainRequest:
    result: TerrainResult
    start: bool  # True when the caller must schedule the derivation job


@dataclass(frozen=True)
class TerrainView:
    result: TerrainResult
    contours: list[TerrainContour]


def pad_bbox(bbox: BBox, resolution_m: float, cells: int = PAD_CELLS) -> BBox:
    """``bbox`` grown by ``cells`` DEM cells on every side (clamped to the globe)."""
    lon_m, lat_m = meters_per_degree((bbox.min_lat + bbox.max_lat) / 2)
    d_lon = cells * resolution_m / lon_m
    d_lat = cells * resolution_m / lat_m
    return BBox(
        max(-180.0, bbox.min_lon - d_lon),
        max(-90.0, bbox.min_lat - d_lat),
        min(180.0, bbox.max_lon + d_lon),
        min(90.0, bbox.max_lat + d_lat),
    )


class TerrainService:
    def __init__(
        self,
        session: AsyncSession,
        session_factory: SessionFactory,
        resolver: RegionResolver,
        *,
        default_interval_m: float,
    ) -> None:
        self._repo = TerrainRepository(session)
        self._session_factory = session_factory
        self._resolver = resolver
        self._default_interval_m = default_interval_m

    def resolve_provider(self, country_code: str | None, bbox: BBox) -> ElevationProvider:
        """Elevation provider for a site's country/bbox; unknown country -> global fallback."""
        try:
            provider = self._resolver.resolve(
                country_code or GLOBAL_PROFILE_CODE, bbox, "elevation"
            )
        except NoProviderAvailableError as exc:
            raise NoElevationProviderError(str(exc)) from exc
        if not isinstance(provider, ElevationProvider):
            # A metadata-only catalog entry whose adapter is not registered/deployed.
            raise NoElevationProviderError(f"provider {provider.key!r} cannot serve elevation")
        return provider

    async def request(
        self,
        site_id: uuid.UUID,
        *,
        interval_m: float | None,
        now: datetime | None = None,
    ) -> TerrainRequest:
        """Get-or-create the site's terrain row; ``start`` says whether to run the job.

        Terrain is immutable, so a ``ready`` row is served as is. It is only re-derived when the
        caller asks for a different contour interval; failed and stale rows are retried.
        """
        now = now or datetime.now(UTC)
        existing = await self._repo.get_for_site(site_id)
        interval = interval_m or (
            existing.contour_interval_m if existing else self._default_interval_m
        )

        if existing is None:
            started = await self._repo.insert_pending(site_id, interval_m=interval, now=now)
            row = await self._repo.get_for_site(site_id)
            assert row is not None
            return TerrainRequest(row, started)

        stale = existing.status in (PENDING, RUNNING) and now - existing.updated_at > STALE_AFTER
        new_interval = (
            existing.status == READY
            and interval_m is not None
            and not math.isclose(interval_m, existing.contour_interval_m)
        )
        if existing.status == FAILED or stale or new_interval:
            started = await self._repo.reset_to_pending(existing, interval_m=interval, now=now)
            row = await self._repo.get_for_site(site_id)
            assert row is not None
            return TerrainRequest(row, started)
        return TerrainRequest(existing, False)

    async def view(self, site_id: uuid.UUID) -> TerrainView | None:
        result = await self._repo.get_for_site(site_id)
        if result is None:
            return None
        contours = await self._repo.contours(result.id) if result.status == READY else []
        return TerrainView(result, contours)

    async def run_job(
        self,
        terrain_id: uuid.UUID,
        bbox: BBox,
        provider: ElevationProvider,
        interval_m: float,
    ) -> None:
        """Fetch the DEM, derive slope + contours and store them. Never raises (background task).

        Uses its own session: the request's session is closed once the response is sent.
        """
        async with self._session_factory() as session:
            repo = TerrainRepository(session)
            try:
                await repo.mark_running(terrain_id, now=datetime.now(UTC))
                dem = await provider.get_dem(pad_bbox(bbox, provider.resolution_m))
                derived = await asyncio.to_thread(derive_terrain, dem, bbox, interval_m)
                await repo.save_ready(
                    terrain_id,
                    derived,
                    dem_source=provider.key,
                    attribution=provider.attribution,
                    resolution_m=provider.resolution_m,
                    now=datetime.now(UTC),
                )
            except DemUnavailableError as exc:
                await self._fail(repo, session, terrain_id, f"No elevation data: {exc}")
            except DemFetchError as exc:
                log.warning("terrain_dem_fetch_failed", provider=provider.key, error=str(exc))
                await self._fail(
                    repo, session, terrain_id, "Elevation source unreachable; retry later"
                )
            except Exception:
                log.exception("terrain_derivation_failed", terrain_id=str(terrain_id))
                await self._fail(repo, session, terrain_id, "Terrain derivation failed")

    @staticmethod
    async def _fail(
        repo: TerrainRepository, session: AsyncSession, terrain_id: uuid.UUID, message: str
    ) -> None:
        await session.rollback()
        await repo.mark_failed(terrain_id, message, now=datetime.now(UTC))
