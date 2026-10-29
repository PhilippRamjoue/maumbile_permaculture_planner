"""Fixtures for the planning tests: a migrated PostGIS database and an API client bound to it."""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from pathlib import Path
from typing import Any, cast

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
from app.modules.auth.dependencies import current_user
from app.modules.auth.schemas import UserRead

# Reuse the session-scoped PostGIS container defined in tests/conftest.py.
from tests.conftest import postgis_url as postgis_url

BACKEND_DIR = Path(__file__).resolve().parents[4]

# A ~1.2 km plot near Nairobi (UTM 37S).
SITE_CORNERS = [[36.800, -1.300], [36.810, -1.300], [36.810, -1.290], [36.800, -1.290]]


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


def _user(user_id: uuid.UUID) -> UserRead:
    return UserRead(id=user_id, email=f"{user_id.hex[:8]}@example.com")


@pytest.fixture
def owner_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest_asyncio.fixture
async def api(engine: AsyncEngine, owner_id: uuid.UUID) -> AsyncIterator[AsyncClient]:
    """Client whose DB sessions hit the test container, signed in as ``owner_id``."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[current_user] = lambda: _user(owner_id)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def act_as() -> Iterator[Callable[[uuid.UUID], None]]:
    """Switch the signed-in identity mid-test."""

    def _set(user_id: uuid.UUID) -> None:
        app.dependency_overrides[current_user] = lambda: _user(user_id)

    yield _set


@pytest_asyncio.fixture
async def site(api: AsyncClient) -> dict[str, Any]:
    resp = await api.post(
        "/api/v1/sites",
        json={"name": "Test shamba", "country_code": "KE", "coordinates": SITE_CORNERS},
    )
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


@pytest_asyncio.fixture
async def plan(api: AsyncClient, site: dict[str, Any]) -> dict[str, Any]:
    resp = await api.post(f"/api/v1/sites/{site['id']}/plans", json={"name": "Master plan"})
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())
