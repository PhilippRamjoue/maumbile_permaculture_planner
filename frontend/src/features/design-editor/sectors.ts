import type { DesignFeature } from "../../entities/planning";

/** Mirrors `SECTOR_KINDS` in backend/app/modules/planning/validation.py. */
export const SECTOR_KINDS = ["sun", "wind", "fire", "view", "water", "wildlife", "noise"] as const;
export type SectorKind = (typeof SECTOR_KINDS)[number];

export const SECTOR_COLORS: Record<SectorKind, string> = {
  sun: "#f59e0b",
  wind: "#3b82c4",
  fire: "#dc2626",
  view: "#7c3aed",
  water: "#0891b2",
  wildlife: "#65a30d",
  noise: "#6b7280",
};

const METERS_PER_DEGREE = 111_320;
const ARC_STEP_DEG = 5;
const rad = (deg: number) => (deg * Math.PI) / 180;
const round = (value: number, places: number) => Number(value.toFixed(places));

/** A compass bearing folded into [0, 360), at 0.1° precision (as stored in the plan). */
export function normalizeBearing(bearing: number): number {
  const folded = round(((bearing % 360) + 360) % 360, 1);
  return folded >= 360 ? 0 : folded;
}

/** Degrees swept clockwise from `from` to `to`; 0 when both bearings are the same. */
export function sectorSpan(from: number, to: number): number {
  return round((normalizeBearing(to) - normalizeBearing(from) + 360) % 360, 1);
}

/** The point `distanceM` metres from `origin` along `bearing` (flat-earth: fine at site scale). */
export function offsetPoint(
  origin: [number, number],
  bearing: number,
  distanceM: number,
): [number, number] {
  const [lng, lat] = origin;
  const north = Math.cos(rad(bearing)) * distanceM;
  const east = Math.sin(rad(bearing)) * distanceM;
  return [
    round(lng + east / (METERS_PER_DEGREE * Math.cos(rad(lat))), 8),
    round(lat + north / METERS_PER_DEGREE, 8),
  ];
}

/**
 * A pie-slice polygon from `origin`, sweeping clockwise from bearing `from` to bearing `to`.
 * Bearings are compass degrees (0 = north, 90 = east); wrapping through north is fine.
 */
export function sectorWedge(
  origin: [number, number],
  from: number,
  to: number,
  radiusM: number,
): GeoJSON.Polygon {
  const start = normalizeBearing(from);
  const span = sectorSpan(from, to);
  const steps = Math.max(1, Math.ceil(span / ARC_STEP_DEG));
  // The tip is rounded like every arc point: the map editor refuses (and so never draws) a
  // selected shape with more decimals than it stores, and a site centroid has many.
  const tip: [number, number] = [round(origin[0], 8), round(origin[1], 8)];
  const ring: [number, number][] = [tip];
  for (let i = 0; i <= steps; i++) {
    ring.push(offsetPoint(origin, start + (span * i) / steps, radiusM));
  }
  ring.push(tip);
  return { type: "Polygon", coordinates: [ring] };
}

export interface SectorSpec {
  kind: SectorKind;
  from: number;
  to: number;
  origin: [number, number];
  radiusM: number;
}

/** Validation message for a sector request, or `null` when it can be drawn. */
export function sectorProblem(spec: Pick<SectorSpec, "from" | "to" | "radiusM">): string | null {
  if (![spec.from, spec.to, spec.radiusM].every(Number.isFinite)) return "Enter numeric values.";
  if (spec.radiusM < 5 || spec.radiusM > 100_000) return "Radius must be between 5 m and 100 km.";
  if (sectorSpan(spec.from, spec.to) === 0) return "The two bearings must differ.";
  return null;
}

export const kindLabel = (kind: SectorKind) => kind[0].toUpperCase() + kind.slice(1);

const autoName = (kind: SectorKind, from: number, to: number) =>
  `${kindLabel(kind)} ${from}°–${to}°`;

/** The kind of a sector feature; hand-drawn or old sectors without one count as wind. */
export function sectorKindOf(feature: Pick<DesignFeature, "properties">): SectorKind {
  const kind = feature.properties.sector_kind;
  return SECTOR_KINDS.find((k) => k === kind) ?? "wind";
}

/** "Wind · 100° → 45° (305° wide)": what a sector is, in one line for the overview list. */
export function sectorSummary(feature: DesignFeature): string {
  const { bearing_from: from, bearing_to: to } = feature.properties;
  const kind = kindLabel(sectorKindOf(feature));
  if (typeof from !== "number" || typeof to !== "number") return kind;
  return `${kind} · ${from}° → ${to}° (${sectorSpan(from, to)}° wide)`;
}

/**
 * Keeps a sector's generated name ("Sun 315°–45°") and colour in step with its kind and bearings
 * when those are edited. A name or colour the user chose themselves is left alone.
 */
export function syncSectorLook(before: DesignFeature, after: DesignFeature): DesignFeature {
  const properties = { ...after.properties };
  const wasKind = sectorKindOf(before);
  const kind = sectorKindOf(after);
  if (properties.color === SECTOR_COLORS[wasKind]) properties.color = SECTOR_COLORS[kind];
  const { bearing_from: from, bearing_to: to } = before.properties;
  if (
    typeof from === "number" &&
    typeof to === "number" &&
    typeof properties.bearing_from === "number" &&
    typeof properties.bearing_to === "number" &&
    properties.name === autoName(wasKind, from, to)
  ) {
    properties.name = autoName(kind, properties.bearing_from, properties.bearing_to);
  }
  return { ...after, properties };
}

/** A persistable `sector` feature: the wedge plus the bearings it was drawn from. */
export function sectorFeature(spec: SectorSpec, id: string, layerId: string): DesignFeature {
  const from = normalizeBearing(spec.from);
  const to = normalizeBearing(spec.to);
  return {
    type: "Feature",
    id,
    layer_id: layerId,
    feature_type: "sector",
    element_type_id: null,
    geometry: sectorWedge(spec.origin, from, to, spec.radiusM),
    properties: {
      name: autoName(spec.kind, from, to),
      style: {},
      color: SECTOR_COLORS[spec.kind],
      sector_kind: spec.kind,
      bearing_from: from,
      bearing_to: to,
      // Lets later bearing edits redraw the wedge; absent on hand-drawn sectors.
      origin: spec.origin,
      radius_m: spec.radiusM,
    },
  };
}

/**
 * Redraws a helper-made sector after its bearings were edited. Hand-drawn sectors (no origin and
 * radius) keep their polygon, since their bearings only describe it.
 */
export function redrawSector(feature: DesignFeature): DesignFeature {
  const { origin, radius_m, bearing_from, bearing_to } = feature.properties;
  const valid =
    Array.isArray(origin) &&
    origin.length === 2 &&
    origin.every((n) => typeof n === "number") &&
    typeof radius_m === "number" &&
    typeof bearing_from === "number" &&
    typeof bearing_to === "number" &&
    sectorSpan(bearing_from, bearing_to) > 0;
  if (!valid) return feature;
  return {
    ...feature,
    geometry: sectorWedge(origin as [number, number], bearing_from, bearing_to, radius_m),
  };
}

/** Day of year (1 = 1 Jan) of a `YYYY-MM-DD` date, or `null` when it is not a real date. */
export function dayOfYear(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.round((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
}

export interface SunPath {
  /** Azimuth (° clockwise from north) of sunrise and sunset. */
  sunrise: number;
  sunset: number;
  /** Sector bearings that cover the sun's daytime arc (sweeping clockwise from → to). */
  from: number;
  to: number;
}

/**
 * Sunrise/sunset azimuths for a latitude and day, from the solar declination (Cooper's formula,
 * no refraction or elevation) — about a degree accurate, ample for placing a sector.
 * Returns `null` during polar day/night, when the sun neither rises nor sets.
 */
export function sunPath(latitude: number, day: number): SunPath | null {
  const declination = -23.44 * Math.cos(rad((360 / 365) * (day + 10)));
  const ratio = Math.sin(rad(declination)) / Math.cos(rad(latitude));
  if (!Number.isFinite(ratio) || Math.abs(ratio) > 1) return null;
  const sunrise = normalizeBearing((Math.acos(ratio) * 180) / Math.PI);
  const sunset = normalizeBearing(360 - sunrise);
  // At noon the sun stands north of an observer who is nearer the equator than the declination.
  const throughNorth = latitude < declination;
  return throughNorth
    ? { sunrise, sunset, from: sunset, to: sunrise }
    : { sunrise, sunset, from: sunrise, to: sunset };
}

/** A sun sector covering the sun's path across the sky on `date`, or `null` in polar day/night. */
export function sunPathFeature(
  origin: [number, number],
  radiusM: number,
  layerId: string,
  id: string,
  date: Date,
): DesignFeature | null {
  const day = dayOfYear(
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  );
  const path = day === null ? null : sunPath(origin[1], day);
  if (!path) return null;
  return sectorFeature({ kind: "sun", from: path.from, to: path.to, origin, radiusM }, id, layerId);
}

/** Default wedge radius for a site: half its longer side, rounded to 10 m (at least 20 m). */
export function defaultSectorRadius(bbox: [number, number, number, number]): number {
  const [west, south, east, north] = bbox;
  const midLat = (south + north) / 2;
  const width = (east - west) * METERS_PER_DEGREE * Math.cos(rad(midLat));
  const height = (north - south) * METERS_PER_DEGREE;
  return Math.max(20, Math.round(Math.max(width, height) / 2 / 10) * 10);
}
