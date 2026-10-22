/** Pure boundary maths for the site-setup flow (no React, no MapLibre). Coordinates are [lng, lat]. */
import type { BBox } from "../../entities/site";

export type LngLat = [number, number];
export type CoordinateOrder = "lat-lng" | "lng-lat";

/** What the user typed for one corner; strings so half-typed numbers survive editing. */
export interface CoordinateCell {
  lat: string;
  lng: string;
}

/** Parse a typed number (accepts a decimal comma); `null` when it isn't one. */
export function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Why a typed latitude/longitude can't be used, or `null` when it is fine. */
export function cellError(cell: CoordinateCell): string | null {
  const lat = parseNumber(cell.lat);
  const lng = parseNumber(cell.lng);
  if (lat === null || lng === null) return "Enter both latitude and longitude as numbers.";
  if (lat < -90 || lat > 90) {
    return Math.abs(lng) <= 90 && Math.abs(lat) <= 180
      ? "Latitude must be between -90 and 90. Are latitude and longitude swapped?"
      : "Latitude must be between -90 and 90.";
  }
  if (lng < -180 || lng > 180) return "Longitude must be between -180 and 180.";
  return null;
}

export function cellToPoint(cell: CoordinateCell): LngLat | null {
  if (cellError(cell)) return null;
  return [parseNumber(cell.lng)!, parseNumber(cell.lat)!];
}

/**
 * ~1 mm precision (8 decimals, like the editor), without trailing zeros. MapLibre's deepest zoom
 * is ≈2 cm per pixel, so a corner placed or dragged on the map never visibly shifts (< 0.1 px)
 * when it is stored as text and read back.
 */
export function roundCoord(value: number): string {
  return String(Number(value.toFixed(8)));
}

/** Web-Mercator's latitude limit; the map cannot show (or click) anything beyond it. */
export const MAX_MERCATOR_LAT = 85.0511287798;

/**
 * A map position as a valid [lng, lat]. MapLibre does not wrap longitude: after panning across
 * the antimeridian a click can be at lng 190, which the API rejects. Wraps it back into ±180.
 */
export function normalizeLngLat([lng, lat]: LngLat): LngLat {
  const wrapped = lng < -180 || lng > 180 ? ((((lng + 180) % 360) + 360) % 360) - 180 : lng;
  return [wrapped, Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat))];
}

export function pointToCell([lng, lat]: LngLat): CoordinateCell {
  return { lat: roundCoord(lat), lng: roundCoord(lng) };
}

export interface ParsedLine {
  line: number;
  message: string;
}

/**
 * Turns pasted text into points. One corner per line, two numbers separated by comma, semicolon,
 * tab or spaces (e.g. a Google Maps "-1.2921, 36.8219" copy). `order` says which number comes first.
 */
export function parseCoordinateText(
  text: string,
  order: CoordinateOrder,
): { points: LngLat[]; errors: ParsedLine[] } {
  const points: LngLat[] = [];
  const errors: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/[()[\]]/g, " ").trim();
    if (line === "") return;
    const tokens = line.split(/[\s,;]+/).filter(Boolean);
    const numbers = tokens.map((t) => parseNumber(t));
    if (tokens.length !== 2 || numbers.some((n) => n === null)) {
      errors.push({ line: index + 1, message: `Line ${index + 1}: expected two numbers.` });
      return;
    }
    const [first, second] = numbers as [number, number];
    const cell: CoordinateCell =
      order === "lat-lng"
        ? { lat: String(first), lng: String(second) }
        : { lat: String(second), lng: String(first) };
    const problem = cellError(cell);
    if (problem) {
      errors.push({ line: index + 1, message: `Line ${index + 1}: ${problem}` });
      return;
    }
    points.push(cellToPoint(cell)!);
  });
  return { points, errors };
}

export function bboxOf(points: LngLat[]): BBox | null {
  if (points.length === 0) return null;
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

function samePoint(a: LngLat, b: LngLat): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** The ring without its closing vertex (a ring whose last point repeats the first is "closed"). */
export function openRing(points: LngLat[]): LngLat[] {
  return points.length > 1 && samePoint(points[0], points[points.length - 1])
    ? points.slice(0, -1)
    : points;
}

/** Explicitly closed ring, as the API expects it. */
export function closeRing(points: LngLat[]): LngLat[] {
  const ring = openRing(points);
  return ring.length === 0 ? [] : [...ring, ring[0]];
}

function orientation(a: LngLat, b: LngLat, c: LngLat): number {
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.sign(cross);
}

function onSegment(a: LngLat, b: LngLat, p: LngLat): boolean {
  return (
    Math.min(a[0], b[0]) <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] &&
    p[1] <= Math.max(a[1], b[1])
  );
}

/** Whether segments p1p2 and p3p4 cross or touch. */
export function segmentsIntersect(p1: LngLat, p2: LngLat, p3: LngLat, p4: LngLat): boolean {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && onSegment(p1, p2, p3)) ||
    (o2 === 0 && onSegment(p1, p2, p4)) ||
    (o3 === 0 && onSegment(p3, p4, p1)) ||
    (o4 === 0 && onSegment(p3, p4, p2))
  );
}

/** Whether any two non-neighbouring edges of the (open) ring cross or touch. */
export function hasSelfIntersection(ring: LngLat[]): boolean {
  const n = ring.length;
  if (n < 4) return false; // a triangle cannot cross itself
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsIntersect(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Planar area estimate in m² (local equirectangular projection; fine at plot scale). */
export function ringAreaM2(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  const lng0 = ring[0][0];
  const mPerDegLat = 110_574;
  const mPerDegLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const xy = ring.map((p) => [(p[0] - lng0) * mPerDegLng, (p[1] - lat0) * mPerDegLat]);
  let twice = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

export const MIN_RING_POINTS = 3;

export type RingStatus = "empty" | "incomplete" | "invalid" | "valid";

export interface RingValidation {
  status: RingStatus;
  /** Human-readable problems (invalid) or what is still missing (incomplete). */
  messages: string[];
  /** The ring without a repeated closing vertex. */
  ring: LngLat[];
  /** Estimated area; only meaningful when valid. */
  areaM2: number;
}

/** Validates a boundary as the backend will: ≥3 distinct corners, closable, not self-crossing. */
export function validateRing(points: LngLat[]): RingValidation {
  const ring = openRing(points);
  if (ring.length === 0) {
    return {
      status: "empty",
      messages: ["Add the corners of your land to see its outline."],
      ring,
      areaM2: 0,
    };
  }

  if (ring.length < MIN_RING_POINTS) {
    const missing = MIN_RING_POINTS - ring.length;
    return {
      status: "incomplete",
      messages: [
        `Add at least ${MIN_RING_POINTS} corner points (4 is typical): ${missing} more needed.`,
      ],
      ring,
      areaM2: 0,
    };
  }

  const messages: string[] = [];
  const repeated = ring.some((p, i) => samePoint(p, ring[(i + 1) % ring.length]));
  if (repeated) messages.push("Two neighbouring points are identical. Remove the duplicate.");
  else if (hasSelfIntersection(ring)) {
    messages.push(
      "The boundary crosses itself. Put the points in order around the edge of the land.",
    );
  }

  const areaM2 = ringAreaM2(ring);
  if (messages.length === 0 && areaM2 < 1) {
    messages.push("These points lie on a line, so they don't enclose any land.");
  }

  return { status: messages.length ? "invalid" : "valid", messages, ring, areaM2 };
}
