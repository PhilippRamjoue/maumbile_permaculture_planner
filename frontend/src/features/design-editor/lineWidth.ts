import type { ExpressionSpecification } from "maplibre-gl";

/** Sane bounds for a path or road, in metres: a trodden track up to a wide carriageway. */
const MIN_WIDTH_M = 0.1;
const MAX_WIDTH_M = 100;

/** The width recorded on a feature, in metres, if it has a usable one. */
export function widthMOf(properties: Record<string, unknown>): number | null {
  const width = properties.width_m;
  return typeof width === "number" && width >= MIN_WIDTH_M && width <= MAX_WIDTH_M ? width : null;
}

/** The problem with a typed width, in the words shown beside the field; null when it is fine. */
export function widthProblem(metres: number): string | null {
  if (!Number.isFinite(metres)) return "Enter a number.";
  if (metres < MIN_WIDTH_M || metres > MAX_WIDTH_M)
    return `Use a width between ${MIN_WIDTH_M} m and ${MAX_WIDTH_M} m.`;
  return null;
}

/** Equatorial circumference of the web-mercator world, in metres, and its 512 px tile size. */
const WORLD_M = 40_075_016.686;
const TILE_PX = 512;
const MAX_ZOOM = 24;

/** Screen pixels in one metre on the ground at `latitude` and `zoom` (MapLibre's 512 px tiles). */
export const pixelsPerMetre = (latitude: number, zoom: number) =>
  (TILE_PX * 2 ** zoom) / (WORLD_M * Math.cos((latitude * Math.PI) / 180));

/**
 * A `line-width` that draws a line to scale. Pixels per metre double with every zoom level, so an
 * exponential base-2 interpolation between two zooms is exact at every zoom between them. A feature
 * with `_width_m` above zero is that many metres wide, whatever the zoom; any other keeps its
 * pixel `_width`. A selected line is drawn two pixels wider either way.
 */
export function lineWidthExpression(latitude: number): ExpressionSpecification {
  const clamped = Math.max(-85, Math.min(85, latitude));
  const widthAt = (zoom: number): ExpressionSpecification => [
    "+",
    [
      "case",
      [">", ["to-number", ["get", "_width_m"], 0], 0],
      ["*", ["get", "_width_m"], pixelsPerMetre(clamped, zoom)],
      ["get", "_width"],
    ],
    ["case", ["==", ["get", "_selected"], true], 2, 0],
  ];
  return ["interpolate", ["exponential", 2], ["zoom"], 0, widthAt(0), MAX_ZOOM, widthAt(MAX_ZOOM)];
}
