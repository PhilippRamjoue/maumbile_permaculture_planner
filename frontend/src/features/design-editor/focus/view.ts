import type { Feature, LineString } from "geojson";

import type { DesignFeature } from "../../../entities/planning";
import { sectorKindOf, type SectorKind } from "../sectors";
import { isEditable, isShown, focusMode, type ContextGroup, type FocusId } from "./modes";

/**
 * What the map needs to know about the current focus mode: which features can be picked and
 * edited, which are drawn at all, and the extras of the mode. The editor map is a function of the
 * saved document plus this view, so switching modes never touches the data.
 */
export interface FocusView {
  mode: FocusId;
  isEditable(feature: DesignFeature): boolean;
  isShown(feature: DesignFeature): boolean;
  /** Whether a selected feature's shape can be reshaped on the map. */
  geometryEditable: boolean;
  /** Link lines drawn over the features (functions mode). */
  connections: readonly Feature<LineString>[];
  /** Values stamped on a newly drawn feature. */
  defaults: { zoneNumber: number };
  /** Changes whenever the rendering of the view would; used as an effect dependency. */
  key: string;
}

/** Every feature editable and shown: the editor without any focus (and for tests). */
export const OPEN_VIEW: FocusView = {
  mode: "elements",
  isEditable: () => true,
  isShown: () => true,
  geometryEditable: true,
  connections: [],
  defaults: { zoneNumber: 1 },
  key: "open",
};

export function createFocusView(
  mode: FocusId,
  hidden: ReadonlySet<ContextGroup>,
  connections: readonly Feature<LineString>[] = [],
  zoneNumber = 1,
  hiddenSectorKinds: ReadonlySet<SectorKind> = new Set(),
): FocusView {
  return {
    mode,
    isEditable: (feature) => isEditable(mode, feature),
    // A sector kind switched off in the Sectors step stays off in every step.
    isShown: (feature) =>
      isShown(mode, hidden, feature) &&
      !(feature.feature_type === "sector" && hiddenSectorKinds.has(sectorKindOf(feature))),
    geometryEditable: focusMode(mode).geometryEditable,
    connections,
    defaults: { zoneNumber },
    key: JSON.stringify([
      mode,
      [...hidden].sort(),
      connections,
      zoneNumber,
      [...hiddenSectorKinds].sort(),
    ]),
  };
}

/** How faint context features are drawn, as a share of their normal opacity. */
export const CONTEXT_OPACITY = 0.4;

const numberStyle = (style: unknown, key: string, fallback: number, min: number, max: number) => {
  const value =
    typeof style === "object" && style !== null
      ? Number((style as Record<string, unknown>)[key])
      : NaN;
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
};

/**
 * The GeoJSON features of one plan layer as the map draws them. `drawingId` is the feature Terra
 * Draw is editing right now (it draws that one itself); `selectedId` is highlighted when it is
 * drawn here instead. Properties starting with `_` exist only for rendering and are never saved.
 */
export function renderableFeatures(
  features: readonly DesignFeature[],
  view: FocusView,
  selectedId: string | null,
  drawingId: string | null,
) {
  return features
    .filter((f) => f.id !== drawingId && view.isShown(f))
    .map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        _editor_id: f.id,
        _context: !view.isEditable(f),
        _selected: f.id === selectedId,
        _width: numberStyle(f.properties.style, "stroke_width", 3, 1, 12),
        _radius: numberStyle(f.properties.style, "radius", 8, 3, 24),
        _opacity: numberStyle(f.properties.style, "fill_opacity", 0.3, 0, 1),
        color: /^#[0-9a-f]{6}$/i.test(String(f.properties.color)) ? f.properties.color : "#2f855a",
      },
    }));
}
