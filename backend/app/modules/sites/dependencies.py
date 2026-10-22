"""Public HTTP dependencies for site access; consumers do not import the sites router."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.geo import BBox
from app.modules.auth.dependencies import CurrentUser
from app.modules.sites.repository import SiteRepository
from app.modules.sites.service import SiteForbiddenError, SiteNotFoundError, SiteService


def get_site_service(session: Annotated[AsyncSession, Depends(get_session)]) -> SiteService:
    return SiteService(SiteRepository(session))


def get_owner_id(user: CurrentUser) -> uuid.UUID:
    return user.id


Service = Annotated[SiteService, Depends(get_site_service)]
OwnerId = Annotated[uuid.UUID, Depends(get_owner_id)]


@dataclass(frozen=True)
class SiteContext:
    id: uuid.UUID
    country_code: str | None
    bbox: BBox


async def get_owned_site(site_id: uuid.UUID, sites: Service, owner_id: OwnerId) -> SiteContext:
    try:
        site = await sites.get(site_id, owner_id)
    except SiteNotFoundError as exc:
        raise HTTPException(404, "Site not found") from exc
    except SiteForbiddenError as exc:
        raise HTTPException(403, "You do not own this site") from exc
    return SiteContext(site.id, site.country_code, BBox(*site.bbox))


OwnedSite = Annotated[SiteContext, Depends(get_owned_site)]
