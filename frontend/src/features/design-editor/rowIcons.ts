import type { LineString, Position } from "geojson";

import { glyphFor } from "./icons";
import { measureGeometry } from "./measure";

/**
 * A row of icons along a line: one line feature drawn as evenly spaced trees (a windbreak, a hedge,
 * a "brush" of planting). The line stores `properties.row_icon` (a glyph key) and
 * `properties.row_spacing_m`; the icons themselves are never saved but placed at render time, at
 * fixed ground distances, so they hold their positions at every zoom.
 */
export interface Row {
  icon: string;
  spacing_m: number;
}

/** Sane spacing, in metres: a tight hedge up to widely set trees. */
const MIN_ROW_SPACING_M = 0.5;
const MAX_ROW_SPACING_M = 100;
/** More icons than this on one line are spaced further apart rather than drawn. */
export const MAX_ROW_ICONS = 1500;

/** The glyphs offered for a row, in the order of the picker. */
export const ROW_ICONS = ["tree", "trees", "shrub", "sprout"] as const;

/** The problem with a typed spacing, in the words shown beside the field; null when it is fine. */
export function rowSpacingProblem(metres: number): string | null {
  if (!Number.isFinite(metres)) return "Enter a number.";
  if (metres < MIN_ROW_SPACING_M || metres > MAX_ROW_SPACING_M)
    return `Use a spacing between ${MIN_ROW_SPACING_M} m and ${MAX_ROW_SPACING_M} m.`;
  return null;
}

/** The row recorded in a feature's properties (or a palette style), if it is complete and usable. */
export function rowOf(properties: Record<string, unknown>): Row | null {
  const { row_icon: icon, row_spacing_m: spacing } = properties;
  if (typeof icon !== "string" || !glyphFor(icon)) return null;
  if (typeof spacing !== "number" || rowSpacingProblem(spacing) !== null) return null;
  return { icon, spacing_m: spacing };
}

const metresBetween = (a: Position, b: Position) =>
  measureGeometry({ type: "LineString", coordinates: [a, b] }).length_m;

/**
 * Where the icons of a row go: the start of the line, then every `spacingM` metres along it, as
 * far as the line goes. A line with too many icons for its length is spaced out to fit.
 */
export function rowPoints(line: LineString, spacingM: number): Position[] {
  const lengths = line.coordinates
    .slice(1)
    .map((end, i) => metresBetween(line.coordinates[i]!, end));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!(total > 0) || !(spacingM > 0)) return [];
  const step = Math.max(spacingM, total / MAX_ROW_ICONS);
  const points: Position[] = [];
  let segment = 0;
  let before = 0; // metres from the start to the start of `segment`
  // A millimetre of tolerance, so an icon on the very end of a line that is an exact multiple stays.
  for (let at = 0; at <= total + 1e-3; at += step) {
    while (segment < lengths.length - 1 && at > before + lengths[segment]!) {
      before += lengths[segment]!;
      segment += 1;
    }
    const [a, b] = [line.coordinates[segment]!, line.coordinates[segment + 1]!];
    const t =
      lengths[segment]! > 0 ? Math.min(1, Math.max(0, (at - before) / lengths[segment]!)) : 0;
    points.push([a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t]);
  }
  return points;
}
