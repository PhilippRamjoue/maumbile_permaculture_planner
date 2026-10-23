import type { DesignFeature, FeatureType } from "../../../entities/planning";
import type { EditorDocument } from "../store";
import { functionsOf } from "./functions";

/**
 * The guided focus modes of the design editor, in the order permaculture design naturally runs.
 * They are *filtered views over one saved design*, never separate documents: the boundary is the
 * Site, sectors / zones / elements are Features of the plan told apart by `feature_type`, and
 * functions live in an element's `properties`. A mode only decides what is editable right now
 * and what is shown faintly as context.
 */
export type FocusId = "boundary" | "sectors" | "zones" | "elements" | "functions";

/** What the user can toggle as faint context: the site border and the three feature families. */
export type ContextGroup = "boundary" | "sectors" | "zones" | "elements";

export type FocusTool = "select" | "zone" | "sector" | "element" | "path";

export interface FocusMode {
  id: FocusId;
  /** Short name on the rail. */
  label: string;
  /** The question this step answers, in the user's words. */
  question: string;
  /** A sentence or two of guidance shown at the top of the mode's panel. */
  help: string;
  /** Features of these types can be selected and edited; everything else is context. */
  editableTypes: readonly FeatureType[];
  /** The context family this mode's own work belongs to (never listed as context for itself). */
  group: ContextGroup;
  /** Drawing / placing tools offered in this mode (besides the always-available "select"). */
  tools: readonly FocusTool[];
  /** Whether the shape of a selected feature may be edited on the map (vs. only its properties). */
  geometryEditable: boolean;
  /** The plan layer new features of this mode are drawn into. */
  layerName: string | null;
}

export const FOCUS_MODES: readonly FocusMode[] = [
  {
    id: "boundary",
    label: "Boundary",
    question: "Where is my land?",
    help: "See your land on the satellite image and make sure the border follows it. Drag a corner to nudge it.",
    editableTypes: [],
    group: "boundary",
    tools: [],
    geometryEditable: false,
    layerName: null,
  },
  {
    id: "sectors",
    label: "Sectors & terrain",
    question: "What is this site subject to?",
    help: "Mark where sun, wind, water, fire and views come from, and see how the land slopes.",
    editableTypes: ["sector"],
    group: "sectors",
    tools: ["sector"],
    geometryEditable: true,
    layerName: "Sectors",
  },
  {
    id: "zones",
    label: "Zones",
    question: "What gets visited how often?",
    help: "Sketch rough areas by how often you visit them: zone 0 is the house, zone 5 is left wild.",
    editableTypes: ["zone"],
    group: "zones",
    tools: ["zone"],
    geometryEditable: true,
    layerName: "Zones",
  },
  {
    id: "elements",
    label: "Elements",
    question: "What goes where?",
    help: "Place the concrete things: house, beds, trees, pond, paths, fences.",
    editableTypes: ["element", "path", "annotation"],
    group: "elements",
    tools: ["element", "path"],
    geometryEditable: true,
    layerName: "Elements",
  },
  {
    id: "functions",
    label: "Functions & connections",
    question: "What does each thing need and give?",
    help: "Every element should serve several functions, and every function should be met by several elements.",
    editableTypes: ["element", "path"],
    group: "elements",
    tools: [],
    geometryEditable: false,
    layerName: null,
  },
];

export const FOCUS_IDS = FOCUS_MODES.map((m) => m.id);

export const CONTEXT_GROUPS: readonly { id: ContextGroup; label: string }[] = [
  { id: "boundary", label: "Boundary" },
  { id: "sectors", label: "Sectors" },
  { id: "zones", label: "Zones" },
  { id: "elements", label: "Elements & paths" },
];

export const focusMode = (id: FocusId): FocusMode => FOCUS_MODES.find((m) => m.id === id)!;

/** A focus id from a URL parameter, or undefined when it is not one. */
export function parseFocus(value: string | null | undefined): FocusId | undefined {
  return FOCUS_IDS.find((id) => id === value);
}

export const isEditable = (mode: FocusId, feature: Pick<DesignFeature, "feature_type">) =>
  focusMode(mode).editableTypes.includes(feature.feature_type);

/** The context family a feature belongs to. */
export function groupOf(feature: Pick<DesignFeature, "feature_type">): ContextGroup {
  switch (feature.feature_type) {
    case "sector":
      return "sectors";
    case "zone":
      return "zones";
    default:
      return "elements";
  }
}

/** The families shown as faint context in `mode`: all of them but the one being worked on. */
export const contextGroups = (mode: FocusId): ContextGroup[] =>
  CONTEXT_GROUPS.map((g) => g.id).filter((g) => g !== focusMode(mode).group);

/**
 * Whether a feature is drawn at all in `mode`: editable features always, context features unless
 * the user switched that family off.
 */
export function isShown(
  mode: FocusId,
  hidden: ReadonlySet<ContextGroup>,
  feature: Pick<DesignFeature, "feature_type">,
): boolean {
  return isEditable(mode, feature) || !hidden.has(groupOf(feature));
}

export type Progress = Record<FocusId, boolean>;

/**
 * Which steps have something in them. The boundary always counts (a site cannot exist without
 * one), so the check marks only ever follow real work in the saved design.
 */
export function progressOf(document: EditorDocument): Progress {
  const has = (...types: FeatureType[]) =>
    document.features.some((f) => types.includes(f.feature_type));
  return {
    boundary: true,
    sectors: has("sector"),
    zones: has("zone"),
    elements: has("element", "path"),
    functions: document.features.some(
      (f) =>
        (f.feature_type === "element" || f.feature_type === "path") &&
        (functionsOf(f, "needs").length > 0 || functionsOf(f, "yields").length > 0),
    ),
  };
}

/**
 * Where to open a plan: the border for an empty plan (confirm the land first), otherwise the first
 * step that has nothing yet — and the last step once everything has something.
 */
export function initialFocus(document: EditorDocument): FocusId {
  if (document.features.length === 0) return "boundary";
  const progress = progressOf(document);
  return FOCUS_IDS.find((id) => !progress[id]) ?? "functions";
}

/**
 * The suggested next step after `current`: the nearest later step with nothing in it yet, else the
 * next step in order, else nothing (we are on the last one). It is only a suggestion; every step
 * stays reachable at any time.
 */
export function suggestNext(current: FocusId, progress: Progress): FocusId | null {
  const index = FOCUS_IDS.indexOf(current);
  const later = FOCUS_IDS.slice(index + 1);
  return later.find((id) => !progress[id]) ?? later[0] ?? null;
}

export interface Nudge {
  /** Gentle sentence about this step. */
  text: string;
  next: FocusId | null;
}

const WHEN_EMPTY: Record<FocusId, string> = {
  boundary: "Check that the yellow border follows your land, then move on whenever you are ready.",
  sectors: "Add where the sun and wind come from — or skip ahead and come back any time.",
  zones: "Sketch your first zone — or skip ahead and come back any time.",
  elements: "Place your first element, such as the house or a tree.",
  functions: "Pick an element and note what it needs and what it gives.",
};
const WHEN_DONE: Record<FocusId, string> = {
  boundary: "Your border is saved and used by every step.",
  sectors: "Good start. Sectors stay visible as faint context in the other steps.",
  zones: "Zones are saved. They stay visible as context while you place elements.",
  elements: "Elements are saved. Next, think about what each one does.",
  functions: "Every element can now be checked against the permaculture principles.",
};

export function nudgeFor(current: FocusId, progress: Progress): Nudge {
  return {
    text: (progress[current] ? WHEN_DONE : WHEN_EMPTY)[current],
    next: suggestNext(current, progress),
  };
}
