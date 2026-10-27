"""Data access for users and refresh tokens. The only auth layer that touches the session."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import PasswordReset, RefreshToken, User


class EmailTakenError(Exception):
    """Raised when inserting a user whose email already exists."""


class AuthRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_user_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_user(self, user_id: uuid.UUID) -> User | None:
        return await self._session.get(User, user_id)

    async def create_user(
        self,
        *,
        email: str,
        password_hash: str,
        display_name: str | None,
        country_code: str | None,
    ) -> User:
        user = User(
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            country_code=country_code,
        )
        self._session.add(user)
        try:
            await self._session.commit()
        except IntegrityError as exc:
            await self._session.rollback()
            raise EmailTakenError(email) from exc
        return user

    async def update_password_hash(self, user: User, password_hash: str) -> None:
        user.password_hash = password_hash
        await self._session.commit()

    async def add_refresh_token(
        self, *, jti: uuid.UUID, user_id: uuid.UUID, expires_at: datetime
    ) -> None:
        self._session.add(RefreshToken(id=jti, user_id=user_id, expires_at=expires_at))
        await self._session.commit()

    async def get_refresh_token(self, jti: uuid.UUID) -> RefreshToken | None:
        return await self._session.get(RefreshToken, jti)

    async def revoke_refresh_token(self, jti: uuid.UUID, *, now: datetime) -> bool:
        """Revoke one token. Returns False if it was unknown or already revoked."""
        result = await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.id == jti, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await self._session.commit()
        return bool(result.rowcount)  # type: ignore[attr-defined]

    async def revoke_all_refresh_tokens(self, user_id: uuid.UUID, *, now: datetime) -> None:
        await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await self._session.commit()

    async def add_password_reset(
        self, user_id: uuid.UUID, token_hash: str, expires_at: datetime
    ) -> None:
        # Serialize issuance with consumption so a successful reset invalidates every issued token.
        await self._session.execute(select(User.id).where(User.id == user_id).with_for_update())
        await self._session.execute(delete(PasswordReset).where(PasswordReset.user_id == user_id))
        self._session.add(
            PasswordReset(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        )
        await self._session.commit()

    async def reset_password(self, token_hash: str, password_hash: str, now: datetime) -> bool:
        reset = await self._session.get(PasswordReset, token_hash)
        if reset is None:
            return False
        user_id = reset.user_id
        await self._session.execute(select(User.id).where(User.id == user_id).with_for_update())
        valid = (
            await self._session.execute(
                delete(PasswordReset)
                .where(PasswordReset.token_hash == token_hash, PasswordReset.expires_at > now)
                .returning(PasswordReset.user_id)
            )
        ).scalar_one_or_none()
        if valid is None:
            return False
        changed = await self._session.execute(
            update(User)
            .where(User.id == user_id, User.is_active.is_(True))
            .values(password_hash=password_hash, token_version=User.token_version + 1)
            .returning(User.id)
        )
        if changed.scalar_one_or_none() is None:
            return False
        await self._session.execute(delete(PasswordReset).where(PasswordReset.user_id == user_id))
        await self._session.execute(
            update(RefreshToken).where(RefreshToken.user_id == user_id).values(revoked_at=now)
        )
        await self._session.commit()
        return True
