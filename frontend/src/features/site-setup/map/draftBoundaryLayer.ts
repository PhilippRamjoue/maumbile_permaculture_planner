import type { Feature, FeatureCollection } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";

import type { MapLayerDefinition } from "../../map/layers/types";
import { validateRing, type LngLat } from "../geometry";

export const DRAFT_BOUNDARY_LAYER_ID = "draft-boundary";

const COLOR_OK = "#ffd23f";
const COLOR_BAD = "#ff5a5f";

/**
 * Live preview of the boundary being entered. By convention of the setup flow, the (synthetic)
 * "draft site" carries the corners typed so far as the open vertex list in
 * `boundary.coordinates[0]`; the layer derives everything else (vertices, outline, fill, red when
 * the ring is invalid) from that, so it stays a pure function of the context like any other layer.
 */
export const draftBoundaryLayer: MapLayerDefinition = {
  id: DRAFT_BOUNDARY_LAYER_ID,
  label: "Boundary preview",
  toggleable: false,
  defaultVisible: true,
  build({ site }) {
    const vertices = (site.boundary.coordinates[0] ?? []) as LngLat[];
    if (vertices.length === 0) return null;

    const state = validateRing(vertices).status === "invalid" ? "invalid" : "ok";
    const features: Feature[] = vertices.map((coordinates, index) => ({
      type: "Feature",
      properties: { kind: "vertex", index, state },
      geometry: { type: "Point", coordinates },
    }));
    if (vertices.length >= 2) {
      const closed = vertices.length >= 3 ? [...vertices, vertices[0]] : vertices;
      features.push({
        type: "Feature",
        properties: { kind: "outline", state },
        geometry: { type: "LineString", coordinates: closed },
      });
    }
    if (vertices.length >= 3) {
      features.push({
        type: "Feature",
        properties: { kind: "area", state },
        geometry: { type: "Polygon", coordinates: [[...vertices, vertices[0]]] },
      });
    }
    const data: FeatureCollection = { type: "FeatureCollection", features };
    const color: ExpressionSpecification = [
      "case",
      ["==", ["get", "state"], "invalid"],
      COLOR_BAD,
      COLOR_OK,
    ];

    return {
      sources: { [DRAFT_BOUNDARY_LAYER_ID]: { type: "geojson", data } },
      layers: [
        {
          id: `${DRAFT_BOUNDARY_LAYER_ID}-fill`,
          type: "fill",
          source: DRAFT_BOUNDARY_LAYER_ID,
          filter: ["==", ["get", "kind"], "area"],
          paint: { "fill-color": color, "fill-opacity": 0.15 },
        },
        {
          id: `${DRAFT_BOUNDARY_LAYER_ID}-line`,
          type: "line",
          source: DRAFT_BOUNDARY_LAYER_ID,
          filter: ["==", ["get", "kind"], "outline"],
          paint: { "line-color": color, "line-width": 2.5 },
        },
        {
          id: `${DRAFT_BOUNDARY_LAYER_ID}-vertices`,
          type: "circle",
          source: DRAFT_BOUNDARY_LAYER_ID,
          filter: ["==", ["get", "kind"], "vertex"],
          paint: {
            "circle-radius": 5,
            "circle-color": "#ffffff",
            "circle-stroke-color": color,
            "circle-stroke-width": 2.5,
          },
        },
      ],
    };
  },
};
