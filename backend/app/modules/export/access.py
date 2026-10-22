"""Adapter from the planning and sites services to the export ``PlanSource`` port."""

from __future__ import annotations

import uuid

from geoalchemy2.shape import to_shape

from app.core.geo import shape_to_geojson
from app.modules.export.document import (
    ExportElementType,
    ExportFeature,
    ExportLayer,
    PlanDocument,
)
from app.modules.export.service import PlanForbiddenError, PlanNotFoundError
from app.modules.planning.service import ForbiddenError, NotFoundError, PlanningService
from app.modules.sites.service import SiteForbiddenError, SiteNotFoundError, SiteService


class PlanReader:
    """Reads a plan, its features and its site as ``owner_id`` (ownership is enforced there)."""

    def __init__(self, planning: PlanningService, sites: SiteService) -> None:
        self._planning = planning
        self._sites = sites

    async def ensure_owner(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        try:
            await self._planning.get_plan(plan_id, owner_id)
        except NotFoundError:
            raise PlanNotFoundError from None
        except ForbiddenError:
            raise PlanForbiddenError from None

    async def load(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> PlanDocument:
        try:
            plan, layers = await self._planning.get_plan(plan_id, owner_id)
            measured = await self._planning.list_features(plan_id, owner_id)
            types = await self._planning.list_element_types()
            site = await self._sites.get(plan.site_id, owner_id)
        except (NotFoundError, SiteNotFoundError):
            raise PlanNotFoundError from None
        except (ForbiddenError, SiteForbiddenError):
            raise PlanForbiddenError from None
        return PlanDocument(
            plan_id=plan.id,
            name=plan.name,
            description=plan.description,
            updated_at=plan.updated_at,
            site_name=site.name,
            boundary=shape_to_geojson(to_shape(site.boundary)),
            layers=[ExportLayer(la.id, la.name, la.sort_order, la.visible) for la in layers],
            features=[
                ExportFeature(
                    id=m.feature.id,
                    layer_id=m.feature.layer_id,
                    feature_type=m.feature.feature_type,
                    element_type_id=m.feature.element_type_id,
                    geometry=shape_to_geojson(to_shape(m.feature.geometry)),
                    properties=m.feature.properties,
                    length_m=m.length_m,
                    area_m2=m.area_m2,
                )
                for m in measured
            ],
            element_types={
                t.id: ExportElementType(
                    t.id, t.key, t.name, t.feature_type, t.geometry_type, t.default_style
                )
                for t in types
            },
        )
