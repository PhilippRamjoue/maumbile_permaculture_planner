"""HTTP layer for sites."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from geoalchemy2.shape import to_shape
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.geo import shape_to_geojson
from app.core.pagination import Page, PageParams
from app.modules.sites.models import Site
from app.modules.sites.repository import SiteRepository
from app.modules.sites.schemas import SiteCreate, SiteRead, SiteUpdate
from app.modules.sites.service import (
    InvalidBoundaryError,
    SiteError,
    SiteForbiddenError,
    SiteNotFoundError,
    SiteService,
)

router = APIRouter()


def get_site_service(session: Annotated[AsyncSession, Depends(get_session)]) -> SiteService:
    return SiteService(SiteRepository(session))


def get_owner_id() -> uuid.UUID | None:
    """The calling user's id.

    TODO(integration): replace with the WP2 ``current_user`` dependency (return its id) and
    require authentication (401). Until then every caller is anonymous (``None``) and can
    only see and modify anonymous sites.
    """
    return None


Service = Annotated[SiteService, Depends(get_site_service)]
OwnerId = Annotated[uuid.UUID | None, Depends(get_owner_id)]


def _to_read(site: Site) -> SiteRead:
    return SiteRead(
        id=site.id,
        owner_id=site.owner_id,
        name=site.name,
        country_code=site.country_code,
        boundary=shape_to_geojson(to_shape(site.boundary)),
        centroid=shape_to_geojson(to_shape(site.centroid)),
        bbox=list(site.bbox),
        area_m2=site.area_m2,
        utm_epsg=site.utm_epsg,
        created_at=site.created_at,
        updated_at=site.updated_at,
    )


def _http_error(exc: SiteError) -> HTTPException:
    if isinstance(exc, InvalidBoundaryError):
        return HTTPException(422, detail=str(exc))
    if isinstance(exc, SiteNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, detail="Site not found")
    if isinstance(exc, SiteForbiddenError):
        return HTTPException(status.HTTP_403_FORBIDDEN, detail="You do not own this site")
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("", response_model=SiteRead, status_code=status.HTTP_201_CREATED)
async def create_site(body: SiteCreate, service: Service, owner_id: OwnerId) -> SiteRead:
    try:
        site = await service.create(
            owner_id=owner_id,
            name=body.name,
            coordinates=body.coordinates,
            country_code=body.country_code,
        )
    except SiteError as exc:
        raise _http_error(exc) from exc
    return _to_read(site)


@router.get("", response_model=Page[SiteRead])
async def list_sites(
    service: Service, owner_id: OwnerId, params: Annotated[PageParams, Query()]
) -> Page[SiteRead]:
    sites, total = await service.list_for_owner(owner_id, params.limit, params.offset)
    return Page(
        items=[_to_read(s) for s in sites], total=total, limit=params.limit, offset=params.offset
    )


@router.get("/{site_id}", response_model=SiteRead)
async def get_site(site_id: uuid.UUID, service: Service, owner_id: OwnerId) -> SiteRead:
    try:
        return _to_read(await service.get(site_id, owner_id))
    except SiteError as exc:
        raise _http_error(exc) from exc


@router.patch("/{site_id}", response_model=SiteRead)
async def update_site(
    site_id: uuid.UUID, body: SiteUpdate, service: Service, owner_id: OwnerId
) -> SiteRead:
    fields = body.model_dump(exclude_unset=True)
    try:
        site = await service.update(site_id, owner_id, **fields)
    except SiteError as exc:
        raise _http_error(exc) from exc
    return _to_read(site)


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_site(site_id: uuid.UUID, service: Service, owner_id: OwnerId) -> Response:
    try:
        await service.delete(site_id, owner_id)
    except SiteError as exc:
        raise _http_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
