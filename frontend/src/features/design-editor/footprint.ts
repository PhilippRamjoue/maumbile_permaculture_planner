import type { Polygon, Position } from "geojson";

import type { DesignFeature, ElementType } from "../../entities/planning";
import { offsetPoint } from "./sectors";

/**
 * A to-scale footprint: the real-world size of a placed element. It is stored on the feature as
 * `properties.footprint` next to its polygon, which is always drawn from it (a circle of the
 * diameter, or a width x length rectangle, in true metres) and keeps its centre when resized. The
 * centre is the middle of the polygon's bounding box, so moving the shape on the map needs no
 * bookkeeping.
 */
export type Footprint =
  | { shape: "round"; diameter_m: number }
  | {
      shape: "rect";
      /** East-west extent before rotation. */
      width_m: number;
      /** North-south extent before rotation. */
      length_m: number;
      /** Degrees clockwise from north-aligned. */
      rotation_deg: number;
    };

/** Sane bounds, in metres: a bean up to a small field. */
export const MIN_SIZE_M = 0.1;
export const MAX_SIZE_M = 1000;

/** Points on a circle: smooth at any zoom a plot is viewed at, yet cheap to draw. */
const CIRCLE_POINTS = 32;
const round = (value: number, places: number) => Number(value.toFixed(places));

/** The footprint a palette entry drops with one click, or null for points, lines and free areas. */
type FootprintSource = Pick<
  ElementType,
  "shape" | "default_diameter_m" | "default_width_m" | "default_length_m"
>;

export function defaultFootprint(type: FootprintSource | null | undefined): Footprint | null {
  if (!type) return null;
  if (type.shape === "round" && type.default_diameter_m) {
    return { shape: "round", diameter_m: type.default_diameter_m };
  }
  if (type.shape === "rect" && type.default_width_m && type.default_length_m) {
    return {
      shape: "rect",
      width_m: type.default_width_m,
      length_m: type.default_length_m,
      rotation_deg: 0,
    };
  }
  return null;
}

/** How the map should collect a palette entry: one click (point), a drawn line, or a drawn area. */
export type PlacementMode = "point" | "linestring" | "rectangle";

export function placementMode(
  type: Pick<ElementType, "shape" | "geometry_type"> | undefined,
): PlacementMode {
  if (!type) return "point";
  if (type.shape === "round" || type.shape === "rect" || type.shape === "point") return "point";
  if (type.shape === "line") return "linestring";
  if (type.shape === "area") return "rectangle";
  // An entry without a shape (older data): fall back to its geometry.
  return type.geometry_type === "line"
    ? "linestring"
    : type.geometry_type === "polygon"
      ? "rectangle"
      : "point";
}

/** The problem with a dimension, in the words shown beside the field; null when it is fine. */
export function sizeProblem(metres: number): string | null {
  if (!Number.isFinite(metres)) return "Enter a number.";
  if (metres < MIN_SIZE_M || metres > MAX_SIZE_M)
    return `Use a size between ${MIN_SIZE_M} m and ${MAX_SIZE_M} m.`;
  return null;
}

const positive = (value: unknown): value is number => typeof value === "number" && value > 0;

/** The footprint recorded on a feature, if it has one and still draws as a polygon. */
export function footprintOf(
  feature: Pick<DesignFeature, "geometry" | "properties">,
): Footprint | null {
  const raw = feature.properties.footprint;
  if (feature.geometry.type !== "Polygon" || typeof raw !== "object" || raw === null) return null;
  const fp = raw as Record<string, unknown>;
  if (fp.shape === "round" && positive(fp.diameter_m)) {
    return { shape: "round", diameter_m: fp.diameter_m };
  }
  if (fp.shape === "rect" && positive(fp.width_m) && positive(fp.length_m)) {
    return {
      shape: "rect",
      width_m: fp.width_m,
      length_m: fp.length_m,
      rotation_deg: typeof fp.rotation_deg === "number" ? fp.rotation_deg : 0,
    };
  }
  return null;
}

/** The middle of a polygon's bounding box. */
export function centerOf(geometry: Polygon): [number, number] {
  const points = geometry.coordinates.flat();
  const lngs = points.map((p) => p[0]!);
  const lats = points.map((p) => p[1]!);
  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}

/** The point `east` and `north` metres from `origin`. */
function shifted(origin: [number, number], east: number, north: number): [number, number] {
  return offsetPoint(origin, (Math.atan2(east, north) * 180) / Math.PI, Math.hypot(east, north));
}

export const normalizeDegrees = (degrees: number) => round(((degrees % 360) + 360) % 360, 2);

/**
 * The polygon of a footprint centred on `center`: a circle of the diameter, or the rectangle
 * (south-west corner first, then clockwise) turned `rotation_deg` clockwise about the centre.
 */
export function footprintPolygon(center: [number, number], footprint: Footprint): Polygon {
  let ring: Position[];
  if (footprint.shape === "round") {
    const radius = footprint.diameter_m / 2;
    ring = Array.from({ length: CIRCLE_POINTS }, (_, i) =>
      offsetPoint(center, (360 * i) / CIRCLE_POINTS, radius),
    );
  } else {
    const [halfW, halfL] = [footprint.width_m / 2, footprint.length_m / 2];
    const turn = (footprint.rotation_deg * Math.PI) / 180;
    const [sin, cos] = [Math.sin(turn), Math.cos(turn)];
    ring = (
      [
        [-halfW, -halfL],
        [halfW, -halfL],
        [halfW, halfL],
        [-halfW, halfL],
      ] as const
    ).map(([x, y]) => shifted(center, x * cos + y * sin, y * cos - x * sin));
  }
  return { type: "Polygon", coordinates: [[...ring, ring[0]!]] };
}

/** The footprint redrawn around the same centre, as the feature to save. */
export function withFootprint(feature: DesignFeature, footprint: Footprint): DesignFeature {
  const center = centerOf(
    feature.geometry.type === "Polygon" ? feature.geometry : footprintPolygon([0, 0], footprint),
  );
  return {
    ...feature,
    geometry: footprintPolygon(center, footprint),
    properties: { ...feature.properties, footprint },
  };
}

/**
 * The clockwise turn of a rectangle drawn by `footprintPolygon`, read back from its first edge
 * (which runs due east before any rotation). Used after the map has rotated the shape, so the
 * rotation field always matches what is drawn.
 */
export function rotationOf(geometry: Polygon): number {
  const [a, b] = geometry.coordinates[0] ?? [];
  if (!a || !b) return 0;
  const east = (b[0]! - a[0]!) * Math.cos((a[1]! * Math.PI) / 180);
  const north = b[1]! - a[1]!;
  // To a tenth of a degree: the map turns shapes in web mercator, which is a hair off true metres.
  return normalizeDegrees(Math.round(((Math.atan2(east, north) * 180) / Math.PI - 90) * 10) / 10);
}

/** A feature the map has just moved or turned: its rectangle footprint's rotation follows. */
export function syncRotation(feature: DesignFeature): DesignFeature {
  const footprint = footprintOf(feature);
  if (footprint?.shape !== "rect" || feature.geometry.type !== "Polygon") return feature;
  return {
    ...feature,
    properties: {
      ...feature.properties,
      footprint: { ...footprint, rotation_deg: rotationOf(feature.geometry) },
    },
  };
}

/** A new feature's polygon for `footprint` with its centre at `click`. */
export const placeFootprint = (click: Position, footprint: Footprint): Polygon =>
  footprintPolygon([click[0]!, click[1]!], footprint);

/** "Ø 2 m" or "1.2 × 4 m": the exact size as typed, for a one-line readout. */
export function footprintLabel(footprint: Footprint): string {
  const m = (value: number) => `${round(value, 2)}`;
  return footprint.shape === "round"
    ? `Ø ${m(footprint.diameter_m)} m`
    : `${m(footprint.width_m)} × ${m(footprint.length_m)} m`;
}
