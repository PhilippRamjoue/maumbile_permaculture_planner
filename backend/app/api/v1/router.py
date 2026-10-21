"""Aggregate router for API v1.

Module routers are included here as they land (auth, sites, imagery, terrain,
planning, export). Keep this file as the single wiring point.
"""

from __future__ import annotations

from fastapi import APIRouter

api_router = APIRouter()


@api_router.get("/ping", tags=["meta"])
async def ping() -> dict[str, str]:
    """Lightweight check that the versioned API is mounted."""
    return {"ping": "pong"}


# Example of how modules will be wired in later packages:
# from app.modules.sites.router import router as sites_router
# api_router.include_router(sites_router, prefix="/sites", tags=["sites"])
