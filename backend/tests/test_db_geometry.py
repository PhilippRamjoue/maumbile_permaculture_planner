"""Integration test: a geometry round-trips through PostGIS.

Satisfies the WP1 acceptance criterion. Requires Docker (Testcontainers).
"""

from __future__ import annotations

import pytest
from geoalchemy2 import Geometry
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import Integer, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

pytestmark = pytest.mark.integration


class _Base(DeclarativeBase):
    pass


class _Marker(_Base):
    __tablename__ = "test_markers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    geom: Mapped[object] = mapped_column(Geometry(geometry_type="POINT", srid=4326))


async def test_geometry_roundtrip(postgis_url: str) -> None:
    engine = create_async_engine(postgis_url, future=True)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            await conn.run_sync(_Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with session_factory() as session:
            session.add(_Marker(geom=from_shape(Point(36.8219, -1.2921), srid=4326)))
            await session.commit()

        async with session_factory() as session:
            wkt = (
                await session.execute(text("SELECT ST_AsText(geom) FROM test_markers"))
            ).scalar_one()
        assert wkt.startswith("POINT")
    finally:
        await engine.dispose()
