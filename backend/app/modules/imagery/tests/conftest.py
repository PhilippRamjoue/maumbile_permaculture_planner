"""Fixtures for the imagery endpoint tests: migrated PostGIS plus stubbed upstream providers."""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import AsyncIterator
from dataclasses import dataclass
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
from app.modules.imagery.providers import EsriWorldImageryProvider, Sentinel2CloudlessProvider
from app.modules.imagery.tests.stubs import StubUpstream
from app.modules.regions.catalog import builtin_registry
from app.modules.regions.deps import get_resolver
from app.modules.regions.resolver import RegionResolver
from app.modules.regions.seed import seed_profile_store
from app.modules.sites.router import get_owner_id

# Reuse the session-scoped PostGIS container defined in tests/conftest.py.
from tests.conftest import postgis_url  # noqa: F401

BACKEND_DIR = Path(__file__).resolve().parents[4]


@dataclass
class Upstreams:
    esri: StubUpstream
    eox: StubUpstream


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
def upstreams() -> Upstreams:
    return Upstreams(esri=StubUpstream(), eox=StubUpstream())


@pytest_asyncio.fixture
async def api(engine: AsyncEngine, upstreams: Upstreams) -> AsyncIterator[AsyncClient]:
    """Anonymous API client on the test DB; both real adapters talk to stubbed upstreams."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    registry = builtin_registry()
    registry.register(EsriWorldImageryProvider(client=upstreams.esri.client()), replace=True)
    registry.register(Sentinel2CloudlessProvider(client=upstreams.eox.client()), replace=True)
    resolver = RegionResolver(registry, seed_profile_store())

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_owner_id] = lambda: None
    app.dependency_overrides[get_resolver] = lambda: resolver
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
