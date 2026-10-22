import type { LngLat } from "../geometry";
import type { Pixel } from "./vertexHit";

/** A boundary smaller than this share of the map's shorter side counts as a speck, not framed. */
const MIN_FILL = 0.15;

/**
 * Whether the corners are already comfortably on screen: all inside the view, and big enough to
 * work with. Changes that arrive from outside the map (typing, pasting, undo) re-frame only when
 * this is false, so a map the user has positioned is not yanked around by every edit.
 */
export function isComfortablyFramed(
  points: readonly LngLat[],
  project: (point: LngLat) => Pixel,
  size: { width: number; height: number },
): boolean {
  if (points.length === 0) return true;
  const px = points.map(project);
  const xs = px.map((p) => p.x);
  const ys = px.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (minX < 0 || minY < 0 || maxX > size.width || maxY > size.height) return false;
  return Math.max(maxX - minX, maxY - minY) >= MIN_FILL * Math.min(size.width, size.height);
}
