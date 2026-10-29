import type { ExpressionSpecification } from "maplibre-gl";
import type { MapLayerSpec } from "../map/layers/types";
import type { EditorDocument } from "./store";
import { lineWidthExpression } from "./lineWidth";
import { CONTEXT_OPACITY, renderableFeatures, type FocusView } from "./focus/view";

const flag = (name: string): ExpressionSpecification => ["==", ["get", name], true];
/** `normal`, or `faint` for features drawn as context rather than as the focus. */
const byContext = (normal: number, faint: number): ExpressionSpecification => [
  "case",
  flag("_context"),
  faint,
  normal,
];

/** Pure rendering specs, independent of the map lifecycle and drawing engine. */
export function designLayerSpecs(
  document: EditorDocument,
  selectedId: string | null,
  drawingId: string | null,
  view: FocusView,
  siteLatitude: number,
) {
  const specs = new Map<string, MapLayerSpec | null>();
  for (const layer of [...document.layers].sort((a, b) => a.sort_order - b.sort_order)) {
    const id = `design-${layer.id}`;
    const spec: MapLayerSpec = { sources: {}, layers: [] };
    specs.set(layer.id, spec);
    const features = renderableFeatures(
      document.features.filter((f) => f.layer_id === layer.id),
      view,
      selectedId,
      drawingId,
    );
    spec.sources[id] = {
      type: "geojson",
      promoteId: "_editor_id",
      data: { type: "FeatureCollection", features },
    };
    for (const kind of ["fill", "line", "circle", "ring", "symbol"] as const) {
      const layerId = `${id}-${kind}`;
      const visibility = "visible";
      if (kind === "fill")
        spec.layers.push({
          id: layerId,
          source: id,
          type: "fill",
          filter: ["all", ["==", "$type", "Polygon"], ["!", flag("_drawing")]],
          layout: { visibility },
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": ["*", ["get", "_opacity"], byContext(1, CONTEXT_OPACITY)],
          },
        });
      else if (kind === "line")
        spec.layers.push({
          id: layerId,
          source: id,
          type: "line",
          filter: ["all", ["!=", "$type", "Point"], ["!", flag("_drawing")]],
          layout: { visibility },
          paint: {
            "line-color": ["get", "color"],
            "line-width": lineWidthExpression(siteLatitude),
            "line-opacity": byContext(1, CONTEXT_OPACITY),
          },
        });
      else if (kind === "symbol")
        // Footprints and points marked with an icon: one badge at the middle of the shape.
        spec.layers.push({
          id: layerId,
          source: id,
          type: "symbol",
          filter: ["!=", ["get", "_icon"], ""],
          layout: {
            visibility,
            "icon-image": ["get", "_icon"],
            "icon-size": ["case", flag("_row"), 0.7, ["==", ["geometry-type"], "Point"], 1, 0.85],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": byContext(1, CONTEXT_OPACITY) },
        });
      else if (kind === "ring")
        // The selection ring around an icon, drawn under the badge.
        spec.layers.push({
          id: layerId,
          source: id,
          type: "circle",
          filter: [
            "all",
            ["==", ["geometry-type"], "Point"],
            ["!=", ["get", "_icon"], ""],
            flag("_selected"),
          ],
          layout: { visibility },
          paint: {
            "circle-radius": 19,
            "circle-color": "#ffd23f",
            "circle-opacity": 0.35,
            "circle-stroke-color": "#ffd23f",
            "circle-stroke-width": 3,
          },
        });
      else
        spec.layers.push({
          id: layerId,
          source: id,
          type: "circle",
          filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "_icon"], ""]],
          layout: { visibility },
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["get", "_radius"],
            "circle-opacity": byContext(1, CONTEXT_OPACITY),
            "circle-stroke-color": ["case", flag("_selected"), "#ffd23f", "#ffffff"],
            "circle-stroke-width": ["case", flag("_selected"), 4, 2],
            "circle-stroke-opacity": byContext(1, CONTEXT_OPACITY),
          },
        });
    }
  }
  if (view.connections.length > 0) {
    const id = "design-connections";
    const spec: MapLayerSpec = { sources: {}, layers: [] };
    specs.set(id, spec);
    spec.sources[id] = {
      type: "geojson",
      data: { type: "FeatureCollection", features: [...view.connections] },
    };
    spec.layers.push({
      id: `${id}-line`,
      source: id,
      type: "line",
      paint: { "line-color": "#ffd23f", "line-width": 3, "line-dasharray": [2, 1.5] },
    });
  }
  return specs;
}
