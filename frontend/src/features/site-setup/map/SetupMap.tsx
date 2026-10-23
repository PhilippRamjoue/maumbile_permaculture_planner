import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BBox, Site } from "../../../entities/site";
import { MapView } from "../../map/MapView";
import { MAX_FIT_ZOOM, POINT_FOCUS_ZOOM } from "../../map/layers/zoomLimits";
import { ZoomToBoundaryButton } from "../../map/ZoomToBoundaryButton";
import { countryBBox } from "../countries";
import { bboxOf, cellToPoint, pointToCell, type LngLat } from "../geometry";
import { attachBoundaryEditing } from "./boundaryEditing";
import { DRAFT_BOUNDARY_LAYER_ID, type DraftBoundaryUi } from "./draftBoundaryLayer";
import { isComfortablyFramed } from "./framing";
import { setupLayerRegistry } from "./setupRegistry";
import { useSetupStore } from "../store";
import type { BoundaryVertex } from "./vertexHit";

interface SetupMapProps {
  countryCode: string | null;
  /** Corners entered so far (an open ring), each tagged with its table row. */
  vertices: BoundaryVertex[];
  selectedId: number | null;
  /** Called with [lng, lat] when the user clicks empty map. */
  onAddPoint(point: LngLat): void;
  onSelect(id: number | null): void;
  /** `gesture` is shared by all moves of one drag, so the store can make it a single undo step. */
  onMovePoint(id: number, point: LngLat, gesture: string): void;
}

const FIT_PADDING = 64;
const DRAFT_SITE_ID = "draft";

/**
 * A stand-in `Site` so the shared `<MapView>` can show a boundary that doesn't exist yet. Its id is
 * constant (the map instance is created once, framed on the country); only `boundary` changes, which
 * re-syncs the layers. See `draftBoundaryLayer` for how the corners travel.
 */
function draftSite(countryCode: string | null, points: LngLat[], focus: LngLat | null): Site {
  const [lng, lat] = points[0] ?? [0, 0];
  return {
    id: DRAFT_SITE_ID,
    owner_id: null,
    name: "",
    country_code: countryCode,
    boundary: { type: "Polygon", coordinates: [points] },
    centroid: { type: "Point", coordinates: [lng, lat] },
    // A coordinate the user typed beats the whole country: open where they can recognise their land.
    bbox: focus ? focusBBox(focus) : countryBBox(countryCode),
    area_m2: 0,
    utm_epsg: 0,
    created_at: "",
    updated_at: "",
  };
}

/** A box of roughly 900 m around a point, which `fitBounds` turns into about z16. */
function focusBBox([lng, lat]: LngLat): BBox {
  const half = 0.004;
  return [lng - half, lat - half, lng + half, lat + half];
}

/** What a point becomes once stored in a table cell (and so what the map will read back). */
const stored = (point: LngLat): LngLat => cellToPoint(pointToCell(point))!;

/**
 * The shared map, set up for drawing a boundary: country framing, click to add a corner, drag to
 * move one, click to select, snap, live preview and a "Zoom to boundary" button. The store's rows
 * are the only source of truth; this component draws them and reports pointer intent.
 */
export function SetupMap({
  countryCode,
  vertices,
  selectedId,
  onAddPoint,
  onSelect,
  onMovePoint,
}: SetupMapProps) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [snapId, setSnapId] = useState<number | null>(null);

  const focusPoint = useSetupStore((s) => s.focusPoint);
  const points = useMemo(() => vertices.map((v) => v.point), [vertices]);
  const live = useRef({ vertices, points, focusPoint, onAddPoint, onSelect, onMovePoint });
  live.current = { vertices, points, focusPoint, onAddPoint, onSelect, onMovePoint };
  // The corners the map itself just produced. Re-framing a view the user is looking at (they just
  // clicked or dragged there) would make the point they placed slide away from the cursor.
  const expectedSignature = useRef<string | null>(null);

  // The map is created once per mount, so the country only frames the first view; `points` and
  // the country change the draft site's content, not its identity.
  const site = useMemo(
    () => draftSite(countryCode, points, focusPoint),
    [countryCode, points, focusPoint],
  );

  const ui = useMemo(() => {
    const indexOf = (id: number | null) => {
      const index = vertices.findIndex((v) => v.id === id);
      return index < 0 ? null : index;
    };
    const state: DraftBoundaryUi = {
      hoverIndex: indexOf(hoverId),
      selectedIndex: indexOf(selectedId),
      snapIndex: indexOf(snapId),
    };
    return { [DRAFT_BOUNDARY_LAYER_ID]: state };
  }, [vertices, hoverId, selectedId, snapId]);

  const fitToPoints = useCallback((target: MapLibreMap) => {
    const { points: corners } = live.current;
    if (corners.length === 1) {
      // One corner has no extent to fit; show it at a zoom where the surroundings are recognisable.
      target.jumpTo({ center: corners[0], zoom: POINT_FOCUS_ZOOM });
      return;
    }
    const box = bboxOf(corners);
    if (box) target.fitBounds(box, { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM, duration: 0 });
  }, []);
  const bounds = useMemo(() => bboxOf(points), [points]);

  const handleReady = useCallback(
    (ready: MapLibreMap) => {
      const map = ready;
      mapRef.current = map;
      setMap(map);
      map.getCanvas().style.cursor = "crosshair";
      // A double-click zooms and would also drop two corners; rotation makes "north is up" lie.
      map.doubleClickZoom.disable();
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      detachRef.current?.();
      detachRef.current = attachBoundaryEditing(map, {
        vertices: () => live.current.vertices,
        onAdd: (point) => {
          const next = stored(point);
          expectedSignature.current = JSON.stringify([...live.current.points, next]);
          live.current.onSelect(null);
          live.current.onAddPoint(next);
        },
        onSelect: (id) => live.current.onSelect(id),
        onMove: (id, point, gesture) => {
          const next = stored(point);
          expectedSignature.current = JSON.stringify(
            live.current.vertices.map((v) => (v.id === id ? next : v.point)),
          );
          live.current.onMovePoint(id, next, gesture);
        },
        onHover: setHoverId,
        onSnap: setSnapId,
      });
      // The canvas can still be laying out when MapView builds the map, which leaves it at world
      // zoom; resize, then frame on the corners, else on the coordinate the user gave, so they
      // land near their plot rather than at country zoom.
      map.resize();
      const { points: corners, focusPoint: focus } = live.current;
      if (corners.length > 0) fitToPoints(map);
      else if (focus) map.jumpTo({ center: focus, zoom: POINT_FOCUS_ZOOM });
    },
    [fitToPoints],
  );

  useEffect(
    () => () => {
      detachRef.current?.();
      detachRef.current = null;
    },
    [],
  );

  // Keep the boundary on screen when corners change from outside the map (typed, pasted, undone):
  // re-frame unless it is already comfortably in view. Changes the map itself made never re-frame
  // (see `expectedSignature`). Keyed on the points' values so finishing a half-typed coordinate
  // ends with the map framed on the real boundary.
  const lastSignature = useRef("");
  useEffect(() => {
    const signature = JSON.stringify(points);
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    const fromMap = signature === expectedSignature.current;
    expectedSignature.current = null;
    const current = mapRef.current;
    if (fromMap || !current || points.length === 0) return;
    const container = current.getContainer();
    const size = { width: container.clientWidth, height: container.clientHeight };
    if (!isComfortablyFramed(points, (p) => current.project(p), size)) fitToPoints(current);
  }, [points, fitToPoints]);

  return (
    <>
      <MapView site={site} registry={setupLayerRegistry} layerUi={ui} onMapReady={handleReady} />
      <div className="map-tools">
        <ZoomToBoundaryButton map={map} bounds={bounds} padding={FIT_PADDING} />
      </div>
      <p className="map-hint" aria-hidden="true">
        Click to add a corner · drag a corner to move it · click a corner to select it
      </p>
    </>
  );
}
