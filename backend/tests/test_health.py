from __future__ import annotations

from httpx import AsyncClient


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
