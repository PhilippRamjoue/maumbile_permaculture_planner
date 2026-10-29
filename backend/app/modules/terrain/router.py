"""Terrain endpoints: kick off derivation for a site and read back the stored result."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, cast

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from geoalchemy2.shape import to_shape
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal, get_session
from app.core.geo import shape_to_geojson
from app.modules.regions.deps import get_resolver
from app.modules.regions.resolver import RegionResolver
from app.modules.sites.dependencies import OwnedSite
from app.modules.terrain.limits import TerrainExtentError, validate_dem_extent
from app.modules.terrain.models import READY, TerrainResult
from app.modules.terrain.repository import SessionFactory, TerrainRepository, repository_session
from app.modules.terrain.schemas import (
    ContourCollection,
    ContourFeature,
    SlopeGrid,
    SlopeSummary,
    TerrainRead,
    TerrainRequestBody,
    TerrainStatus,
)
from app.modules.terrain.service import (
    STALE_AFTER,
    NoElevationProviderError,
    TerrainService,
    TerrainView,
    pad_bbox,
    terrain_input_key,
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
        TerrainRepository(session),
        lambda: repository_session(factory),
        resolver,
        default_interval_m=get_settings().terrain_contour_interval_m,
    )


TerrainDep = Annotated[TerrainService, Depends(get_terrain_service)]


def _read(site_id: uuid.UUID, result: TerrainResult | None) -> TerrainRead:
    if result is None:
        return TerrainRead(site_id=site_id, status="not_requested")
    return TerrainRead(
        site_id=site_id,
        status=cast(
            TerrainStatus,
            (
                "interrupted"
                if result.status in ("pending", "running")
                and datetime.now(UTC) - result.updated_at > STALE_AFTER
                else result.status
            ),
        ),
        contour_interval_m=result.contour_interval_m,
        dem_source=result.dem_source,
        attribution=result.attribution,
        resolution_m=result.resolution_m,
        error=result.error,
        requested_at=result.updated_at
        if result.status in ("pending", "running")
        else result.created_at,
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
    site: OwnedSite,
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
    bbox = site.bbox
    try:
        provider = terrain.resolve_provider(site.country_code, bbox)
    except NoElevationProviderError as exc:
        raise HTTPException(404, "No elevation data available for this site") from exc

    interval = body.contour_interval_m if body else None
    try:
        validate_dem_extent(pad_bbox(bbox, provider.resolution_m))
    except TerrainExtentError as exc:
        raise HTTPException(422, str(exc)) from exc
    req = await terrain.request(
        site_id,
        input_key=terrain_input_key(bbox, site.country_code),
        provider_key=provider.key,
        interval_m=interval,
    )
    if req.start:
        assert req.result.job_id is not None
        background.add_task(
            terrain.run_job,
            req.result.id,
            bbox,
            provider,
            req.result.contour_interval_m,
            req.result.job_id,
        )
    elif req.result.status == READY:
        response.status_code = status.HTTP_200_OK
    return _read(site_id, req.result)


@router.get("/{site_id}/terrain", response_model=TerrainRead)
async def get_terrain(site_id: uuid.UUID, site: OwnedSite, terrain: TerrainDep) -> TerrainRead:
    """Status, plus contour GeoJSON, slope legend/summary and slope grid once ``ready``."""
    return _read_view(
        site_id,
        await terrain.view(site_id, input_key=terrain_input_key(site.bbox, site.country_code)),
    )
