"""Fixtures for the auth module tests.

Integration tests get a real PostGIS-backed app: the ``get_session`` dependency is overridden
to point at the Testcontainers database, with fresh tables per test.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_session
from app.main import app
from app.modules.auth import dependencies
from app.modules.auth import models as _models  # noqa: F401  (register tables on Base.metadata)
from tests.conftest import postgis_url  # noqa: F401  (reuse the shared container fixture)


@pytest_asyncio.fixture
async def auth_client(postgis_url: str) -> AsyncIterator[AsyncClient]:  # noqa: F811
    engine = create_async_engine(postgis_url, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = _override_session
    dependencies._login_limiter = None  # fresh rate-limit state per test
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
