"""Adapter from the sites service to the planning ``SiteAccess`` port."""

from __future__ import annotations

import uuid

from app.modules.planning.service import ForbiddenError, NotFoundError
from app.modules.sites.service import SiteForbiddenError, SiteNotFoundError, SiteService


class SiteOwnership:
    """Ownership checks backed by ``SiteService`` (the only coupling to the sites module)."""

    def __init__(self, sites: SiteService) -> None:
        self._sites = sites

    async def ensure_owner(self, site_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        try:
            await self._sites.get(site_id, owner_id)
        except SiteNotFoundError:
            raise NotFoundError("Site") from None
        except SiteForbiddenError:
            raise ForbiddenError("You do not own this site") from None
