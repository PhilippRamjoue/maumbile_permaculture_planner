"""HTTP layer for /auth. Tokens travel only in httpOnly cookies."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status

from app.core.capacity import Capacity
from app.core.config import Settings, get_settings
from app.modules.auth.dependencies import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    AuthServiceDep,
    CurrentUser,
    get_login_limiter,
    unauthorized,
)
from app.modules.auth.rate_limit import RateLimiter
from app.modules.auth.recovery import recovery_enabled, send_password_reset
from app.modules.auth.schemas import (
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    UserRead,
)
from app.modules.auth.service import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    InvalidTokenError,
    TokenPair,
    normalize_email,
)

router = APIRouter()
_hash_capacity = Capacity(4)

# The refresh cookie is only ever sent to the auth endpoints.
_REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_auth_cookies(response: Response, tokens: TokenPair, settings: Settings) -> None:
    common: dict[str, Any] = {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": "lax",
    }
    response.set_cookie(
        ACCESS_COOKIE,
        tokens.access_token,
        max_age=settings.access_token_ttl_minutes * 60,
        path="/",
        **common,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        tokens.refresh_token,
        max_age=settings.refresh_token_ttl_days * 86400,
        path=_REFRESH_COOKIE_PATH,
        **common,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=_REFRESH_COOKIE_PATH)


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    request: Request,
    service: AuthServiceDep,
    limiter: Annotated[RateLimiter, Depends(get_login_limiter)],
) -> UserRead:
    retry_after = limiter.hit(f"register:{request.client.host if request.client else 'unknown'}")
    if retry_after is not None:
        raise HTTPException(
            429,
            "Too many registration attempts. Try again later.",
            headers={"Retry-After": str(int(retry_after))},
        )
    try:
        async with _hash_capacity.acquire():
            user = await service.register(data)
    except EmailAlreadyRegisteredError:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already registered") from None
    return UserRead.model_validate(user)


@router.post("/login", response_model=UserRead)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    service: AuthServiceDep,
    settings: Annotated[Settings, Depends(get_settings)],
    limiter: Annotated[RateLimiter, Depends(get_login_limiter)],
) -> UserRead:
    client_ip = request.client.host if request.client else "unknown"
    for key in (f"ip:{client_ip}", f"email:{normalize_email(data.email)}"):
        retry_after = limiter.hit(key)
        if retry_after is not None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Try again later.",
                headers={"Retry-After": str(int(retry_after))},
            )
    try:
        async with _hash_capacity.acquire():
            user = await service.authenticate(data.email, data.password)
    except InvalidCredentialsError:
        raise unauthorized("Invalid email or password") from None
    _set_auth_cookies(response, await service.issue_tokens(user), settings)
    return UserRead.model_validate(user)


@router.post("/refresh", response_model=UserRead)
async def refresh(
    request: Request,
    response: Response,
    service: AuthServiceDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> UserRead:
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise unauthorized()
    try:
        user, tokens = await service.refresh(token)
    except InvalidTokenError:
        raise unauthorized("Invalid refresh token") from None
    _set_auth_cookies(response, tokens, settings)
    return UserRead.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, service: AuthServiceDep) -> Response:
    await service.logout(request.cookies.get(REFRESH_COOKIE))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_auth_cookies(response)
    return response


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser) -> UserRead:
    return user


@router.get("/recovery/status")
async def recovery_status(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, bool]:
    return {"enabled": recovery_enabled(settings)}


@router.post("/password-reset", status_code=202)
async def request_password_reset(
    data: PasswordResetRequest,
    request: Request,
    background: BackgroundTasks,
    service: AuthServiceDep,
    settings: Annotated[Settings, Depends(get_settings)],
    limiter: Annotated[RateLimiter, Depends(get_login_limiter)],
) -> dict[str, str]:
    if not recovery_enabled(settings):
        raise HTTPException(
            503,
            "Password recovery is not configured on this instance. "
            "Contact the operator privately for help.",
        )
    for key in (
        f"reset-ip:{request.client.host if request.client else 'unknown'}",
        f"reset-email:{normalize_email(data.email)}",
    ):
        retry = limiter.hit(key)
        if retry is not None:
            raise HTTPException(
                429,
                "Too many reset requests. Try again later.",
                headers={"Retry-After": str(int(retry))},
            )
    result = await service.request_password_reset(data.email)
    if result is not None:
        background.add_task(send_password_reset, *result, settings)
    return {
        "message": (
            "If an active account uses that email, a password reset link will be sent. "
            "Check your inbox and spam folder."
        )
    }


@router.post("/password-reset/confirm", status_code=204)
async def confirm_password_reset(
    data: PasswordResetConfirm,
    request: Request,
    service: AuthServiceDep,
    limiter: Annotated[RateLimiter, Depends(get_login_limiter)],
) -> Response:
    retry = limiter.hit(f"reset-confirm:{request.client.host if request.client else 'unknown'}")
    if retry is not None:
        raise HTTPException(429, "Too many attempts. Try again later.")
    try:
        async with _hash_capacity.acquire():
            await service.reset_password(data.token, data.password)
    except InvalidTokenError:
        raise HTTPException(
            400, "This reset link is invalid or expired. Request a new one."
        ) from None
    response = Response(status_code=204)
    _clear_auth_cookies(response)
    return response
