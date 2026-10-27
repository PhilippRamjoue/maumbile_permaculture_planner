"""Pure helpers: argon2 password hashing and JWT encoding/decoding (no I/O)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

TokenType = Literal["access", "refresh"]
JWT_ALGORITHM = "HS256"

_hasher = PasswordHasher()
# Verified against when the account does not exist, so login timing doesn't reveal that.
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing-equalisation")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """Constant-ish time check; ``None`` hash (unknown user) still burns a verification."""
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


@dataclass(frozen=True)
class TokenClaims:
    user_id: uuid.UUID
    token_type: TokenType
    jti: uuid.UUID
    expires_at: datetime
    token_version: int = 0


def encode_token(
    *,
    secret: str,
    user_id: uuid.UUID,
    token_type: TokenType,
    jti: uuid.UUID,
    issued_at: datetime,
    expires_at: datetime,
    token_version: int = 0,
) -> str:
    payload = {
        "sub": str(user_id),
        "typ": token_type,
        "jti": str(jti),
        "iat": issued_at,
        "exp": expires_at,
        "ver": token_version,
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str, *, secret: str, expected_type: TokenType) -> TokenClaims:
    """Verify signature/expiry/type. Raises ``jwt.PyJWTError`` (or ValueError) when invalid."""
    payload = jwt.decode(
        token,
        secret,
        algorithms=[JWT_ALGORITHM],
        options={"require": ["sub", "typ", "jti", "exp"]},
    )
    if payload["typ"] != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return TokenClaims(
        user_id=uuid.UUID(payload["sub"]),
        token_type=expected_type,
        jti=uuid.UUID(payload["jti"]),
        expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        token_version=int(payload.get("ver", 0)),
    )
