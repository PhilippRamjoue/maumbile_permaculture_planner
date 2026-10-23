import { useEffect, useRef, useState } from "react";
import type { Polygon } from "geojson";
import type { ExpressionSpecification, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { TerraDraw } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { DesignFeature, ElementType } from "../../entities/planning";
import type { ImageryMeta } from "../../entities/imagery";
import {
  createEditorModes,
  COORDINATE_PRECISION,
  geometryMode,
  isOnCorner,
  pickBox,
  pickFeature,
  roundGeometry,
  snapTargets,
  verticesOf,
  type FeatureHit,
} from "./editorModes";
import { measureGeometry, type Measurement } from "./measure";
import type { EditorDocument, EditorStore } from "./store";
import { typicalFunctions } from "./focus/functions";
import { CONTEXT_OPACITY, OPEN_VIEW, renderableFeatures, type FocusView } from "./focus/view";
import { useStore } from "zustand";

export type Tool =
  "select" | "zone" | "sector" | "element" | "path" | "measure-line" | "measure-area";

const flag = (name: string): ExpressionSpecification => ["==", ["get", name], true];
/** `normal`, or `faint` for features drawn as context rather than as the focus. */
const byContext = (normal: number, faint: number): ExpressionSpecification => [
  "case",
  flag("_context"),
  faint,
  normal,
];

/**
 * The feature Terra Draw edits right now: the selected one, when the focus lets its shape be
 * reshaped and it is drawn at all. Every other feature is drawn by the renderer below.
 */
function editedFeature(
  document: EditorDocument,
  selectedId: string | null,
  tool: Tool,
  saving: boolean,
  view: FocusView,
) {
  if (tool !== "select" || saving || !view.geometryEditable) return undefined;
  const selected = document.features.find((f) => f.id === selectedId);
  if (!selected || !view.isEditable(selected) || !view.isShown(selected)) return undefined;
  return document.layers.find((l) => l.id === selected.layer_id)?.visible ? selected : undefined;
}

export function useEditorMap(
  map: MapLibreMap | null,
  store: EditorStore,
  tool: Tool,
  element: ElementType | undefined,
  activeLayer: string,
  saving: boolean,
  setTool: (tool: Tool) => void,
  imagery: ImageryMeta | undefined,
  // Registry layers rebuilt after the editor drew its own (terrain arriving late) are restacked on
  // top of them; changing this re-adds the document layers above them again.
  overlays?: unknown,
  // The site boundary: zones and paths snap onto its corners.
  boundary?: Polygon,
  // The focus mode: what can be picked and edited, what is drawn faintly, what is hidden.
  view: FocusView = OPEN_VIEW,
) {
  const [live, setLive] = useState<Measurement | null>(null);
  const [error, setError] = useState("");
  const drawRef = useRef<TerraDraw | null>(null);
  const syncing = useRef(false);
  const options = useRef({ tool, element, activeLayer, saving, setTool, view });
  options.current = { tool, element, activeLayer, saving, setTool, view };
  const boundaryRef = useRef(boundary);
  boundaryRef.current = boundary;
  const document = useStore(store, (s) => s.document);
  const selectedId = useStore(store, (s) => s.selectedId);

  useEffect(() => {
    if (!map) return;
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({
        map,
        coordinatePrecision: COORDINATE_PRECISION,
        prefixId: "editor-draw",
      }),
      modes: createEditorModes(() =>
        snapTargets(
          store.getState().document,
          store.getState().selectedId,
          boundaryRef.current,
          options.current.view.isShown,
        ),
      ),
    });
    draw.start();
    draw.setMode("select");
    drawRef.current = draw;
    draw.on("change", () => {
      if (syncing.current) return;
      const snapshot = draw
        .getSnapshot()
        .filter((f) =>
          ["point", "linestring", "polygon", "rectangle"].includes(String(f.properties.mode)),
        );
      const geometry = snapshot.at(-1)?.geometry;
      if (geometry) setLive(measureGeometry(geometry));
    });
    draw.on("finish", (id, context) => {
      if (syncing.current || options.current.saving) return;
      const feature = draw.getSnapshotFeature(id);
      if (!feature) return;
      const current = options.current;
      if (current.tool.startsWith("measure")) {
        setLive(measureGeometry(feature.geometry));
        return;
      }
      if (current.tool === "select" || context.mode === "select") {
        const original = store.getState().document.features.find((f) => f.id === String(id));
        if (original) store.getState().upsert({ ...original, geometry: feature.geometry });
        return;
      }
      if (!current.activeLayer) return;
      const featureType =
        current.tool === "element" ? (current.element?.feature_type ?? "element") : current.tool;
      if (!["zone", "sector", "element", "path", "annotation"].includes(featureType)) return;
      const palette = current.tool === "element" ? current.element : undefined;
      const properties: DesignFeature["properties"] = {
        name: palette?.name ?? featureType,
        style: palette?.default_style ?? {},
      };
      // Typical needs / yields of the palette entry, so connections work without extra clicks.
      Object.assign(properties, typicalFunctions(palette));
      if (featureType === "zone") properties.zone_number = current.view.defaults.zoneNumber;
      if (featureType === "sector")
        Object.assign(properties, { sector_kind: "wind", bearing_from: 0, bearing_to: 90 });
      const color = palette?.default_style.fill ?? palette?.default_style.stroke;
      properties.color =
        typeof color === "string" ? color : featureType === "zone" ? "#f59e0b" : "#2f855a";
      store.getState().upsert({
        type: "Feature",
        id: String(id),
        layer_id: current.activeLayer,
        feature_type: featureType as DesignFeature["feature_type"],
        element_type_id: current.tool === "element" ? (current.element?.id ?? null) : null,
        geometry: feature.geometry,
        properties,
      });
      queueMicrotask(() => current.setTool("select"));
    });
    const click = (event: MapMouseEvent) => {
      if (options.current.tool !== "select" || options.current.saving) return;
      const ids =
        map
          .getStyle()
          .layers?.filter((l) => l.id.startsWith("design-"))
          .map((l) => l.id) ?? [];
      if (!ids.length) return;
      const current = store.getState();
      const editing = current.document.features.find((f) => f.id === current.selectedId);
      if (
        editing &&
        isOnCorner(event.point, verticesOf(editing.geometry), (c) => map.project([c[0], c[1]]))
      ) {
        return;
      }
      // A few pixels of slack: paths and outlines are thinner than a fingertip or a shaky click.
      // Only the focus mode's own features can be picked; faint context is look-only.
      const editableIds = new Set(
        current.document.features.filter(options.current.view.isEditable).map((f) => f.id),
      );
      const hits: FeatureHit[] = map
        .queryRenderedFeatures(pickBox(event.point), { layers: ids })
        .flatMap((found) =>
          typeof found.properties._editor_id === "string" &&
          editableIds.has(found.properties._editor_id)
            ? [{ id: found.properties._editor_id, geometryType: found.geometry.type }]
            : [],
        );
      const id = pickFeature(hits);
      if (id !== undefined) store.getState().select(id);
    };
    map.on("click", click);
    return () => {
      map.off("click", click);
      syncing.current = true;
      try {
        draw.stop();
      } catch {
        /* map may already be removed */
      }
      drawRef.current = null;
      syncing.current = false;
    };
  }, [map, store]);

  // Terra Draw holds only the active selection/draft. The renderer below owns every other
  // design feature, allowing real per-plan layer visibility and stacking without adapter internals.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    syncing.current = true;
    try {
      draw.setMode("select");
      draw.clear();
      if (saving) return;
      const selected = editedFeature(document, selectedId, tool, saving, view);
      if (selected) {
        const results = draw.addFeatures([
          {
            type: "Feature",
            id: selected.id,
            geometry: roundGeometry(selected.geometry),
            properties: { mode: geometryMode(selected) },
          },
        ]);
        if (results.some((result) => !result.valid))
          throw new Error("This geometry cannot be edited.");
        draw.selectFeature(selected.id);
      } else if (tool !== "select") {
        if (
          !tool.startsWith("measure") &&
          !document.layers.some((layer) => layer.id === activeLayer && layer.visible)
        ) {
          throw new Error("Choose a visible layer before drawing.");
        }
        const mode =
          tool === "path" || tool === "measure-line"
            ? "linestring"
            : tool === "element"
              ? element?.geometry_type === "line"
                ? "linestring"
                : element?.geometry_type === "polygon"
                  ? "rectangle"
                  : "point"
              : "polygon";
        draw.setMode(mode);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start drawing.");
    } finally {
      syncing.current = false;
    }
  }, [map, document, selectedId, tool, element, saving, activeLayer, view]);

  useEffect(() => {
    if (!map) return;
    const sourceIds: string[] = [];
    const layerIds: string[] = [];
    const drawing = editedFeature(document, selectedId, tool, saving, view);
    for (const layer of [...document.layers].sort((a, b) => a.sort_order - b.sort_order)) {
      const id = `design-${layer.id}`;
      sourceIds.push(id);
      const features = renderableFeatures(
        document.features.filter((f) => f.layer_id === layer.id),
        view,
        selectedId,
        drawing?.id ?? null,
      );
      map.addSource(id, {
        type: "geojson",
        promoteId: "_editor_id",
        data: { type: "FeatureCollection", features },
      });
      for (const kind of ["fill", "line", "circle"] as const) {
        const layerId = `${id}-${kind}`;
        layerIds.push(layerId);
        const visibility = layer.visible ? "visible" : "none";
        if (kind === "fill")
          map.addLayer({
            id: layerId,
            source: id,
            type: "fill",
            filter: ["==", "$type", "Polygon"],
            layout: { visibility },
            paint: {
              "fill-color": ["get", "color"],
              "fill-opacity": ["*", ["get", "_opacity"], byContext(1, CONTEXT_OPACITY)],
            },
          });
        else if (kind === "line")
          map.addLayer({
            id: layerId,
            source: id,
            type: "line",
            filter: ["!=", "$type", "Point"],
            layout: { visibility },
            paint: {
              "line-color": ["get", "color"],
              "line-width": [
                "case",
                flag("_selected"),
                ["+", ["get", "_width"], 2],
                ["get", "_width"],
              ],
              "line-opacity": byContext(1, CONTEXT_OPACITY),
            },
          });
        else
          map.addLayer({
            id: layerId,
            source: id,
            type: "circle",
            filter: ["==", "$type", "Point"],
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
      sourceIds.push(id);
      layerIds.push(`${id}-line`);
      map.addSource(id, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [...view.connections] },
      });
      map.addLayer({
        id: `${id}-line`,
        source: id,
        type: "line",
        paint: { "line-color": "#ffd23f", "line-width": 3, "line-dasharray": [2, 1.5] },
      });
    }
    // Keep editing handles (and the border's corner handles, in the boundary focus) above the
    // document layers.
    map
      .getStyle()
      .layers?.filter((l) => l.id.startsWith("editor-draw") || l.id.startsWith("draft-boundary"))
      .forEach((l) => map.moveLayer(l.id));
    return () => {
      try {
        for (const id of layerIds) if (map.getLayer(id)) map.removeLayer(id);
        for (const id of sourceIds) if (map.getSource(id)) map.removeSource(id);
      } catch {
        /* map already removed during route teardown */
      }
    };
  }, [map, document, selectedId, tool, saving, imagery, overlays, view]);

  const rotate = (angle: number) => {
    const draw = drawRef.current;
    const selected = store
      .getState()
      .document.features.find((feature) => feature.id === store.getState().selectedId);
    if (!draw || !selected || selected.geometry.type === "Point" || saving) return;
    if (!draw.hasFeature(selected.id)) {
      setError("Show the feature's layer before rotating.");
      return;
    }
    const points =
      selected.geometry.type === "Polygon"
        ? selected.geometry.coordinates.flat()
        : selected.geometry.coordinates;
    const lngs = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);
    draw.transformFeatureGeometry(selected.id, {
      type: "rotate",
      projection: "web-mercator",
      origin: [
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
        (Math.min(...lats) + Math.max(...lats)) / 2,
      ],
      options: { angle },
    });
    const changed = draw.getSnapshotFeature(selected.id);
    if (changed) store.getState().upsert({ ...selected, geometry: changed.geometry });
  };
  return { live, error, rotate };
}
