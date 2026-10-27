"""Unit tests for the pure parts of the auth module (no DB, no Docker)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.modules.auth import security
from app.modules.auth.rate_limit import RateLimiter

SECRET = "unit-test-secret-0123456789-0123456789"


def test_password_hash_roundtrip() -> None:
    hashed = security.hash_password("correct horse battery")
    assert hashed != "correct horse battery"
    assert hashed.startswith("$argon2")
    assert security.verify_password(hashed, "correct horse battery")
    assert not security.verify_password(hashed, "wrong")


def test_verify_password_unknown_user_is_false() -> None:
    assert not security.verify_password(None, "anything")


def _token(token_type: security.TokenType, ttl: timedelta, secret: str = SECRET) -> str:
    now = datetime.now(UTC)
    return security.encode_token(
        secret=secret,
        user_id=uuid.uuid4(),
        token_type=token_type,
        jti=uuid.uuid4(),
        issued_at=now,
        expires_at=now + ttl,
    )


def test_token_roundtrip() -> None:
    token = _token("access", timedelta(minutes=5))
    claims = security.decode_token(token, secret=SECRET, expected_type="access")
    assert claims.token_type == "access"


def test_token_rejects_wrong_type_expiry_and_signature() -> None:
    with pytest.raises(jwt.InvalidTokenError):
        security.decode_token(
            _token("refresh", timedelta(minutes=5)), secret=SECRET, expected_type="access"
        )
    with pytest.raises(jwt.ExpiredSignatureError):
        security.decode_token(
            _token("access", timedelta(minutes=-5)), secret=SECRET, expected_type="access"
        )
    with pytest.raises(jwt.InvalidSignatureError):
        security.decode_token(
            _token("access", timedelta(minutes=5), secret="x" * 40),
            secret=SECRET,
            expected_type="access",
        )


def test_rate_limiter_sliding_window() -> None:
    now = [0.0]
    limiter = RateLimiter(max_attempts=2, window_seconds=10, clock=lambda: now[0])
    assert limiter.hit("k") is None
    assert limiter.hit("k") is None
    retry = limiter.hit("k")
    assert retry is not None and 0 < retry <= 10
    assert limiter.hit("other") is None  # keys are independent
    now[0] = 11.0
    assert limiter.hit("k") is None  # window slid


def test_rate_limiter_prunes_inactive_keys_and_bounds_cardinality() -> None:
    now = [0.0]
    limiter = RateLimiter(max_attempts=2, window_seconds=10, clock=lambda: now[0])
    limiter._max_keys = 2
    assert limiter.hit("first") is None
    assert limiter.hit("second") is None
    assert limiter.hit("new-key") is not None
    now[0] = 11.0
    assert limiter.hit("new-key") is None
    assert set(limiter._hits) == {"new-key"}
