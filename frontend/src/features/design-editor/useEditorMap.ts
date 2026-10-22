import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { DesignFeature, ElementType } from "../../entities/planning";
import type { ImageryMeta } from "../../entities/imagery";
import { measureGeometry, type Measurement } from "./measure";
import type { EditorStore } from "./store";
import { useStore } from "zustand";

export type Tool =
  "select" | "zone" | "sector" | "element" | "path" | "measure-line" | "measure-area";
const numberStyle = (style: unknown, key: string, fallback: number, min: number, max: number) => {
  const value =
    typeof style === "object" && style !== null
      ? Number((style as Record<string, unknown>)[key])
      : NaN;
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
};
const editable = {
  feature: {
    draggable: true,
    rotateable: true,
    coordinates: { draggable: true, deletable: true, midpoints: true },
  },
};
const geometryMode = (feature: DesignFeature) =>
  feature.geometry.type === "Point"
    ? "point"
    : feature.geometry.type === "LineString"
      ? "linestring"
      : "polygon";

export function useEditorMap(
  map: MapLibreMap | null,
  store: EditorStore,
  tool: Tool,
  element: ElementType | undefined,
  activeLayer: string,
  saving: boolean,
  setTool: (tool: Tool) => void,
  imagery: ImageryMeta | undefined,
) {
  const [live, setLive] = useState<Measurement | null>(null);
  const [error, setError] = useState("");
  const drawRef = useRef<TerraDraw | null>(null);
  const syncing = useRef(false);
  const options = useRef({ tool, element, activeLayer, saving, setTool });
  options.current = { tool, element, activeLayer, saving, setTool };
  const document = useStore(store, (s) => s.document);
  const selectedId = useStore(store, (s) => s.selectedId);

  useEffect(() => {
    if (!map) return;
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({
        map,
        coordinatePrecision: 8,
        prefixId: "editor-draw",
      }),
      modes: [
        new TerraDrawPointMode(),
        new TerraDrawLineStringMode(),
        new TerraDrawPolygonMode(),
        new TerraDrawRectangleMode(),
        new TerraDrawSelectMode({
          flags: { point: editable, linestring: editable, polygon: editable, rectangle: editable },
          keyEvents: { deselect: "Escape", delete: null, rotate: null, scale: null },
        }),
      ],
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
      if (featureType === "zone") properties.zone_number = 1;
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
      const found = map.queryRenderedFeatures(event.point, { layers: ids })[0];
      const id = found?.properties._editor_id;
      if (typeof id === "string") store.getState().select(id);
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
      const selected = document.features.find((f) => f.id === selectedId);
      const visible = document.layers.find((l) => l.id === selected?.layer_id)?.visible;
      if (tool === "select" && selected && visible) {
        const results = draw.addFeatures([
          {
            type: "Feature",
            id: selected.id,
            geometry: selected.geometry,
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
  }, [map, document, selectedId, tool, element, saving, activeLayer]);

  useEffect(() => {
    if (!map) return;
    const sourceIds: string[] = [];
    const layerIds: string[] = [];
    for (const layer of [...document.layers].sort((a, b) => a.sort_order - b.sort_order)) {
      const id = `design-${layer.id}`;
      sourceIds.push(id);
      const features = document.features
        .filter(
          (f) => f.layer_id === layer.id && !(tool === "select" && !saving && f.id === selectedId),
        )
        .map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            _editor_id: f.id,
            _width: numberStyle(f.properties.style, "stroke_width", 3, 1, 12),
            _radius: numberStyle(f.properties.style, "radius", 8, 3, 24),
            _opacity: numberStyle(f.properties.style, "fill_opacity", 0.3, 0, 1),
            color: /^#[0-9a-f]{6}$/i.test(String(f.properties.color))
              ? f.properties.color
              : "#2f855a",
          },
        }));
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
            paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "_opacity"] },
          });
        else if (kind === "line")
          map.addLayer({
            id: layerId,
            source: id,
            type: "line",
            filter: ["!=", "$type", "Point"],
            layout: { visibility },
            paint: { "line-color": ["get", "color"], "line-width": ["get", "_width"] },
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
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
      }
    }
    // Keep editing handles above the document layers.
    map
      .getStyle()
      .layers?.filter((l) => l.id.startsWith("editor-draw"))
      .forEach((l) => map.moveLayer(l.id));
    return () => {
      try {
        for (const id of layerIds) if (map.getLayer(id)) map.removeLayer(id);
        for (const id of sourceIds) if (map.getSource(id)) map.removeSource(id);
      } catch {
        /* map already removed during route teardown */
      }
    };
  }, [map, document, selectedId, tool, saving, imagery]);

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
