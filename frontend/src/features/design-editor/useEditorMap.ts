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
import {
  GRID_LABEL_PIXEL_RATIO,
  parseGridLabelName,
  renderGridLabel,
} from "../map/layers/gridLabels";
import { BADGE_PIXEL_RATIO, parseBadgeName, renderBadge } from "./icons";
import {
  centerOf,
  defaultFootprint,
  placeFootprint,
  placementMode,
  syncRotation,
} from "./footprint";
import { lineWidthExpression, widthMOf } from "./lineWidth";
import { rowOf } from "./rowIcons";
import { liveMeasureGeometry, measureGeometry, measureMode, type Measurement } from "./measure";
import { isParametricSector, SECTOR_COLORS, type SectorKind } from "./sectors";
import type { EditorDocument, EditorStore } from "./store";
import { typicalFunctions } from "./focus/functions";
import { CONTEXT_OPACITY, OPEN_VIEW, renderableFeatures, type FocusView } from "./focus/view";
import { useStore } from "zustand";

export type Tool =
  | "select"
  | "zone"
  | "sector"
  | "sector-rect"
  | "element"
  | "path"
  | "measure-line"
  | "measure-area";

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
  // A parametric sector (the sun's path, or one added from bearings) is reshaped from the panel —
  // its kind, bearings and radius — not by dragging its many arc vertices, so it is never handed to
  // Terra Draw for vertex editing. A hand-drawn sector has no origin/radius and stays editable.
  if (isParametricSector(selected)) return undefined;
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
  // The kind a drawn sector takes, so "Draw by hand" / "Rectangle" match the panel's chosen kind.
  sectorKind: SectorKind = "wind",
) {
  const [live, setLive] = useState<Measurement | null>(null);
  const [error, setError] = useState("");
  const drawRef = useRef<TerraDraw | null>(null);
  const syncing = useRef(false);
  const options = useRef({ tool, element, activeLayer, saving, setTool, view, sectorKind });
  options.current = { tool, element, activeLayer, saving, setTool, view, sectorKind };
  const boundaryRef = useRef(boundary);
  boundaryRef.current = boundary;
  const document = useStore(store, (s) => s.document);
  const selectedId = useStore(store, (s) => s.selectedId);
  // Paths and roads are drawn to scale: metres to pixels depend on the latitude of the site.
  const siteLatitude = boundary ? centerOf(boundary)[1] : 0;

  // A measurement belongs to the tool that made it: switching tools (including starting a fresh
  // measurement) drops the previous reading so a stale distance never lingers.
  useEffect(() => {
    setLive(null);
  }, [tool]);

  // Esc clears the measurement — including a finished line, which Terra Draw leaves on the map (it is
  // never saved). You can then measure again, or put the tool down.
  useEffect(() => {
    if (!map) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !options.current.tool.startsWith("measure")) return;
      const draw = drawRef.current;
      if (!draw) return;
      syncing.current = true;
      try {
        draw.clear();
        draw.setMode(options.current.tool === "measure-area" ? "polygon" : "linestring");
      } finally {
        syncing.current = false;
      }
      setLive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);

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
      const geometry = liveMeasureGeometry(draw.getSnapshot(), measureMode(options.current.tool));
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
      // "sector-rect" draws a clean rectangle but is just another hand-drawn sector once placed.
      const featureType =
        current.tool === "element"
          ? (current.element?.feature_type ?? "element")
          : current.tool === "sector-rect"
            ? "sector"
            : current.tool;
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
        Object.assign(properties, {
          sector_kind: current.sectorKind,
          bearing_from: 0,
          bearing_to: 90,
        });
      // A round or rectangular palette entry is one click: its to-scale footprint around the click.
      let geometry = feature.geometry;
      const footprint = defaultFootprint(palette);
      if (footprint && geometry.type === "Point") {
        geometry = placeFootprint(geometry.coordinates, footprint);
        properties.footprint = footprint;
      }
      // A path or road is as wide in metres as its palette entry says (a hand-drawn path: 1 m).
      if (featureType === "path") {
        properties.width_m = widthMOf({ width_m: palette?.default_style.width_m }) ?? 1;
      }
      // A windbreak or hedge is planted out of the box: its palette entry's icon row, if it has one.
      const row = featureType === "element" ? rowOf(palette?.default_style ?? {}) : null;
      if (row) Object.assign(properties, { row_icon: row.icon, row_spacing_m: row.spacing_m });
      const color = palette?.default_style.fill ?? palette?.default_style.stroke;
      properties.color =
        featureType === "sector"
          ? SECTOR_COLORS[current.sectorKind]
          : typeof color === "string"
            ? color
            : featureType === "zone"
              ? "#f59e0b"
              : "#2f855a";
      store.getState().upsert({
        type: "Feature",
        id: String(id),
        layer_id: current.activeLayer,
        feature_type: featureType as DesignFeature["feature_type"],
        element_type_id: current.tool === "element" ? (current.element?.id ?? null) : null,
        geometry,
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
            : tool === "sector-rect"
              ? "rectangle"
              : tool === "element"
                ? placementMode(element)
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

  // Icon markers and grid numbers are drawn on demand: the layers ask for an image by name (glyph
  // and colour, or the number), which is made once and kept by the map.
  useEffect(() => {
    if (!map) return;
    map.setMissingStyleImageResolver((id) => {
      if (map.hasImage(id)) return;
      const badge = parseBadgeName(id);
      const label = parseGridLabelName(id);
      if (badge) {
        const image = renderBadge(badge.key, badge.color);
        if (image) map.addImage(id, image, { pixelRatio: BADGE_PIXEL_RATIO });
      } else if (label) {
        const image = renderGridLabel(label);
        if (image) map.addImage(id, image, { pixelRatio: GRID_LABEL_PIXEL_RATIO });
      }
    });
    return () => {
      try {
        map.setMissingStyleImageResolver(null);
      } catch {
        /* map already removed during route teardown */
      }
    };
  }, [map]);

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
      for (const kind of ["fill", "line", "circle", "ring", "symbol"] as const) {
        const layerId = `${id}-${kind}`;
        layerIds.push(layerId);
        const visibility = layer.visible ? "visible" : "none";
        if (kind === "fill")
          map.addLayer({
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
          map.addLayer({
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
          map.addLayer({
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
          map.addLayer({
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
          map.addLayer({
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
  }, [map, document, selectedId, tool, saving, imagery, overlays, view, siteLatitude]);

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
      // Terra Draw turns counter-clockwise for a positive angle; "right" means clockwise.
      options: { angle: -angle },
    });
    const changed = draw.getSnapshotFeature(selected.id);
    if (changed) store.getState().upsert(syncRotation({ ...selected, geometry: changed.geometry }));
  };
  return { live, error, rotate };
}
