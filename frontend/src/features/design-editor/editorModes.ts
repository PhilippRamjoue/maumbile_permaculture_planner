import type { Geometry, Polygon, Position } from "geojson";
import {
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
  type SnapToCustom,
} from "terra-draw";

import type { DesignFeature } from "../../entities/planning";
import { footprintOf } from "./footprint";
import type { EditorDocument } from "./store";

/**
 * Pointer reach in CSS pixels. Terra Draw's default is 40 px for every mode, which is far too
 * coarse for corner work: on a small plot at low zoom the whole polygon is inside it, so grabbing
 * one vertex grabs its neighbour, and a second corner placed near the first closes the polygon.
 */
const SELECT_REACH_PX = 24;
const DRAW_REACH_PX = 20;
/** A corner being placed or dragged jumps onto another feature's corner this close to it. */
export const SNAP_REACH_PX = 12;

/** Decimal places the map editor stores; it rejects a shape with more (see `coordinatePrecision`). */
export const COORDINATE_PRECISION = 8;

const roundPosition = (position: Position): Position =>
  position.map((n) => Number(n.toFixed(COORDINATE_PRECISION)));

/**
 * The geometry with every coordinate rounded to the editor's precision (about a millimetre).
 * Shapes made elsewhere — a wedge from an older save, an imported file — may carry more decimals,
 * and the editor would refuse to select them, leaving them invisible while selected.
 */
export function roundGeometry<G extends Geometry>(geometry: G): G {
  switch (geometry.type) {
    case "Point":
      return { ...geometry, coordinates: roundPosition(geometry.coordinates) };
    case "LineString":
      return { ...geometry, coordinates: geometry.coordinates.map(roundPosition) };
    case "Polygon":
      return { ...geometry, coordinates: geometry.coordinates.map((r) => r.map(roundPosition)) };
    default:
      return geometry;
  }
}

/** Every vertex of a geometry. */
export function verticesOf(geometry: Geometry): Position[] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates];
    case "LineString":
      return geometry.coordinates;
    case "Polygon":
      return geometry.coordinates.flat();
    default:
      return [];
  }
}

/**
 * The corners a new or dragged corner may snap onto: the vertices of every feature on a visible
 * layer, plus the site boundary — except the feature being edited, whose old corners would pull
 * its own dragged corner back. `isShown` leaves out features a focus mode has switched off.
 */
export function snapTargets(
  document: EditorDocument,
  selectedId: string | null,
  boundary?: Polygon,
  isShown: (feature: DesignFeature) => boolean = () => true,
): Position[] {
  const visible = new Set(document.layers.filter((l) => l.visible).map((l) => l.id));
  const targets: Position[] = boundary ? verticesOf(boundary) : [];
  for (const feature of document.features) {
    if (feature.id !== selectedId && visible.has(feature.layer_id) && isShown(feature)) {
      targets.push(...verticesOf(feature.geometry));
    }
  }
  return targets;
}

/**
 * Terra Draw "custom snapping": the nearest target within reach *on screen* (so it feels the same at
 * every zoom), or nothing. Returns the target's exact coordinates.
 */
export function snapToTargets(getTargets: () => Position[]): SnapToCustom {
  return (event, { project }) => {
    let best: Position | undefined;
    let bestDistance = SNAP_REACH_PX;
    for (const target of getTargets()) {
      const at = project(target[0], target[1]);
      const distance = Math.hypot(at.x - event.containerX, at.y - event.containerY);
      if (distance <= bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    return best;
  };
}

export interface FeatureHit {
  /** The editor's id for the feature (promoted `_editor_id` property). */
  id: string;
  geometryType: string;
}

const PICK_ORDER: Record<string, number> = { Point: 0, LineString: 1, Polygon: 2 };

/**
 * Which feature a click meant, among everything under the pointer. A small marker or thin path
 * inside a zone wins over the zone, whatever layer order they are drawn in; otherwise the topmost.
 */
export function pickFeature(hits: readonly FeatureHit[]): string | undefined {
  const rank = (hit: FeatureHit) => PICK_ORDER[hit.geometryType] ?? 3;
  return hits.reduce<FeatureHit | undefined>(
    (best, hit) => (best === undefined || rank(hit) < rank(best) ? hit : best),
    undefined,
  )?.id;
}

/**
 * Whether a click is on one of the corners of the feature being edited. Terra Draw owns those
 * clicks (grabbing a corner); re-selecting whatever lies underneath — typically the neighbouring
 * zone that shares the corner — would steal the selection mid-edit.
 */
export function isOnCorner(
  click: { x: number; y: number },
  corners: readonly Position[],
  project: (corner: Position) => { x: number; y: number },
): boolean {
  return corners.some((corner) => {
    const at = project(corner);
    return Math.hypot(at.x - click.x, at.y - click.y) <= SELECT_REACH_PX;
  });
}

/** Slack around a click when looking for a feature: lines are 2–3 px wide, fingers are not. */
const PICK_SLOP_PX = 6;

/** The pixel box searched for features around a click. */
export function pickBox(point: { x: number; y: number }): [[number, number], [number, number]] {
  return [
    [point.x - PICK_SLOP_PX, point.y - PICK_SLOP_PX],
    [point.x + PICK_SLOP_PX, point.y + PICK_SLOP_PX],
  ];
}

const editable = (snap: SnapToCustom) => ({
  feature: {
    draggable: true,
    rotateable: true,
    coordinates: {
      draggable: true,
      deletable: true,
      midpoints: true,
      snappable: { toCustom: snap, showSnappingPoint: true },
    },
  },
});

/** Terra Draw modes of the editor. `getTargets` supplies the corners to snap onto. */
export function createEditorModes(getTargets: () => Position[]) {
  const snap = snapToTargets(getTargets);
  const snapping = { toCustom: snap, showSnappingPoint: true };
  return [
    new TerraDrawPointMode(),
    new TerraDrawLineStringMode({ pointerDistance: DRAW_REACH_PX, snapping }),
    new TerraDrawPolygonMode({ pointerDistance: DRAW_REACH_PX, snapping }),
    new TerraDrawRectangleMode(),
    new TerraDrawSelectMode({
      pointerDistance: SELECT_REACH_PX,
      flags: {
        point: editable(snap),
        linestring: editable(snap),
        polygon: editable(snap),
        // A to-scale footprint moves as a whole: its corners are set by its size, not dragged.
        rectangle: { feature: { draggable: true } },
      },
      keyEvents: { deselect: "Escape", delete: null, rotate: null, scale: null },
    }),
  ];
}

/** Used by tests and the hook alike to name the geometry a Terra Draw mode edits. */
export const geometryMode = (feature: DesignFeature) =>
  feature.geometry.type === "Point"
    ? "point"
    : feature.geometry.type === "LineString"
      ? "linestring"
      : footprintOf(feature)
        ? "rectangle"
        : "polygon";
