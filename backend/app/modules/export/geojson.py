"""GeoJSON export: the plan's features in the shape the batch endpoint accepts.

Every feature carries ``id``, ``layer_id``, ``feature_type`` and ``element_type_id`` as foreign
members (RFC 7946 §6.1), exactly like ``POST /plans/{id}/features:batch``, so the ``features``
array can be posted back to a plan unchanged (or with ``layer_id`` remapped by layer name via
the top-level ``layers`` list). Measurements are server-derived and therefore not exported.
"""

from __future__ import annotations

from typing import Any

from app.modules.export.document import PlanDocument

CRS_NOTE = "WGS84 (EPSG:4326), [longitude, latitude]"


def plan_to_geojson(doc: PlanDocument) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "name": doc.name,
        "plan": {
            "id": str(doc.plan_id),
            "name": doc.name,
            "description": doc.description,
            "goals": doc.goals,
            "site_name": doc.site_name,
            "updated_at": doc.updated_at.isoformat(),
            "crs": CRS_NOTE,
        },
        "layers": [
            {
                "id": str(layer.id),
                "name": layer.name,
                "sort_order": layer.sort_order,
                "visible": layer.visible,
            }
            for layer in doc.layers
        ],
        "features": [
            {
                "type": "Feature",
                "id": str(f.id),
                "layer_id": str(f.layer_id),
                "feature_type": f.feature_type,
                "element_type_id": f.element_type_id,
                "geometry": f.geometry,
                "properties": f.properties,
            }
            for f in doc.features
        ],
    }
