"""Fixtures for the terrain API tests: migrated PostGIS and a stubbed elevation provider."""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
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
from app.modules.regions.catalog import builtin_registry
from app.modules.regions.deps import get_resolver
from app.modules.regions.resolver import RegionResolver
from app.modules.regions.seed import seed_profile_store
from app.modules.sites.router import get_owner_id
from app.modules.terrain.router import get_session_factory
from app.modules.terrain.tests.stubs import StubElevationProvider

# Reuse the session-scoped PostGIS container defined in tests/conftest.py.
from tests.conftest import postgis_url  # noqa: F401

BACKEND_DIR = Path(__file__).resolve().parents[4]


@dataclass
class Identity:
    """Who the API thinks is calling; tests switch ``owner`` to act as someone else."""

    owner: uuid.UUID = field(default_factory=uuid.uuid4)


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


@pytest.fixture
def dem() -> StubElevationProvider:
    return StubElevationProvider()


@pytest.fixture
def identity() -> Identity:
    return Identity()


@pytest_asyncio.fixture
async def api(
    engine: AsyncEngine, dem: StubElevationProvider, identity: Identity
) -> AsyncIterator[AsyncClient]:
    """API client on the test DB; elevation comes from the stub (nothing touches AWS)."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    registry = builtin_registry()
    registry.register(dem, replace=True)
    resolver = RegionResolver(registry, seed_profile_store())

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_session_factory] = lambda: factory
    app.dependency_overrides[get_owner_id] = lambda: identity.owner
    app.dependency_overrides[get_resolver] = lambda: resolver
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
