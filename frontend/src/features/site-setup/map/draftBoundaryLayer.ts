import type { Feature, FeatureCollection } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";

import type { MapLayerContext, MapLayerDefinition } from "../../map/layers/types";
import { validateRing, type LngLat } from "../geometry";

export const DRAFT_BOUNDARY_LAYER_ID = "draft-boundary";

const COLOR_OK = "#ffd23f";
const COLOR_BAD = "#ff5a5f";
const COLOR_SNAP = "#35e0ff";

/** Which corner is hovered, selected or the snap target (indices into the corner list). */
export interface DraftBoundaryUi {
  hoverIndex: number | null;
  selectedIndex: number | null;
  snapIndex: number | null;
}

export const NO_DRAFT_UI: DraftBoundaryUi = {
  hoverIndex: null,
  selectedIndex: null,
  snapIndex: null,
};

/** The draft boundary's interaction state as handed over in `MapLayerContext.ui`. */
export function draftUiOf(context: MapLayerContext): DraftBoundaryUi {
  return { ...NO_DRAFT_UI, ...(context.ui?.[DRAFT_BOUNDARY_LAYER_ID] as Partial<DraftBoundaryUi>) };
}

const flag = (name: string): ExpressionSpecification => ["==", ["get", name], true];

/**
 * Live preview of the boundary being entered. By convention of the setup flow, the (synthetic)
 * "draft site" carries the corners typed so far as the open vertex list in
 * `boundary.coordinates[0]`; the layer derives everything else (vertices, outline, fill, red when
 * the ring is invalid, hover / selected / snap highlights from `context.ui`) from that, so it stays
 * a pure function of the context like any other layer.
 */
export const draftBoundaryLayer: MapLayerDefinition = {
  id: DRAFT_BOUNDARY_LAYER_ID,
  label: "Boundary preview",
  toggleable: false,
  defaultVisible: true,
  build(context) {
    const vertices = (context.site.boundary.coordinates[0] ?? []) as LngLat[];
    if (vertices.length === 0) return null;
    const ui = draftUiOf(context);

    const state = validateRing(vertices).status === "invalid" ? "invalid" : "ok";
    const features: Feature[] = vertices.map((coordinates, index) => ({
      type: "Feature",
      properties: {
        kind: "vertex",
        index,
        state,
        hover: index === ui.hoverIndex,
        selected: index === ui.selectedIndex,
        snap: index === ui.snapIndex,
      },
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
          // Corner handles. Hovered: bigger with a heavier ring. Selected: solid, so it reads at a
          // glance which corner Delete will remove.
          id: `${DRAFT_BOUNDARY_LAYER_ID}-vertices`,
          type: "circle",
          source: DRAFT_BOUNDARY_LAYER_ID,
          filter: ["==", ["get", "kind"], "vertex"],
          paint: {
            "circle-radius": ["case", flag("selected"), 9, flag("hover"), 8, 6],
            "circle-color": ["case", flag("selected"), color, "#ffffff"],
            "circle-stroke-color": ["case", flag("selected"), "#ffffff", color],
            "circle-stroke-width": ["case", flag("selected"), 3, flag("hover"), 4, 2.5],
          },
        },
        {
          // Shown around the corner a drag is about to snap onto.
          id: `${DRAFT_BOUNDARY_LAYER_ID}-snap`,
          type: "circle",
          source: DRAFT_BOUNDARY_LAYER_ID,
          filter: ["all", ["==", ["get", "kind"], "vertex"], flag("snap")],
          paint: {
            "circle-radius": 14,
            "circle-color": COLOR_SNAP,
            "circle-opacity": 0.2,
            "circle-stroke-color": COLOR_SNAP,
            "circle-stroke-width": 3,
          },
        },
      ],
    };
  },
};
