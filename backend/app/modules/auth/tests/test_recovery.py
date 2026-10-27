"""Recovery tokens are one-time and resetting a password invalidates existing sessions."""

import pytest
from httpx import AsyncClient

from app.core.config import Settings, get_settings
from app.main import app
from app.modules.auth import router as auth_router

pytestmark = pytest.mark.integration


async def test_reset_is_private_one_time_and_invalidates_access(
    auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    delivered: list[tuple[str, str]] = []
    settings = Settings(
        smtp_host="mail.test",
        smtp_from="sender@example.org",
        public_origin="https://app.example.org",
    )
    app.dependency_overrides[get_settings] = lambda: settings
    monkeypatch.setattr(
        auth_router,
        "send_password_reset",
        lambda email, token, settings: delivered.append((email, token)),
    )
    creds = {"email": "recovery@example.org", "password": "original-password-123"}
    assert (await auth_client.post("/api/v1/auth/register", json=creds)).status_code == 201
    assert (await auth_client.post("/api/v1/auth/login", json=creds)).status_code == 200
    old_access = auth_client.cookies["access_token"]
    old_refresh = auth_client.cookies["refresh_token"]
    known = await auth_client.post("/api/v1/auth/password-reset", json={"email": creds["email"]})
    unknown = await auth_client.post(
        "/api/v1/auth/password-reset", json={"email": "absent@example.org"}
    )
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert len(delivered) == 1
    token = delivered[0][1]
    assert token not in known.text
    confirm = {"token": token, "password": "replacement-password-123"}
    assert (
        await auth_client.post("/api/v1/auth/password-reset/confirm", json=confirm)
    ).status_code == 204
    assert (
        await auth_client.post("/api/v1/auth/password-reset/confirm", json=confirm)
    ).status_code == 400
    auth_client.cookies.set("access_token", old_access, path="/")
    assert (await auth_client.get("/api/v1/auth/me")).status_code == 401
    auth_client.cookies.clear()
    assert (await auth_client.post("/api/v1/auth/login", json=creds)).status_code == 401
    assert (
        await auth_client.post(
            "/api/v1/auth/login", json={**creds, "password": confirm["password"]}
        )
    ).status_code == 200
    new_refresh = auth_client.cookies["refresh_token"]
    auth_client.cookies.clear()
    auth_client.cookies.set("refresh_token", old_refresh, path="/api/v1/auth")
    assert (await auth_client.post("/api/v1/auth/refresh")).status_code == 401
    auth_client.cookies.clear()
    auth_client.cookies.set("refresh_token", new_refresh, path="/api/v1/auth")
    assert (await auth_client.post("/api/v1/auth/refresh")).status_code == 200


async def test_recovery_disabled_does_not_promise_email(auth_client: AsyncClient) -> None:
    assert (await auth_client.get("/api/v1/auth/recovery/status")).json() == {"enabled": False}
    response = await auth_client.post(
        "/api/v1/auth/password-reset", json={"email": "someone@example.org"}
    )
    assert response.status_code == 503
