"""Data access for stored terrain. State changes are compare-and-swap so races stay safe."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from geoalchemy2.shape import from_shape
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.geo import WGS84_SRID
from app.modules.terrain.derive import DerivedTerrain
from app.modules.terrain.models import (
    FAILED,
    PENDING,
    READY,
    RUNNING,
    TerrainContour,
    TerrainResult,
)


class TerrainRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_for_site(self, site_id: uuid.UUID) -> TerrainResult | None:
        stmt = select(TerrainResult).where(TerrainResult.site_id == site_id)
        # populate_existing: a long-lived session must see state written by other sessions.
        result = await self._session.execute(stmt.execution_options(populate_existing=True))
        return result.scalar_one_or_none()

    async def contours(self, terrain_id: uuid.UUID) -> list[TerrainContour]:
        stmt = (
            select(TerrainContour)
            .where(TerrainContour.terrain_id == terrain_id)
            .order_by(TerrainContour.elevation_m)
        )
        return list((await self._session.execute(stmt)).scalars())

    async def insert_pending(self, site_id: uuid.UUID, *, interval_m: float, now: datetime) -> bool:
        """Create the row for a site; ``False`` if it already exists (someone else got there)."""
        stmt = (
            insert(TerrainResult)
            .values(
                id=uuid.uuid4(),
                site_id=site_id,
                status=PENDING,
                contour_interval_m=interval_m,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_nothing(index_elements=["site_id"])
            .returning(TerrainResult.id)
        )
        inserted = (await self._session.execute(stmt)).scalar_one_or_none() is not None
        await self._session.commit()
        return inserted

    async def reset_to_pending(
        self, current: TerrainResult, *, interval_m: float, now: datetime
    ) -> bool:
        """Re-queue a ready/failed/stale row. ``False`` if another request changed it first."""
        stmt = (
            update(TerrainResult)
            .where(
                TerrainResult.id == current.id,
                TerrainResult.status == current.status,
                TerrainResult.updated_at == current.updated_at,
            )
            .values(
                status=PENDING,
                contour_interval_m=interval_m,
                error=None,
                slope_summary=None,
                slope_grid=None,
                computed_at=None,
                updated_at=now,
            )
            .returning(TerrainResult.id)
        )
        won = (await self._session.execute(stmt)).scalar_one_or_none() is not None
        if won:
            await self._session.execute(
                delete(TerrainContour).where(TerrainContour.terrain_id == current.id)
            )
        await self._session.commit()
        return won

    async def mark_running(self, terrain_id: uuid.UUID, *, now: datetime) -> None:
        await self._set(terrain_id, status=RUNNING, updated_at=now)

    async def mark_failed(self, terrain_id: uuid.UUID, error: str, *, now: datetime) -> None:
        await self._set(terrain_id, status=FAILED, error=error[:500], updated_at=now)

    async def save_ready(
        self,
        terrain_id: uuid.UUID,
        derived: DerivedTerrain,
        *,
        dem_source: str,
        attribution: str,
        resolution_m: float,
        now: datetime,
    ) -> None:
        """Store contours and the slope result and flip to ``ready`` in one transaction."""
        for level in derived.contours:
            self._session.add(
                TerrainContour(
                    terrain_id=terrain_id,
                    elevation_m=level.elevation_m,
                    geom=from_shape(level.geometry, srid=WGS84_SRID),
                )
            )
        await self._session.execute(
            update(TerrainResult)
            .where(TerrainResult.id == terrain_id)
            .values(
                status=READY,
                dem_source=dem_source,
                attribution=attribution,
                resolution_m=resolution_m,
                slope_summary=derived.summary,
                slope_grid=derived.slope_grid,
                error=None,
                computed_at=now,
                updated_at=now,
            )
        )
        await self._session.commit()

    async def _set(self, terrain_id: uuid.UUID, **values: Any) -> None:
        await self._session.execute(
            update(TerrainResult).where(TerrainResult.id == terrain_id).values(**values)
        )
        await self._session.commit()
