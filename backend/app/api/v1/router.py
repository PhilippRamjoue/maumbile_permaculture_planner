"""Aggregate router for API v1.

Module routers are included here as they land (auth, sites, imagery, terrain,
planning, export). Keep this file as the single wiring point.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.imagery.router import router as imagery_router
from app.modules.planning.router import router as planning_router
from app.modules.regions.router import router as regions_router
from app.modules.sites.router import router as sites_router

api_router = APIRouter()


@api_router.get("/ping", tags=["meta"])
async def ping() -> dict[str, str]:
    """Lightweight check that the versioned API is mounted."""
    return {"ping": "pong"}


api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(regions_router, prefix="/regions", tags=["regions"])
api_router.include_router(sites_router, prefix="/sites", tags=["sites"])
api_router.include_router(imagery_router, prefix="/sites", tags=["imagery"])
api_router.include_router(planning_router)
