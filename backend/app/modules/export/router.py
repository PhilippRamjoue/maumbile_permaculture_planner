"""HTTP layer for plan export and read-only share links.

Mounted at the API root: ``/plans/{id}/export``, ``/plans/{id}/share`` (owner only) and the
public, token-gated ``/shared/{token}/export`` (docs/ARCHITECTURE.md §6).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.auth.dependencies import CurrentUser
from app.modules.export.access import PlanReader
from app.modules.export.repository import ExportRepository
from app.modules.export.schemas import ShareCreated, ShareStatus
from app.modules.export.service import (
    ExportedFile,
    ExportError,
    ExportFormat,
    ExportService,
    PlanForbiddenError,
    PlanNotFoundError,
    ShareNotFoundError,
)
from app.modules.planning.dependencies import get_planning_service
from app.modules.planning.service import PlanningService
from app.modules.sites.dependencies import get_site_service
from app.modules.sites.service import SiteService

router = APIRouter()


def get_export_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    planning: Annotated[PlanningService, Depends(get_planning_service)],
    sites: Annotated[SiteService, Depends(get_site_service)],
) -> ExportService:
    return ExportService(ExportRepository(session), PlanReader(planning, sites))


def get_owner_id(user: CurrentUser) -> uuid.UUID:
    """The authenticated caller's id (401 when not signed in)."""
    return user.id


Service = Annotated[ExportService, Depends(get_export_service)]
OwnerId = Annotated[uuid.UUID, Depends(get_owner_id)]
Format = Annotated[ExportFormat, Query(description="geojson, png (A4 plan) or pdf (A4 plan)")]
Download = Annotated[bool, Query(description="false serves png/pdf inline (e.g. for <img>)")]


def _http_error(exc: ExportError) -> HTTPException:
    if isinstance(exc, PlanNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, detail="Plan not found")
    if isinstance(exc, PlanForbiddenError):
        return HTTPException(status.HTTP_403_FORBIDDEN, detail="You do not own this site")
    if isinstance(exc, ShareNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, detail="Share link not found")
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))


def _response(file: ExportedFile, download: bool) -> Response:
    disposition = "attachment" if download else "inline"
    return Response(
        content=file.content,
        media_type=file.media_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{file.filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/plans/{plan_id}/export", tags=["export"], response_class=Response)
async def export_plan(
    plan_id: uuid.UUID,
    service: Service,
    owner_id: OwnerId,
    format: Format = "geojson",  # noqa: A002 - the public query parameter is named "format"
    download: Download = True,
) -> Response:
    """Download a plan as GeoJSON (round-trippable) or a rendered, scaled PNG/PDF with legend."""
    try:
        return _response(await service.export(plan_id, owner_id, format), download)
    except ExportError as exc:
        raise _http_error(exc) from exc


@router.post(
    "/plans/{plan_id}/share",
    response_model=ShareCreated,
    status_code=status.HTTP_201_CREATED,
    tags=["export"],
)
async def create_share(plan_id: uuid.UUID, service: Service, owner_id: OwnerId) -> ShareCreated:
    """Create a read-only link, replacing (revoking) the plan's previous one."""
    try:
        link = await service.create_share(plan_id, owner_id)
    except ExportError as exc:
        raise _http_error(exc) from exc
    return ShareCreated(token=link.token, created_at=link.created_at)


@router.get("/plans/{plan_id}/share", response_model=ShareStatus, tags=["export"])
async def share_status(plan_id: uuid.UUID, service: Service, owner_id: OwnerId) -> ShareStatus:
    try:
        created_at = await service.share_created_at(plan_id, owner_id)
    except ExportError as exc:
        raise _http_error(exc) from exc
    return ShareStatus(shared=created_at is not None, created_at=created_at)


@router.delete("/plans/{plan_id}/share", status_code=status.HTTP_204_NO_CONTENT, tags=["export"])
async def revoke_share(plan_id: uuid.UUID, service: Service, owner_id: OwnerId) -> Response:
    try:
        await service.revoke_share(plan_id, owner_id)
    except ExportError as exc:
        raise _http_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/shared/{token}/export", tags=["export"], response_class=Response)
async def export_shared(
    token: str,
    service: Service,
    format: Format = "png",  # noqa: A002
    download: Download = True,
) -> Response:
    """Public, read-only export through a share token (no sign-in)."""
    try:
        return _response(await service.export_shared(token, format), download)
    except ExportError as exc:
        raise _http_error(exc) from exc
