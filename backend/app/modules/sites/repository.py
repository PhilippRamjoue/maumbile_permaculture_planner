"""Data access for sites: the only layer that touches the DB session."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from geoalchemy2 import Geography
from shapely.geometry import Polygon
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.geo import WGS84_SRID
from app.modules.sites.models import Site


class SiteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def geodesic_area_m2(self, polygon: Polygon) -> float:
        """Area on the WGS84 ellipsoid via PostGIS ``ST_Area(geography)`` (square metres)."""
        geom = func.ST_GeomFromText(polygon.wkt, WGS84_SRID)
        result = await self._session.execute(select(func.ST_Area(cast(geom, Geography))))
        return float(result.scalar_one())

    async def add(self, **values: Any) -> Site:
        site = Site(**values)
        self._session.add(site)
        await self._session.commit()
        return site

    async def get(self, site_id: uuid.UUID, *, lock: bool = False) -> Site | None:
        """Fetch a non-deleted site."""
        stmt = select(Site).where(Site.id == site_id, Site.deleted_at.is_(None))
        if lock:
            stmt = stmt.with_for_update()
        return (
            await self._session.execute(stmt.execution_options(populate_existing=True))
        ).scalar_one_or_none()

    async def list_for_owner(
        self, owner_id: uuid.UUID | None, limit: int, offset: int
    ) -> tuple[list[Site], int]:
        owned = (
            Site.owner_id.is_(None) if owner_id is None else Site.owner_id == owner_id,
            Site.deleted_at.is_(None),
        )
        total = (
            await self._session.execute(select(func.count()).select_from(Site).where(*owned))
        ).scalar_one()
        stmt = (
            select(Site)
            .where(*owned)
            .order_by(Site.created_at.desc(), Site.id)
            .limit(limit)
            .offset(offset)
        )
        return list((await self._session.execute(stmt)).scalars()), int(total)

    async def update(self, site: Site, **values: Any) -> Site:
        for key, value in values.items():
            setattr(site, key, value)
        await self._session.commit()
        await self._session.refresh(site)
        return site

    async def soft_delete(self, site: Site) -> None:
        site.deleted_at = datetime.now(UTC)
        await self._session.commit()
