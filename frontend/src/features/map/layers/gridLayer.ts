import type { Feature, FeatureCollection, LineString, Point } from "geojson";

import { gridLabelName } from "./gridLabels";
import type { MapLayerDefinition } from "./types";

export const GRID_LAYER_ID = "distance-grid";

/** [west, south, east, north] of what the map shows. */
export type ViewBounds = [number, number, number, number];

/** What the editor hands the grid layer through `MapLayerContext.ui`: the current viewport. */
export interface GridUi {
  bounds: ViewBounds;
}

/** Line spacings in metres; the smallest that leaves a readable number of lines is used. */
const STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
/** At most this many lines across the longer side of the view. */
const MAX_LINES = 12;
/** At most this many numbers along an edge; the rest of the lines stay unlabelled. */
const MAX_LABELS = 6;
/** Lines run this far past the view (as a share of it) so a pan does not show bare map. */
const OVERSCAN = 0.25;

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Metres in one degree of latitude / longitude at `lat` (WGS84 series). */
export function metresPerDegree(lat: number): { lat: number; lng: number } {
  const phi = rad(lat);
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi),
    lng: 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi),
  };
}

/** The grid spacing for a view `spanMetres` across its longer side, or null when it is too wide. */
export function pickGridStep(spanMetres: number): number | null {
  return STEPS.find((step) => spanMetres / step <= MAX_LINES) ?? null;
}

/** The spacing the grid has for this view, counted from `origin` (lng, lat). */
export function gridStepFor(bounds: ViewBounds, origin: readonly [number, number]): number | null {
  const per = metresPerDegree(origin[1]);
  return pickGridStep(
    Math.max((bounds[2] - bounds[0]) * per.lng, (bounds[3] - bounds[1]) * per.lat),
  );
}

/** "5 m", "−25 m", "1.5 km": a distance from the grid's origin. */
export function formatGridDistance(metres: number): string {
  const sign = metres < 0 ? "−" : "";
  const value = Math.abs(metres);
  return value >= 1000
    ? `${sign}${Number((value / 1000).toFixed(2))} km`
    : `${sign}${Math.round(value)} m`;
}

type LabelFeature = Feature<Point, { label: string; anchor: "top" | "left" }>;

export interface Grid {
  /** Spacing in metres, or null when the view is too wide for a useful grid. */
  step: number | null;
  lines: FeatureCollection<LineString>;
  labels: FeatureCollection<Point, { label: string; anchor: "top" | "left" }>;
}

const NONE: Grid = {
  step: null,
  lines: { type: "FeatureCollection", features: [] },
  labels: { type: "FeatureCollection", features: [] },
};

const line = (a: [number, number], b: [number, number]): Feature<LineString> => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [a, b] },
});

const label = (at: [number, number], metres: number, anchor: "top" | "left"): LabelFeature => ({
  type: "Feature",
  properties: { label: formatGridDistance(metres), anchor },
  geometry: { type: "Point", coordinates: at },
});

/**
 * A north-aligned metric grid for one view, counted in metres from `origin` (the plot's
 * south-west corner), so a number on the grid is a distance from the plot. Lines are meridians
 * and parallels spaced with the local metres-per-degree, which is exact enough across a plot and
 * stays square on screen. Pure: the same view gives the same grid.
 */
export function buildGrid(bounds: ViewBounds, origin: readonly [number, number]): Grid {
  const [west, south, east, north] = bounds;
  const step = gridStepFor(bounds, origin);
  if (step === null || !(east > west) || !(north > south)) return NONE;

  const per = metresPerDegree(origin[1]);
  const width = east - west;
  const height = north - south;
  const lngAt = (k: number) => origin[0] + (k * step) / per.lng;
  const latAt = (k: number) => origin[1] + (k * step) / per.lat;
  /** The line numbers (k) of lines between `lo` and `hi` degrees. */
  const range = (lo: number, hi: number, from: number, perDegree: number) => ({
    first: Math.ceil(((lo - from) * perDegree) / step),
    last: Math.floor(((hi - from) * perDegree) / step),
  });

  const left = west - width * OVERSCAN;
  const right = east + width * OVERSCAN;
  const bottom = south - height * OVERSCAN;
  const top = north + height * OVERSCAN;
  const lines: Feature<LineString>[] = [];
  const wide = range(left, right, origin[0], per.lng);
  for (let k = wide.first; k <= wide.last; k++)
    lines.push(line([lngAt(k), bottom], [lngAt(k), top]));
  const tall = range(bottom, top, origin[1], per.lat);
  for (let k = tall.first; k <= tall.last; k++)
    lines.push(line([left, latAt(k)], [right, latAt(k)]));

  const labels: LabelFeature[] = [];
  const shownX = range(west, east, origin[0], per.lng);
  const everyX = Math.max(1, Math.ceil((shownX.last - shownX.first + 1) / MAX_LABELS));
  for (let k = shownX.first; k <= shownX.last; k++) {
    if (k % everyX === 0) labels.push(label([lngAt(k), north - height * 0.03], k * step, "top"));
  }
  const shownY = range(south, north, origin[1], per.lat);
  const everyY = Math.max(1, Math.ceil((shownY.last - shownY.first + 1) / MAX_LABELS));
  for (let k = shownY.first; k <= shownY.last; k++) {
    if (k % everyY === 0) labels.push(label([west + width * 0.01, latAt(k)], k * step, "left"));
  }
  return {
    step,
    lines: { type: "FeatureCollection", features: lines },
    labels: { type: "FeatureCollection", features: labels },
  };
}

/**
 * An optional metric grid over the map, a visual aid only (never saved). It draws nothing until
 * the editor hands it the viewport; the grid is rebuilt for that view, so it stays light.
 */
export const gridLayer: MapLayerDefinition = {
  id: GRID_LAYER_ID,
  label: "Distance grid",
  toggleable: false,
  defaultVisible: true,
  build({ site, ui }) {
    const view = ui?.[GRID_LAYER_ID] as GridUi | undefined;
    if (!view) return null;
    const grid = buildGrid(view.bounds, [site.bbox[0], site.bbox[1]]);
    return {
      sources: {
        [GRID_LAYER_ID]: { type: "geojson", data: grid.lines },
        [`${GRID_LAYER_ID}-labels`]: { type: "geojson", data: grid.labels },
      },
      layers: [
        {
          id: `${GRID_LAYER_ID}-lines`,
          type: "line",
          source: GRID_LAYER_ID,
          paint: { "line-color": "#ffffff", "line-opacity": 0.45, "line-width": 1 },
        },
        {
          id: `${GRID_LAYER_ID}-labels`,
          type: "symbol",
          source: `${GRID_LAYER_ID}-labels`,
          layout: {
            "icon-image": ["concat", gridLabelName(""), ["get", "label"]],
            "icon-anchor": ["get", "anchor"],
            "icon-allow-overlap": false,
          },
        },
      ],
    };
  },
};
