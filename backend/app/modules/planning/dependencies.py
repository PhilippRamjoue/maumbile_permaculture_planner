"""Public HTTP dependencies for planning; consumers do not import the planning router."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.planning.access import SiteOwnership
from app.modules.planning.repository import PlanningRepository
from app.modules.planning.service import PlanningService
from app.modules.sites.repository import SiteRepository
from app.modules.sites.service import SiteService


def get_planning_service(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlanningService:
    return PlanningService(
        PlanningRepository(session), SiteOwnership(SiteService(SiteRepository(session)))
    )
