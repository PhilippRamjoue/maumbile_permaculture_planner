"""Integration tests for the /auth API (need Docker via the shared PostGIS fixture)."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.core.db import Base
from app.main import app
from app.modules.auth import dependencies
from app.modules.auth.rate_limit import RateLimiter

pytestmark = pytest.mark.integration

BACKEND_ROOT = Path(__file__).resolve().parents[4]

BASE = "/api/v1/auth"
REFRESH_PATH = "/api/v1/auth"
CREDS = {"email": "Amina@Example.org", "password": "s3cret-pass-phrase"}


async def _register(client: AsyncClient, **overrides: object) -> None:
    resp = await client.post(f"{BASE}/register", json={**CREDS, **overrides})
    assert resp.status_code == 201, resp.text


async def _login(client: AsyncClient) -> None:
    resp = await client.post(f"{BASE}/login", json=CREDS)
    assert resp.status_code == 200, resp.text


async def test_full_auth_flow(auth_client: AsyncClient) -> None:
    client = auth_client

    # register
    resp = await client.post(
        f"{BASE}/register", json={**CREDS, "display_name": "Amina", "country_code": "ke"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "amina@example.org"
    assert body["country_code"] == "KE"
    assert "password" not in body and "password_hash" not in body
    assert "access_token" not in client.cookies  # register does not sign in

    # protected route is closed before login
    assert (await client.get(f"{BASE}/me")).status_code == 401

    # login -> httpOnly cookies
    resp = await client.post(f"{BASE}/login", json=CREDS)
    assert resp.status_code == 200
    set_cookies = resp.headers.get_list("set-cookie")
    assert len(set_cookies) == 2
    assert all("httponly" in c.lower() and "samesite=lax" in c.lower() for c in set_cookies)
    assert any(c.startswith("refresh_token=") and f"Path={REFRESH_PATH}" in c for c in set_cookies)
    assert "access_token" not in resp.text  # tokens are never in the body

    # access protected route
    resp = await client.get(f"{BASE}/me")
    assert resp.status_code == 200
    assert resp.json()["id"] == body["id"]

    # refresh rotates the pair
    old_refresh = client.cookies.get("refresh_token", path=REFRESH_PATH)
    resp = await client.post(f"{BASE}/refresh")
    assert resp.status_code == 200
    new_refresh = client.cookies.get("refresh_token", path=REFRESH_PATH)
    assert new_refresh and new_refresh != old_refresh
    assert (await client.get(f"{BASE}/me")).status_code == 200

    # logout clears cookies and revokes the refresh token
    resp = await client.post(f"{BASE}/logout")
    assert resp.status_code == 204
    assert (await client.get(f"{BASE}/me")).status_code == 401
    client.cookies.set("refresh_token", new_refresh, path=REFRESH_PATH)
    assert (await client.post(f"{BASE}/refresh")).status_code == 401


async def test_unauthorized_access_returns_problem_json(auth_client: AsyncClient) -> None:
    resp = await auth_client.get(f"{BASE}/me")
    assert resp.status_code == 401
    assert resp.headers["content-type"].startswith("application/problem+json")
    assert resp.json()["status"] == 401


async def test_garbage_and_wrong_type_tokens_are_rejected(auth_client: AsyncClient) -> None:
    client = auth_client
    client.cookies.set("access_token", "not-a-jwt", path="/")
    assert (await client.get(f"{BASE}/me")).status_code == 401

    # a valid refresh token must not work as an access token
    await _register(client)
    await _login(client)
    refresh = client.cookies.get("refresh_token", path=REFRESH_PATH)
    assert refresh
    client.cookies.clear()
    client.cookies.set("access_token", refresh, path="/")
    assert (await client.get(f"{BASE}/me")).status_code == 401


async def test_register_duplicate_and_validation(auth_client: AsyncClient) -> None:
    await _register(auth_client)
    dup = await auth_client.post(f"{BASE}/register", json={**CREDS, "email": "AMINA@example.org"})
    assert dup.status_code == 409

    short = await auth_client.post(
        f"{BASE}/register", json={"email": "b@example.org", "password": "short"}
    )
    assert short.status_code == 422
    bad_email = await auth_client.post(
        f"{BASE}/register", json={"email": "nope", "password": "long-enough-pass"}
    )
    assert bad_email.status_code == 422


async def test_login_rejects_bad_credentials(auth_client: AsyncClient) -> None:
    await _register(auth_client)
    wrong = await auth_client.post(f"{BASE}/login", json={**CREDS, "password": "wrong-password"})
    unknown = await auth_client.post(
        f"{BASE}/login", json={"email": "ghost@example.org", "password": "whatever-pass"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["title"] == unknown.json()["title"]  # no account enumeration
    assert "access_token" not in auth_client.cookies


async def test_refresh_token_reuse_revokes_the_session(auth_client: AsyncClient) -> None:
    client = auth_client
    await _register(client)
    await _login(client)
    stolen = client.cookies.get("refresh_token", path=REFRESH_PATH)
    assert stolen
    assert (await client.post(f"{BASE}/refresh")).status_code == 200  # legit rotation

    # replaying the already-rotated token fails and kills the newer token too
    client.cookies.set("refresh_token", stolen, path=REFRESH_PATH)
    assert (await client.post(f"{BASE}/refresh")).status_code == 401
    assert (await client.post(f"{BASE}/refresh")).status_code == 401


async def test_refresh_without_cookie_is_401(auth_client: AsyncClient) -> None:
    assert (await auth_client.post(f"{BASE}/refresh")).status_code == 401


async def test_logout_is_idempotent(auth_client: AsyncClient) -> None:
    assert (await auth_client.post(f"{BASE}/logout")).status_code == 204


async def test_login_is_rate_limited(auth_client: AsyncClient) -> None:
    limiter = RateLimiter(max_attempts=3, window_seconds=60)
    app.dependency_overrides[dependencies.get_login_limiter] = lambda: limiter
    await _register(auth_client)
    bad = {**CREDS, "password": "wrong-password"}
    for _ in range(3):
        assert (await auth_client.post(f"{BASE}/login", json=bad)).status_code == 401
    resp = await auth_client.post(f"{BASE}/login", json=CREDS)  # even the right password
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) >= 1
    assert resp.headers["content-type"].startswith("application/problem+json")


async def test_migration_creates_auth_tables(
    postgis_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`alembic upgrade head` builds the schema the models expect."""
    monkeypatch.chdir(BACKEND_ROOT)
    monkeypatch.setenv("APP_DATABASE_URL", postgis_url)
    get_settings.cache_clear()
    engine = create_async_engine(postgis_url)
    try:
        async with engine.begin() as conn:  # start from a clean slate (other tests create_all)
            await conn.run_sync(Base.metadata.drop_all)
            await conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        await asyncio.to_thread(command.upgrade, Config("alembic.ini"), "head")
        async with engine.connect() as conn:
            rows = await conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_name IN ('users', 'refresh_tokens')"
                )
            )
            assert {r[0] for r in rows} == {"users", "refresh_tokens"}
    finally:
        get_settings.cache_clear()
        await engine.dispose()
