"""HTTP layer for plans, layers, features, the element-type catalog and measurement.

Mounted at the API root: paths are spread across ``/sites/{id}/plans``, ``/plans``,
``/layers``, ``/features`` and ``/element-types`` (see docs/ARCHITECTURE.md §6).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from geoalchemy2.shape import to_shape

from app.core.geo import shape_to_geojson
from app.core.pagination import Page, PageParams
from app.modules.auth.dependencies import CurrentUser
from app.modules.planning.dependencies import get_planning_service
from app.modules.planning.models import ElementType, Layer, Plan
from app.modules.planning.repository import MeasuredFeature
from app.modules.planning.schemas import (
    ElementTypeRead,
    FeatureBatch,
    FeatureCollection,
    FeatureCreate,
    FeatureRead,
    FeatureType,
    FeatureUpdate,
    LayerCreate,
    LayerRead,
    LayerUpdate,
    Measurement,
    MeasureRequest,
    PlanCreate,
    PlanDetail,
    PlanRead,
    PlanUpdate,
)
from app.modules.planning.service import (
    ConflictError,
    FeatureInput,
    ForbiddenError,
    InvalidFeatureError,
    NotFoundError,
    PlanningError,
    PlanningService,
)

router = APIRouter()


def get_owner_id(user: CurrentUser) -> uuid.UUID:
    """The authenticated caller's id (401 when not signed in)."""
    return user.id


Service = Annotated[PlanningService, Depends(get_planning_service)]
OwnerId = Annotated[uuid.UUID, Depends(get_owner_id)]


def _http_error(exc: PlanningError) -> HTTPException:
    if isinstance(exc, NotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, ForbiddenError):
        return HTTPException(status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, ConflictError):
        return HTTPException(status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, InvalidFeatureError):
        return HTTPException(422, detail=str(exc))
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))


def _feature_read(m: MeasuredFeature) -> FeatureRead:
    f = m.feature
    return FeatureRead(
        id=f.id,
        plan_id=f.plan_id,
        layer_id=f.layer_id,
        feature_type=f.feature_type,  # type: ignore[arg-type]
        element_type_id=f.element_type_id,
        geometry=shape_to_geojson(to_shape(f.geometry)),
        properties=f.properties,
        length_m=m.length_m,
        area_m2=m.area_m2,
        created_at=f.created_at,
        updated_at=f.updated_at,
    )


def _input(body: FeatureCreate) -> FeatureInput:
    return FeatureInput(
        id=body.id,
        layer_id=body.layer_id,
        feature_type=body.feature_type,
        element_type_id=body.element_type_id,
        geometry=body.geometry,
        properties=body.properties,
    )


# ── catalog & measurement ──────────────────────────────────────────────────────────────────
@router.get("/element-types", response_model=list[ElementTypeRead], tags=["planning"])
async def list_element_types(service: Service, _: OwnerId) -> list[ElementType]:
    return await service.list_element_types()


@router.post("/features:measure", response_model=Measurement, tags=["planning"])
async def measure(body: MeasureRequest, service: Service, _: OwnerId) -> Measurement:
    """Authoritative length/area from PostGIS (geography); nothing is saved."""
    try:
        length_m, area_m2 = await service.measure(body.geometry)
    except PlanningError as exc:
        raise _http_error(exc) from exc
    return Measurement(length_m=length_m, area_m2=area_m2)


# ── plans ──────────────────────────────────────────────────────────────────────────────────
@router.get("/sites/{site_id}/plans", response_model=Page[PlanRead], tags=["plans"])
async def list_plans(
    site_id: uuid.UUID, service: Service, owner_id: OwnerId, params: Annotated[PageParams, Query()]
) -> Page[PlanRead]:
    try:
        plans, total = await service.list_plans(site_id, owner_id, params.limit, params.offset)
    except PlanningError as exc:
        raise _http_error(exc) from exc
    return Page(
        items=[PlanRead.model_validate(p) for p in plans],
        total=total,
        limit=params.limit,
        offset=params.offset,
    )


@router.post(
    "/sites/{site_id}/plans",
    response_model=PlanDetail,
    status_code=status.HTTP_201_CREATED,
    tags=["plans"],
)
async def create_plan(
    site_id: uuid.UUID, body: PlanCreate, service: Service, owner_id: OwnerId
) -> PlanDetail:
    """Create a plan; it starts with a default set of layers (Zones, Sectors, Elements, ...)."""
    try:
        plan = await service.create_plan(
            site_id, owner_id, name=body.name, description=body.description
        )
        _, layers = await service.get_plan(plan.id, owner_id)
    except PlanningError as exc:
        raise _http_error(exc) from exc
    return _plan_detail(plan, layers)


def _plan_detail(plan: Plan, layers: list[Layer]) -> PlanDetail:
    return PlanDetail(
        **PlanRead.model_validate(plan).model_dump(),
        layers=[LayerRead.model_validate(layer) for layer in layers],
    )


@router.get("/plans/{plan_id}", response_model=PlanDetail, tags=["plans"])
async def get_plan(plan_id: uuid.UUID, service: Service, owner_id: OwnerId) -> PlanDetail:
    try:
        plan, layers = await service.get_plan(plan_id, owner_id)
    except PlanningError as exc:
        raise _http_error(exc) from exc
    return _plan_detail(plan, layers)


@router.patch("/plans/{plan_id}", response_model=PlanRead, tags=["plans"])
async def update_plan(
    plan_id: uuid.UUID, body: PlanUpdate, service: Service, owner_id: OwnerId
) -> Plan:
    if "name" in body.model_fields_set and body.name is None:
        raise HTTPException(422, detail="name cannot be null")
    try:
        return await service.update_plan(plan_id, owner_id, **body.model_dump(exclude_unset=True))
    except PlanningError as exc:
        raise _http_error(exc) from exc


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["plans"])
async def delete_plan(plan_id: uuid.UUID, service: Service, owner_id: OwnerId) -> Response:
    try:
        await service.delete_plan(plan_id, owner_id)
    except PlanningError as exc:
        raise _http_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── layers ─────────────────────────────────────────────────────────────────────────────────
@router.get("/plans/{plan_id}/layers", response_model=list[LayerRead], tags=["layers"])
async def list_layers(plan_id: uuid.UUID, service: Service, owner_id: OwnerId) -> list[Layer]:
    try:
        return await service.list_layers(plan_id, owner_id)
    except PlanningError as exc:
        raise _http_error(exc) from exc


@router.post(
    "/plans/{plan_id}/layers",
    response_model=LayerRead,
    status_code=status.HTTP_201_CREATED,
    tags=["layers"],
)
async def create_layer(
    plan_id: uuid.UUID, body: LayerCreate, service: Service, owner_id: OwnerId
) -> Layer:
    try:
        return await service.create_layer(
            plan_id,
            owner_id,
            name=body.name,
            sort_order=body.sort_order,
            visible=body.visible,
        )
    except PlanningError as exc:
        raise _http_error(exc) from exc


@router.patch("/layers/{layer_id}", response_model=LayerRead, tags=["layers"])
async def update_layer(
    layer_id: uuid.UUID, body: LayerUpdate, service: Service, owner_id: OwnerId
) -> Layer:
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    try:
        return await service.update_layer(layer_id, owner_id, **changes)
    except PlanningError as exc:
        raise _http_error(exc) from exc


@router.delete("/layers/{layer_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["layers"])
async def delete_layer(layer_id: uuid.UUID, service: Service, owner_id: OwnerId) -> Response:
    """Delete a layer and every feature on it."""
    try:
        await service.delete_layer(layer_id, owner_id)
    except PlanningError as exc:
        raise _http_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── features ───────────────────────────────────────────────────────────────────────────────
@router.get("/plans/{plan_id}/features", response_model=FeatureCollection, tags=["features"])
async def list_features(
    plan_id: uuid.UUID,
    service: Service,
    owner_id: OwnerId,
    layer_id: uuid.UUID | None = None,
    feature_type: FeatureType | None = None,
) -> FeatureCollection:
    """All features of a plan as a GeoJSON FeatureCollection (optionally filtered)."""
    try:
        found = await service.list_features(
            plan_id, owner_id, layer_id=layer_id, feature_type=feature_type
        )
    except PlanningError as exc:
        raise _http_error(exc) from exc
    return FeatureCollection(features=[_feature_read(m) for m in found])


@router.post(
    "/plans/{plan_id}/features",
    response_model=FeatureRead,
    status_code=status.HTTP_201_CREATED,
    tags=["features"],
)
async def create_feature(
    plan_id: uuid.UUID, body: FeatureCreate, service: Service, owner_id: OwnerId
) -> FeatureRead:
    try:
        return _feature_read(await service.create_feature(plan_id, owner_id, _input(body)))
    except PlanningError as exc:
        raise _http_error(exc) from exc


@router.post("/plans/{plan_id}/features:batch", response_model=FeatureCollection, tags=["features"])
async def upsert_features(
    plan_id: uuid.UUID, body: FeatureBatch, service: Service, owner_id: OwnerId
) -> FeatureCollection:
    """Idempotent bulk upsert keyed by client-supplied feature UUIDs (all-or-nothing)."""
    try:
        saved = await service.upsert_features(
            plan_id, owner_id, [_input(f) for f in body.features], body.deleted_ids
        )
    except PlanningError as exc:
        raise _http_error(exc) from exc
    return FeatureCollection(features=[_feature_read(m) for m in saved])


@router.get("/features/{feature_id}", response_model=FeatureRead, tags=["features"])
async def get_feature(feature_id: uuid.UUID, service: Service, owner_id: OwnerId) -> FeatureRead:
    try:
        return _feature_read(await service.get_feature(feature_id, owner_id))
    except PlanningError as exc:
        raise _http_error(exc) from exc


@router.patch("/features/{feature_id}", response_model=FeatureRead, tags=["features"])
async def update_feature(
    feature_id: uuid.UUID, body: FeatureUpdate, service: Service, owner_id: OwnerId
) -> FeatureRead:
    changes = body.model_dump(exclude_unset=True)
    for required in ("layer_id", "feature_type", "geometry", "properties"):
        if required in changes and changes[required] is None:
            raise HTTPException(422, detail=f"{required} cannot be null")
    try:
        return _feature_read(await service.update_feature(feature_id, owner_id, **changes))
    except PlanningError as exc:
        raise _http_error(exc) from exc


@router.delete("/features/{feature_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["features"])
async def delete_feature(feature_id: uuid.UUID, service: Service, owner_id: OwnerId) -> Response:
    try:
        await service.delete_feature(feature_id, owner_id)
    except PlanningError as exc:
        raise _http_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
