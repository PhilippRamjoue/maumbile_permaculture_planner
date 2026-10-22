import type { LngLat } from "../geometry";

/** A corner on the map, tagged with the id of the table row that owns it. */
export interface BoundaryVertex {
  id: number;
  point: LngLat;
}

export interface Pixel {
  x: number;
  y: number;
}

/** Maps a coordinate to container pixels (`map.project`). */
export type ProjectFn = (point: LngLat) => Pixel;

/** Pointer reach, in CSS pixels. Fingers are blunter than mice. */
export const MOUSE_HIT_PX = 12;
export const TOUCH_HIT_PX = 22;
/** A dragged corner jumps onto another corner this close to it. */
export const SNAP_PX = 12;
/** Movement before a press on a corner becomes a drag, so a slightly shaky click never nudges it. */
export const DRAG_START_PX = 3;

/**
 * The corner closest to `pixel` and within `radiusPx` of it, measured on screen — so reach feels the
 * same at every zoom. Ties go to the later corner, which draws on top. `exclude` skips one corner
 * (the one being dragged).
 */
export function nearestVertex(
  pixel: Pixel,
  vertices: readonly BoundaryVertex[],
  project: ProjectFn,
  radiusPx: number,
  exclude?: number,
): BoundaryVertex | null {
  let best: BoundaryVertex | null = null;
  let bestDistance = Infinity;
  for (const vertex of vertices) {
    if (vertex.id === exclude) continue;
    const at = project(vertex.point);
    const distance = Math.hypot(at.x - pixel.x, at.y - pixel.y);
    if (distance <= radiusPx && distance <= bestDistance) {
      best = vertex;
      bestDistance = distance;
    }
  }
  return best;
}
