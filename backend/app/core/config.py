"""Application settings (12-factor, validated at boot)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEV_SECRET = "dev-only-insecure-secret-change-me-0123456789"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="APP_",
        extra="ignore",
    )

    app_name: str = "Permaculture Planner"
    environment: str = "development"
    debug: bool = False

    # SQLAlchemy async URL. Overridden in deployment via APP_DATABASE_URL.
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/permaculture"

    # CORS: set APP_CORS_ORIGINS as a JSON array to override, e.g. '["https://app.example"]'.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:8080",
    ]

    # --- Auth (modules/auth) ---
    # JWT signing key. MUST be overridden (APP_SECRET_KEY) outside development.
    secret_key: SecretStr = SecretStr(_INSECURE_DEV_SECRET)
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    # Set the Secure flag on auth cookies (true behind HTTPS; browsers also accept it on localhost).
    cookie_secure: bool = False
    # Login throttling: max attempts per client IP and per email within the window (per process).
    login_rate_limit_attempts: int = 10
    login_rate_limit_window_seconds: int = 60

    @model_validator(mode="after")
    def _require_real_secret_in_production(self) -> Settings:
        if (
            self.environment == "production"
            and self.secret_key.get_secret_value() == _INSECURE_DEV_SECRET
        ):
            raise ValueError("APP_SECRET_KEY must be set to a unique secret in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
