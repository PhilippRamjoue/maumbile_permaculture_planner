import area from "@turf/area";
import length from "@turf/length";
import type { DesignGeometry } from "../../entities/planning";

export interface Measurement {
  length_m: number;
  area_m2: number;
}
export function measureGeometry(geometry: DesignGeometry): Measurement {
  try {
    if (geometry.type === "Point") return { length_m: 0, area_m2: 0 };
    if (geometry.type === "LineString")
      return {
        length_m: length({ type: "Feature", properties: {}, geometry }, { units: "meters" }),
        area_m2: 0,
      };
    return {
      length_m: geometry.coordinates.reduce(
        (sum, ring) =>
          sum +
          length(
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: ring },
            },
            { units: "meters" },
          ),
        0,
      ),
      area_m2: area(geometry),
    };
  } catch {
    return { length_m: 0, area_m2: 0 }; // incomplete live drawing
  }
}

/** How big a shape is, as people say it: "4.2 × 1.2 m". The longer side comes first. */
export interface Size {
  long_m: number;
  short_m: number;
}

type XY = [number, number];

const cross = (o: XY, a: XY, b: XY) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Andrew's monotone chain: the convex hull, counter-clockwise, without a repeated first point. */
function convexHull(points: XY[]): XY[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const half = (input: XY[]) => {
    const hull: XY[] = [];
    for (const p of input) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
        hull.pop();
      }
      hull.push(p);
    }
    hull.pop();
    return hull;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/**
 * The size of a polygon's smallest enclosing rectangle, which follows the shape when it is turned
 * (a bed rotated to the slope still reads "4.2 × 1.2 m", not its north-aligned bounding box).
 * Metres come from a local flat projection around the shape, which is exact enough for a plot.
 * Null for anything but a polygon, or an empty or degenerate one.
 */
export function orientedSize(geometry: DesignGeometry): Size | null {
  if (geometry.type !== "Polygon") return null;
  const ring = geometry.coordinates[0];
  if (!ring || ring.length < 4) return null;
  const lat0 = ring.reduce((sum, c) => sum + c[1], 0) / ring.length;
  const lng0 = ring[0][0];
  const metresPerLat = 111_132;
  const metresPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const hull = convexHull(
    ring.map((c): XY => [(c[0] - lng0) * metresPerLng, (c[1] - lat0) * metresPerLat]),
  );
  if (hull.length < 3) return null;

  let best: Size | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length === 0) continue;
    const [ux, uy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of hull) {
      const u = (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
      const v = -(p[0] - a[0]) * uy + (p[1] - a[1]) * ux;
      [minU, maxU, minV, maxV] = [
        Math.min(minU, u),
        Math.max(maxU, u),
        Math.min(minV, v),
        Math.max(maxV, v),
      ];
    }
    const [w, h] = [maxU - minU, maxV - minV];
    if (w * h < bestArea) {
      bestArea = w * h;
      best = { long_m: Math.max(w, h), short_m: Math.min(w, h) };
    }
  }
  return best && best.short_m > 0 ? best : null;
}

/** "4.2 × 1.2 m" (or "1.2 × 0.4 km"): both sides in the unit that suits the longer one. */
export function formatSize(size: Size): string {
  if (size.long_m >= 1000) {
    const km = (metres: number) => Number((metres / 1000).toFixed(2));
    return `${km(size.long_m)} × ${km(size.short_m)} km`;
  }
  const digits = size.long_m < 100 ? 1 : 0;
  return `${size.long_m.toFixed(digits)} × ${size.short_m.toFixed(digits)} m`;
}
