"""Auth business logic: registration, credential checks, token issue/rotation/revocation.

No FastAPI imports. Failures are signalled with the domain exceptions below; the router maps
them to HTTP responses.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import Settings
from app.modules.auth import security
from app.modules.auth.models import User
from app.modules.auth.repository import AuthRepository, EmailTakenError
from app.modules.auth.schemas import RegisterRequest


class AuthError(Exception):
    """Base class for auth domain errors."""


class EmailAlreadyRegisteredError(AuthError):
    pass


class InvalidCredentialsError(AuthError):
    pass


class InvalidTokenError(AuthError):
    """Missing, malformed, expired, revoked or otherwise unusable token."""


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime


def normalize_email(email: str) -> str:
    return email.strip().lower()


class AuthService:
    def __init__(self, repo: AuthRepository, settings: Settings) -> None:
        self._repo = repo
        self._secret = settings.secret_key.get_secret_value()
        self._access_ttl = timedelta(minutes=settings.access_token_ttl_minutes)
        self._refresh_ttl = timedelta(days=settings.refresh_token_ttl_days)

    # -- accounts ---------------------------------------------------------------------------

    async def register(self, data: RegisterRequest) -> User:
        try:
            return await self._repo.create_user(
                email=normalize_email(data.email),
                password_hash=security.hash_password(data.password),
                display_name=data.display_name,
                country_code=data.country_code.upper() if data.country_code else None,
            )
        except EmailTakenError as exc:
            raise EmailAlreadyRegisteredError from exc

    async def authenticate(self, email: str, password: str) -> User:
        user = await self._repo.get_user_by_email(normalize_email(email))
        valid = security.verify_password(user.password_hash if user else None, password)
        if user is None or not valid or not user.is_active:
            raise InvalidCredentialsError
        if security.needs_rehash(user.password_hash):
            await self._repo.update_password_hash(user, security.hash_password(password))
        return user

    # -- tokens -----------------------------------------------------------------------------

    async def issue_tokens(self, user: User) -> TokenPair:
        now = datetime.now(UTC)
        access_exp = now + self._access_ttl
        refresh_exp = now + self._refresh_ttl
        refresh_jti = uuid.uuid4()
        await self._repo.add_refresh_token(jti=refresh_jti, user_id=user.id, expires_at=refresh_exp)
        return TokenPair(
            access_token=security.encode_token(
                secret=self._secret,
                user_id=user.id,
                token_type="access",
                jti=uuid.uuid4(),
                issued_at=now,
                expires_at=access_exp,
            ),
            refresh_token=security.encode_token(
                secret=self._secret,
                user_id=user.id,
                token_type="refresh",
                jti=refresh_jti,
                issued_at=now,
                expires_at=refresh_exp,
            ),
            access_expires_at=access_exp,
            refresh_expires_at=refresh_exp,
        )

    async def user_from_access_token(self, token: str) -> User:
        claims = self._decode(token, "access")
        user = await self._repo.get_user(claims.user_id)
        if user is None or not user.is_active:
            raise InvalidTokenError
        return user

    async def refresh(self, refresh_token: str) -> tuple[User, TokenPair]:
        """Rotate: the presented refresh token is revoked and a fresh pair is issued.

        Presenting an already-revoked token means it was replayed (stolen or reused), so every
        session of that user is revoked.
        """
        claims = self._decode(refresh_token, "refresh")
        now = datetime.now(UTC)
        record = await self._repo.get_refresh_token(claims.jti)
        if record is None or record.user_id != claims.user_id:
            raise InvalidTokenError
        if record.revoked_at is not None:
            await self._repo.revoke_all_refresh_tokens(claims.user_id, now=now)
            raise InvalidTokenError
        user = await self._repo.get_user(claims.user_id)
        if user is None or not user.is_active:
            raise InvalidTokenError
        if not await self._repo.revoke_refresh_token(claims.jti, now=now):
            raise InvalidTokenError  # lost a rotation race
        return user, await self.issue_tokens(user)

    async def logout(self, refresh_token: str | None) -> None:
        """Revoke the presented refresh token. Idempotent; bad tokens are ignored."""
        if not refresh_token:
            return
        try:
            claims = self._decode(refresh_token, "refresh")
        except InvalidTokenError:
            return
        await self._repo.revoke_refresh_token(claims.jti, now=datetime.now(UTC))

    def _decode(self, token: str, expected: security.TokenType) -> security.TokenClaims:
        try:
            return security.decode_token(token, secret=self._secret, expected_type=expected)
        except (jwt.PyJWTError, ValueError, KeyError) as exc:
            raise InvalidTokenError from exc
