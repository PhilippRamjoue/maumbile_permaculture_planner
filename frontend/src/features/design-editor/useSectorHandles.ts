import { useEffect, useRef } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  MapMouseEvent,
} from "maplibre-gl";
import { useStore } from "zustand";

import type { DesignFeature } from "../../entities/planning";
import type { EditorStore } from "./store";
import {
  bearingBetween,
  distanceBetween,
  isParametricSector,
  moveSectorOrigin,
  sectorHandles,
  setSectorBearing,
  setSectorRadius,
  type SectorHandleRole,
} from "./sectors";

const SOURCE_ID = "sector-handles";
const LAYER_ID = "sector-handles-point";
const HALO_ID = "sector-handles-halo";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const handleCollection = (sector: DesignFeature | null): GeoJSON.FeatureCollection =>
  sector
    ? {
        type: "FeatureCollection",
        features: sectorHandles(sector).map(({ role, point }) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: point },
          properties: { role },
        })),
      }
    : EMPTY;

/** Applies a drag of one handle to the sector, from the pointer position. */
function dragged(
  base: DesignFeature,
  role: SectorHandleRole,
  point: [number, number],
): DesignFeature {
  const origin = base.properties.origin as [number, number];
  if (role === "origin") return moveSectorOrigin(base, point);
  if (role === "radius") return setSectorRadius(base, distanceBetween(origin, point));
  return setSectorBearing(base, role, bearingBetween(origin, point));
}

/**
 * On-map editing of a parametric sector (the sun's path, or one added from bearings): round handles
 * at the wedge's centre, its two edges and its arc. Dragging the centre moves the whole wedge, an
 * edge opens or closes it, and the arc resizes it — the same spec the Sectors panel edits by number.
 * Only active in the Sectors step, for the selected parametric sector on a visible layer; hand-drawn
 * sectors are ordinary polygons edited by their vertices instead, so they get no handles here.
 */
export function useSectorHandles(map: MapLibreMap | null, store: EditorStore, active: boolean) {
  const document = useStore(store, (s) => s.document);
  const selectedId = useStore(store, (s) => s.selectedId);
  const selected = document.features.find((f) => f.id === selectedId);
  const onVisibleLayer =
    !!selected && !!document.layers.find((l) => l.id === selected.layer_id)?.visible;
  const sector =
    active && selected && isParametricSector(selected) && onVisibleLayer ? selected : null;
  const geomKey = sector ? JSON.stringify(sector.geometry) : "";

  // The drag in flight, and the next geometry to commit on the next animation frame (throttling the
  // upserts so a fast drag does not rebuild the map layers on every pointer event).
  const drag = useRef<{ role: SectorHandleRole; base: DesignFeature } | null>(null);
  const pending = useRef<DesignFeature | null>(null);
  const frame = useRef(0);

  // Create the handle source and layers once, with the pointer handlers that drive a drag.
  useEffect(() => {
    if (!map) return;
    const ensure = () => {
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY });
      map.addLayer({
        id: HALO_ID,
        source: SOURCE_ID,
        type: "circle",
        paint: { "circle-radius": 11, "circle-color": "#000", "circle-opacity": 0.18 },
      });
      map.addLayer({
        id: LAYER_ID,
        source: SOURCE_ID,
        type: "circle",
        paint: {
          "circle-radius": ["case", ["==", ["get", "role"], "origin"], 8, 7],
          "circle-color": [
            "match",
            ["get", "role"],
            "origin",
            "#1f2937",
            "radius",
            "#0891b2",
            "#ffd23f",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      });
    };
    ensure();

    const commit = () => {
      frame.current = 0;
      if (pending.current) store.getState().upsert(pending.current);
      pending.current = null;
    };
    const onMove = (event: MapMouseEvent) => {
      if (!drag.current) return;
      event.preventDefault();
      const point: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      pending.current = dragged(drag.current.base, drag.current.role, point);
      if (!frame.current) frame.current = requestAnimationFrame(commit);
    };
    const onUp = () => {
      if (!drag.current) return;
      if (frame.current) cancelAnimationFrame(frame.current);
      commit();
      drag.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };
    const onDown = (event: MapLayerMouseEvent) => {
      const role = event.features?.[0]?.properties?.role as SectorHandleRole | undefined;
      const current = store.getState();
      const base = current.document.features.find((f) => f.id === current.selectedId);
      if (!role || !base || !isParametricSector(base)) return;
      event.preventDefault();
      drag.current = { role, base };
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    };
    const onEnter = () => {
      if (!drag.current) map.getCanvas().style.cursor = "grab";
    };
    const onLeave = () => {
      if (!drag.current) map.getCanvas().style.cursor = "";
    };
    map.on("mousedown", LAYER_ID, onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);
    map.on("mouseenter", LAYER_ID, onEnter);
    map.on("mouseleave", LAYER_ID, onLeave);
    // Layers can be lost when the base style reloads; put them back if so.
    map.on("styledata", ensure);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      map.off("mousedown", LAYER_ID, onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      map.off("mouseenter", LAYER_ID, onEnter);
      map.off("mouseleave", LAYER_ID, onLeave);
      map.off("styledata", ensure);
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getLayer(HALO_ID)) map.removeLayer(HALO_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        /* map already removed during route teardown */
      }
    };
  }, [map, store]);

  // Draw the handles for the selected parametric sector and keep them above the design layers, which
  // the editor rebuilds on every change. Runs on each document change so handles follow a live drag.
  useEffect(() => {
    if (!map) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(handleCollection(sector));
    if (sector) {
      if (map.getLayer(HALO_ID)) map.moveLayer(HALO_ID);
      if (map.getLayer(LAYER_ID)) map.moveLayer(LAYER_ID);
    }
    // geomKey and document both change during a drag; depending on them keeps the handles on the
    // wedge and on top as the editor re-adds its layers.
  }, [map, sector, geomKey, document]);
}
