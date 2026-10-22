from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import OperationalError


async def test_healthz(client: AsyncClient) -> None:
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_api_v1_ping(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/ping")
    assert resp.status_code == 200
    assert resp.json() == {"ping": "pong"}


async def test_request_id_header(client: AsyncClient) -> None:
    resp = await client.get("/healthz")
    assert resp.headers.get("X-Request-ID")


async def test_readyz_checks_database(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    check = AsyncMock()
    monkeypatch.setattr("app.main.check_database", check)
    response = await client.get("/readyz")
    assert response.status_code == 200 and response.json() == {"status": "ready"}
    check.assert_awaited_once()


@pytest.mark.parametrize("error", [TimeoutError(), OperationalError("probe", {}, Exception())])
async def test_readyz_reports_unavailable(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    monkeypatch.setattr("app.main.check_database", AsyncMock(side_effect=error))
    response = await client.get("/readyz")
    assert response.status_code == 503
    assert response.json()["title"] == "Database unavailable"
    assert (await client.get("/healthz")).status_code == 200
