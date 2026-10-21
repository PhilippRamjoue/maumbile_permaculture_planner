"""FastAPI dependencies. Other modules import ``CurrentUser`` / ``current_user`` from here.

Example::

    from app.modules.auth.dependencies import CurrentUser

    @router.get("/things")
    async def list_things(user: CurrentUser): ...
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.modules.auth.rate_limit import RateLimiter
from app.modules.auth.repository import AuthRepository
from app.modules.auth.schemas import UserRead
from app.modules.auth.service import AuthService, InvalidTokenError

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"

_login_limiter: RateLimiter | None = None


def get_login_limiter(settings: Annotated[Settings, Depends(get_settings)]) -> RateLimiter:
    global _login_limiter
    if _login_limiter is None:
        _login_limiter = RateLimiter(
            max_attempts=settings.login_rate_limit_attempts,
            window_seconds=settings.login_rate_limit_window_seconds,
        )
    return _login_limiter


def get_auth_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthService:
    return AuthService(AuthRepository(session), settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail)


async def current_user(request: Request, service: AuthServiceDep) -> UserRead:
    """Resolve the signed-in user from the access-token cookie, or raise 401."""
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise unauthorized()
    try:
        user = await service.user_from_access_token(token)
    except InvalidTokenError:
        raise unauthorized() from None
    return UserRead.model_validate(user)


CurrentUser = Annotated[UserRead, Depends(current_user)]
