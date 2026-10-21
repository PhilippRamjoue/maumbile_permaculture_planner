"""Data access for the tile cache."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.imagery.models import ImageryTile


class TileCacheRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(
        self, provider_key: str, z: int, x: int, y: int, *, now: datetime
    ) -> ImageryTile | None:
        """The cached tile if present and not expired."""
        stmt = select(ImageryTile).where(
            ImageryTile.provider_key == provider_key,
            ImageryTile.z == z,
            ImageryTile.x == x,
            ImageryTile.y == y,
            ImageryTile.expires_at > now,
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def put(
        self,
        provider_key: str,
        z: int,
        x: int,
        y: int,
        *,
        content: bytes,
        media_type: str,
        fetched_at: datetime,
        expires_at: datetime,
    ) -> None:
        """Insert or refresh a tile (safe under concurrent requests for the same tile)."""
        stmt = insert(ImageryTile).values(
            provider_key=provider_key,
            z=z,
            x=x,
            y=y,
            content=content,
            media_type=media_type,
            fetched_at=fetched_at,
            expires_at=expires_at,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["provider_key", "z", "x", "y"],
            set_={
                col: stmt.excluded[col]
                for col in ("content", "media_type", "fetched_at", "expires_at")
            },
        )
        await self._session.execute(stmt)
        await self._session.commit()
