"""Application settings (12-factor, validated at boot)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache
def get_settings() -> Settings:
    return Settings()
