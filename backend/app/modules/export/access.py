"""Adapter from the planning and sites services to the export ``PlanSource`` port."""

from __future__ import annotations

import uuid
from typing import Any

from geoalchemy2.shape import to_shape

from app.core.geo import shape_to_geojson
from app.modules.export.bundle import MAX_PLANS, SiteBundle
from app.modules.export.document import (
    ExportElementType,
    ExportFeature,
    ExportLayer,
    PlanDocument,
)
from app.modules.export.service import (
    ImportedSite,
    InvalidBundleError,
    PlanForbiddenError,
    PlanNotFoundError,
    SiteContent,
)
from app.modules.planning.service import (
    ForbiddenError,
    InvalidFeatureError,
    NotFoundError,
    PlanningService,
)
from app.modules.sites.service import (
    InvalidBoundaryError,
    SiteForbiddenError,
    SiteNotFoundError,
    SiteService,
)


def _boundary_ring(boundary: dict[str, Any]) -> list[tuple[float, float]]:
    """The exterior ring of a GeoJSON Polygon as ``[(lng, lat), …]`` for site creation."""
    if boundary.get("type") != "Polygon":
        raise InvalidBundleError("Site boundary must be a GeoJSON Polygon.")
    try:
        ring = (boundary.get("coordinates") or [])[0]
        return [(float(x), float(y)) for x, y in ring]
    except (TypeError, ValueError, IndexError) as exc:
        raise InvalidBundleError("Site boundary has malformed coordinates.") from exc


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
            plan, layers, measured = await self._planning.get_design(plan_id, owner_id)
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
            goals=plan.goals,
            updated_at=plan.updated_at,
            site_name=site.name,
            boundary=shape_to_geojson(to_shape(site.boundary)),
            layers=[
                ExportLayer(la.id, la.name, la.sort_order, la.visible, la.role) for la in layers
            ],
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
                    t.id, t.key, t.name, t.feature_type, t.geometry_type, t.default_style, t.icon
                )
                for t in types
            },
        )

    async def load_site(self, site_id: uuid.UUID, owner_id: uuid.UUID) -> SiteContent:
        """A site and every one of its plans, for a portable export bundle."""
        try:
            site = await self._sites.get(site_id, owner_id)
            plans, _ = await self._planning.list_plans(site_id, owner_id, limit=MAX_PLANS, offset=0)
        except (NotFoundError, SiteNotFoundError):
            raise PlanNotFoundError from None
        except (ForbiddenError, SiteForbiddenError):
            raise PlanForbiddenError from None
        docs = [await self.load(plan.id, owner_id) for plan in plans]
        return SiteContent(
            name=site.name,
            country_code=site.country_code,
            boundary=shape_to_geojson(to_shape(site.boundary)),
            docs=docs,
        )

    async def import_site(self, owner_id: uuid.UUID, bundle: SiteBundle) -> ImportedSite:
        """Create a new site owned by ``owner_id`` from a bundle, with fresh ids throughout."""
        coordinates = _boundary_ring(bundle.site.boundary)
        try:
            site = await self._sites.create(
                owner_id=owner_id,
                name=bundle.site.name,
                coordinates=coordinates,
                country_code=bundle.site.country_code,
            )
        except InvalidBoundaryError as exc:
            raise InvalidBundleError(f"Site boundary: {exc}") from exc
        for plan in bundle.plans:
            try:
                await self._planning.import_plan(
                    site.id,
                    owner_id,
                    name=plan.name,
                    description=plan.description,
                    goals=plan.goals,
                    layers=[layer.model_dump() for layer in plan.layers],
                    features=[feature.model_dump() for feature in plan.features],
                )
            except InvalidFeatureError as exc:
                raise InvalidBundleError(str(exc)) from exc
        return ImportedSite(id=site.id, name=site.name)
