"""Terrain endpoints: kick off derivation for a site and read back the stored result."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from geoalchemy2.shape import to_shape
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal, get_session
from app.core.geo import BBox, shape_to_geojson
from app.modules.regions.deps import get_resolver
from app.modules.regions.resolver import RegionResolver
from app.modules.sites.models import Site
from app.modules.sites.router import OwnerId
from app.modules.sites.router import Service as SiteServiceDep
from app.modules.sites.service import SiteError, SiteForbiddenError, SiteNotFoundError
from app.modules.terrain.models import READY, TerrainResult
from app.modules.terrain.schemas import (
    ContourCollection,
    ContourFeature,
    SlopeGrid,
    SlopeSummary,
    TerrainRead,
    TerrainRequestBody,
)
from app.modules.terrain.service import (
    NoElevationProviderError,
    SessionFactory,
    TerrainService,
    TerrainView,
)

router = APIRouter()

# Every 5th contour is an "index" contour (drawn heavier / labelled), as on topographic maps.
_INDEX_EVERY = 5


def get_session_factory() -> SessionFactory:
    """Sessions for the background job. Tests override this to point at their database."""
    return SessionLocal


def get_terrain_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    factory: Annotated[SessionFactory, Depends(get_session_factory)],
    resolver: Annotated[RegionResolver, Depends(get_resolver)],
) -> TerrainService:
    return TerrainService(
        session,
        factory,
        resolver,
        default_interval_m=get_settings().terrain_contour_interval_m,
    )


TerrainDep = Annotated[TerrainService, Depends(get_terrain_service)]


async def _load_site(sites: SiteServiceDep, site_id: uuid.UUID, owner_id: OwnerId) -> Site:
    try:
        return await sites.get(site_id, owner_id)
    except SiteNotFoundError as exc:
        raise HTTPException(404, "Site not found") from exc
    except SiteForbiddenError as exc:
        raise HTTPException(403, "You do not own this site") from exc
    except SiteError as exc:  # pragma: no cover - defensive
        raise HTTPException(400, str(exc)) from exc


def _bbox_of(site: Site) -> BBox:
    min_lon, min_lat, max_lon, max_lat = site.bbox
    return BBox(min_lon, min_lat, max_lon, max_lat)


def _read(site_id: uuid.UUID, result: TerrainResult | None) -> TerrainRead:
    if result is None:
        return TerrainRead(site_id=site_id, status="not_requested")
    return TerrainRead(
        site_id=site_id,
        status=result.status,  # type: ignore[arg-type]
        contour_interval_m=result.contour_interval_m,
        dem_source=result.dem_source,
        attribution=result.attribution,
        resolution_m=result.resolution_m,
        error=result.error,
        requested_at=result.created_at,
        computed_at=result.computed_at,
    )


def _read_view(site_id: uuid.UUID, view: TerrainView | None) -> TerrainRead:
    body = _read(site_id, view.result if view else None)
    if view is None or view.result.status != READY:
        return body
    interval = view.result.contour_interval_m
    body.contours = ContourCollection(
        features=[
            ContourFeature(
                geometry=shape_to_geojson(to_shape(c.geom)),
                properties={
                    "elevation_m": c.elevation_m,
                    "index": round(c.elevation_m / interval) % _INDEX_EVERY == 0,
                },
            )
            for c in view.contours
        ]
    )
    if view.result.slope_summary is not None:
        body.slope = SlopeSummary.model_validate(view.result.slope_summary)
    if view.result.slope_grid is not None:
        body.slope_grid = SlopeGrid.model_validate(view.result.slope_grid)
    return body


@router.post(
    "/{site_id}/terrain",
    response_model=TerrainRead,
    responses={200: {"description": "Already derived: the stored status is returned."}},
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_terrain(
    site_id: uuid.UUID,
    sites: SiteServiceDep,
    owner_id: OwnerId,
    terrain: TerrainDep,
    background: BackgroundTasks,
    response: Response,
    body: TerrainRequestBody | None = None,
) -> TerrainRead:
    """Derive slope and contours for the site (once; later calls serve the stored result).

    Returns 202 while the background job is queued or running (poll ``GET``), 200 with
    ``status: "ready"`` when terrain is already stored. A different ``contour_interval_m``
    re-derives; a ``failed`` run is retried.
    """
    site = await _load_site(sites, site_id, owner_id)
    bbox = _bbox_of(site)
    try:
        provider = terrain.resolve_provider(site.country_code, bbox)
    except NoElevationProviderError as exc:
        raise HTTPException(404, "No elevation data available for this site") from exc

    interval = body.contour_interval_m if body else None
    req = await terrain.request(site_id, interval_m=interval)
    if req.start:
        background.add_task(
            terrain.run_job, req.result.id, bbox, provider, req.result.contour_interval_m
        )
    elif req.result.status == READY:
        response.status_code = status.HTTP_200_OK
    return _read(site_id, req.result)


@router.get("/{site_id}/terrain", response_model=TerrainRead)
async def get_terrain(
    site_id: uuid.UUID, sites: SiteServiceDep, owner_id: OwnerId, terrain: TerrainDep
) -> TerrainRead:
    """Status, plus contour GeoJSON, slope legend/summary and slope grid once ``ready``."""
    await _load_site(sites, site_id, owner_id)
    return _read_view(site_id, await terrain.view(site_id))
