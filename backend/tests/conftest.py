"""Shared test fixtures.

- ``client``: an httpx AsyncClient wired to the ASGI app (no network, no DB).
- ``postgis_url``: a live PostGIS container connection URL (needs Docker). Used by
  tests marked ``@pytest.mark.integration``.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture(scope="session")
def postgis_url() -> Iterator[str]:
    """Spin up a PostGIS container for the test session (requires Docker)."""
    from testcontainers.community.postgres import PostgresContainer

    with PostgresContainer("postgis/postgis:16-3.4", driver="asyncpg") as postgres:
        yield postgres.get_connection_url()
