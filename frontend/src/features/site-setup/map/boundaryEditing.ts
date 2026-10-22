import type { Map as MapLibreMap, MapMouseEvent, MapTouchEvent } from "maplibre-gl";

import { normalizeLngLat, type LngLat } from "../geometry";
import {
  DRAG_START_PX,
  MOUSE_HIT_PX,
  SNAP_PX,
  TOUCH_HIT_PX,
  nearestVertex,
  type BoundaryVertex,
  type Pixel,
} from "./vertexHit";

/** What the pointer controller needs from the setup page; everything is read fresh per event. */
export interface BoundaryEditingHost {
  /** The corners currently on the map. */
  vertices(): readonly BoundaryVertex[];
  /** The user clicked empty map. */
  onAdd(point: LngLat): void;
  /** A corner was pressed or clicked. */
  onSelect(id: number): void;
  /** A corner is being dragged to `point` (same `gesture` for the whole drag). */
  onMove(id: number, point: LngLat, gesture: string): void;
  onHover(id: number | null): void;
  /** The corner the dragged one will snap onto, or null. */
  onSnap(id: number | null): void;
}

type PointerEvent = MapMouseEvent | MapTouchEvent;

const isTouch = (event: PointerEvent) => event.type.startsWith("touch");
const reach = (event: PointerEvent) => (isTouch(event) ? TOUCH_HIT_PX : MOUSE_HIT_PX);
const isSecondaryButton = (event: PointerEvent) =>
  event.originalEvent instanceof MouseEvent && event.originalEvent.button !== 0;

interface Drag {
  id: number;
  gesture: string;
  /** Pointer position minus the corner's, so grabbing a corner by its edge doesn't make it jump. */
  grab: Pixel;
  start: Pixel;
  moved: boolean;
}

/**
 * Click-to-add, hover, press-to-select, drag-to-move and snap for the boundary corners.
 *
 * Everything is measured in screen pixels against the *live* projection (`map.project` /
 * `map.unproject`), never against cached pixel positions, so reach, snapping and placement are
 * identical at every zoom and survive zooming mid-session. The corners themselves live in the
 * host's store; this class only reports intent. Returns a function that detaches it.
 */
export function attachBoundaryEditing(map: MapLibreMap, host: BoundaryEditingHost): () => void {
  let drag: Drag | null = null;
  let hover: number | null = null;
  let afterDrag = false;
  let gestures = 0;

  const project = (point: LngLat): Pixel => map.project(point);
  const cursor = (value: string) => {
    map.getCanvas().style.cursor = value;
  };

  const press = (event: PointerEvent) => {
    afterDrag = false;
    if (isSecondaryButton(event)) return;
    const hit = nearestVertex(event.point, host.vertices(), project, reach(event));
    if (!hit) return;
    // Taking the event keeps the map from panning while a corner is grabbed.
    event.preventDefault();
    map.dragPan.disable();
    const at = project(hit.point);
    drag = {
      id: hit.id,
      gesture: `drag-${++gestures}`,
      grab: { x: event.point.x - at.x, y: event.point.y - at.y },
      start: { x: event.point.x, y: event.point.y },
      moved: false,
    };
    host.onSelect(hit.id);
  };

  const move = (event: PointerEvent) => {
    if (!drag) {
      if (isTouch(event)) return;
      const id = nearestVertex(event.point, host.vertices(), project, MOUSE_HIT_PX)?.id ?? null;
      if (id === hover) return;
      hover = id;
      host.onHover(id);
      cursor(id === null ? "crosshair" : "grab");
      return;
    }
    if (!drag.moved) {
      if (Math.hypot(event.point.x - drag.start.x, event.point.y - drag.start.y) < DRAG_START_PX) {
        return;
      }
      drag.moved = true;
      cursor("grabbing");
    }
    const target = { x: event.point.x - drag.grab.x, y: event.point.y - drag.grab.y };
    const snap = nearestVertex(target, host.vertices(), project, SNAP_PX, drag.id);
    const lngLat = map.unproject([target.x, target.y]);
    host.onSnap(snap?.id ?? null);
    host.onMove(drag.id, snap?.point ?? normalizeLngLat([lngLat.lng, lngLat.lat]), drag.gesture);
  };

  const release = () => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    map.dragPan.enable();
    host.onSnap(null);
    cursor(hover === null ? "crosshair" : "grab");
    if (wasDrag) {
      // The click that ends a drag must not also add a corner.
      afterDrag = true;
      setTimeout(() => (afterDrag = false), 0);
    }
  };

  const click = (event: MapMouseEvent) => {
    if (afterDrag) return;
    const hit = nearestVertex(event.point, host.vertices(), project, reach(event));
    if (hit) host.onSelect(hit.id);
    else host.onAdd(normalizeLngLat([event.lngLat.lng, event.lngLat.lat]));
  };

  map.on("mousedown", press);
  map.on("touchstart", press);
  map.on("mousemove", move);
  map.on("touchmove", move);
  map.on("mouseup", release);
  map.on("touchend", release);
  map.on("touchcancel", release);
  map.on("click", click);
  // Released outside the canvas: the map never sees that mouseup.
  window.addEventListener("mouseup", release);

  return () => {
    release();
    map.off("mousedown", press);
    map.off("touchstart", press);
    map.off("mousemove", move);
    map.off("touchmove", move);
    map.off("mouseup", release);
    map.off("touchend", release);
    map.off("touchcancel", release);
    map.off("click", click);
    window.removeEventListener("mouseup", release);
  };
}
