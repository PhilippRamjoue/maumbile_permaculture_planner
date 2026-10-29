"""The portable site bundle: a whole site and all its plans, independent of any one database.

Keyed by element-type ``key`` and layer index (never database ids), so a bundle exported from one
Maumbile account imports into another as a fresh, independently editable copy. The list and length
caps also bound an untrusted import; generous enough that a real site never reaches them.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

from app.modules.export.document import PlanDocument

BUNDLE_VERSION = 1

MAX_PLANS = 50
MAX_LAYERS_PER_PLAN = 24
MAX_FEATURES_PER_PLAN = 5000


class BundleLayer(BaseModel):
    name: str = Field(max_length=200)
    role: str | None = Field(default=None, max_length=20)
    sort_order: int = Field(ge=0, le=10_000)
    visible: bool = True


class BundleFeature(BaseModel):
    feature_type: str = Field(max_length=20)
    element_type_key: str | None = Field(default=None, max_length=100)
    layer_index: int = Field(ge=0)
    geometry: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)


class BundlePlan(BaseModel):
    name: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    goals: dict[str, Any] | None = None
    layers: list[BundleLayer] = Field(min_length=1, max_length=MAX_LAYERS_PER_PLAN)
    features: list[BundleFeature] = Field(default_factory=list, max_length=MAX_FEATURES_PER_PLAN)


class BundleSite(BaseModel):
    name: str = Field(max_length=200)
    country_code: str | None = Field(default=None, max_length=2)
    boundary: dict[str, Any]  # GeoJSON Polygon (WGS84)


class SiteBundle(BaseModel):
    bundle_version: int
    exported_at: str | None = None
    site: BundleSite
    plans: list[BundlePlan] = Field(default_factory=list, max_length=MAX_PLANS)


def build_bundle(
    *,
    site_name: str,
    country_code: str | None,
    boundary: dict[str, Any],
    docs: list[PlanDocument],
) -> SiteBundle:
    """Assemble a portable bundle from a site and its plans' export documents."""
    plans: list[BundlePlan] = []
    for doc in docs:
        index_of = {layer.id: i for i, layer in enumerate(doc.layers)}
        plans.append(
            BundlePlan(
                name=doc.name,
                description=doc.description,
                goals=doc.goals,
                layers=[
                    BundleLayer(
                        name=la.name, role=la.role, sort_order=la.sort_order, visible=la.visible
                    )
                    for la in doc.layers
                ],
                features=[
                    BundleFeature(
                        feature_type=f.feature_type,
                        element_type_key=(
                            doc.element_types[f.element_type_id].key
                            if f.element_type_id in doc.element_types
                            else None
                        ),
                        layer_index=index_of[f.layer_id],
                        geometry=f.geometry,
                        properties=f.properties,
                    )
                    for f in doc.features
                ],
            )
        )
    return SiteBundle(
        bundle_version=BUNDLE_VERSION,
        exported_at=datetime.now(UTC).isoformat(),
        site=BundleSite(name=site_name, country_code=country_code, boundary=boundary),
        plans=plans,
    )
