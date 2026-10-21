"""Fixtures for the sites tests: a migrated PostGIS database and an API client bound to it."""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.db import get_session
from app.main import app
from app.modules.sites.router import get_owner_id

# Reuse the session-scoped PostGIS container defined in tests/conftest.py.
from tests.conftest import postgis_url  # noqa: F401

BACKEND_DIR = Path(__file__).resolve().parents[4]


@pytest.fixture(scope="session")
def migrated_url(postgis_url: str) -> str:  # noqa: F811
    """PostGIS URL with every Alembic migration applied (also exercises the migrations)."""
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env={**os.environ, "APP_DATABASE_URL": postgis_url},
        check=True,
    )
    return postgis_url


@pytest_asyncio.fixture
async def engine(migrated_url: str) -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(migrated_url, future=True)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def api(engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    """Client whose DB sessions hit the test container; callers are anonymous by default."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_owner_id] = lambda: None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def act_as() -> Iterator[Callable[[uuid.UUID | None], None]]:
    """Switch the identity the API sees (stands in for auth until WP2 is integrated)."""

    def _set(owner_id: uuid.UUID | None) -> None:
        app.dependency_overrides[get_owner_id] = lambda: owner_id

    yield _set
