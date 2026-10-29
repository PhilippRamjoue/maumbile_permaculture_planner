import type { DesignFeature, FeatureType } from "../../../entities/planning";
import type { PlanGoals } from "../../../entities/generated/plan";
import type { EditorDocument } from "../store";
import { functionsOf } from "./functions";

/**
 * The guided focus modes of the design editor, in the order permaculture design naturally runs:
 * it starts from what the owner wants from the land (goals), and only then reads the map.
 * They are *filtered views over one saved design*, never separate documents: the boundary is the
 * Site, sectors / zones / elements are Features of the plan told apart by `feature_type`, and
 * functions live in an element's `properties`. A mode only decides what is editable right now
 * and what is shown faintly as context.
 */
export type FocusId = "goals" | "boundary" | "sectors" | "zones" | "elements" | "functions";

/**
 * How much of the method the editor shows at once. "simple" is just "place things on the map" — one
 * step, the elements — so a beginner is designing within seconds; "guided" opens the full set of
 * steps (goals, boundary, sectors, zones, elements, functions). The user can switch any time.
 */
export type EditorLevel = "simple" | "guided";

/** The single step a simple-mode editor works in: placing the concrete things on the map. */
export const SIMPLE_FOCUS: FocusId = "elements";

/** What the user can toggle as faint context: the site border and the three feature families. */
export type ContextGroup = "boundary" | "sectors" | "zones" | "elements";

type FocusTool = "select" | "zone" | "sector" | "sector-rect" | "element" | "path";

export interface FocusMode {
  id: FocusId;
  /** Short name on the rail. */
  label: string;
  /** A plain-language gloss under the label, so the method term is never the only word a beginner sees. */
  plain: string;
  /** The question this step answers, in the user's words. */
  question: string;
  /** A sentence or two of guidance shown at the top of the mode's panel. */
  help: string;
  /** Features of these types can be selected and edited; everything else is context. */
  editableTypes: readonly FeatureType[];
  /**
   * The context family this mode's own work belongs to (never listed as context for itself);
   * null when the mode edits nothing on the map.
   */
  group: ContextGroup | null;
  /** Drawing / placing tools offered in this mode (besides the always-available "select"). */
  tools: readonly FocusTool[];
  /** Whether the shape of a selected feature may be edited on the map (vs. only its properties). */
  geometryEditable: boolean;
  /** The plan layer new features of this mode are drawn into. */
  layerName: string | null;
}

export const FOCUS_MODES: readonly FocusMode[] = [
  {
    id: "goals",
    label: "Goals",
    plain: "what you want",
    question: "What do I want from this land?",
    help: "Permaculture starts with you, not the map. Say what matters most; every later step can come back to it. Optional, and you can change it any time.",
    editableTypes: [],
    group: null,
    tools: [],
    geometryEditable: false,
    layerName: null,
  },
  {
    id: "boundary",
    label: "Boundary",
    plain: "your land",
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
    plain: "sun · wind · water",
    question: "What is this site subject to?",
    help: "Mark where sun, wind, water, fire and views come from, and see how the land slopes.",
    editableTypes: ["sector"],
    group: "sectors",
    tools: ["sector", "sector-rect"],
    geometryEditable: true,
    layerName: "Sectors",
  },
  {
    id: "zones",
    label: "Zones",
    plain: "how often you visit",
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
    plain: "the things you place",
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
    plain: "needs & gives",
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

const CONTEXT_GROUPS: readonly { id: ContextGroup; label: string }[] = [
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

/** Whether the owner has said anything about what they want (a priority or a few words). */
const hasGoals = (goals: PlanGoals | null | undefined): boolean =>
  !!goals && (goals.priorities.length > 0 || goals.vision.trim().length > 0);

/**
 * Which steps have something in them. The boundary always counts (a site cannot exist without
 * one), so the check marks only ever follow real work in the saved design.
 */
export function progressOf(document: EditorDocument, goals?: PlanGoals | null): Progress {
  const has = (...types: FeatureType[]) =>
    document.features.some((f) => types.includes(f.feature_type));
  return {
    goals: hasGoals(goals),
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
 * How detailed to open a plan in: a plan that already carries method work — goals, sectors or zones —
 * opens in the full guided view; a fresh or elements-only plan opens simple, straight to placing
 * things on the map. A remembered preference (localStorage) overrides this.
 */
export function initialLevel(
  features: readonly Pick<DesignFeature, "feature_type">[],
  goals?: PlanGoals | null,
): EditorLevel {
  if (hasGoals(goals)) return "guided";
  const hasMethodWork = features.some(
    (f) => f.feature_type === "sector" || f.feature_type === "zone",
  );
  return hasMethodWork ? "guided" : "simple";
}

/**
 * Where to open a plan: a brand-new plan starts from the owner's goals, then the border (confirm
 * the land). A plan that already has design work opens on its first unstarted map step — goals
 * are optional, so a missing one never pulls anybody back — and on the last step once everything
 * has something.
 */
export function initialFocus(document: EditorDocument, goals?: PlanGoals | null): FocusId {
  if (document.features.length === 0) return hasGoals(goals) ? "boundary" : "goals";
  const progress = progressOf(document, goals);
  return FOCUS_IDS.find((id) => id !== "goals" && !progress[id]) ?? "functions";
}

/**
 * The suggested next step after `current`: the nearest later step with nothing in it yet, else the
 * next step in order, else nothing (we are on the last one). It is only a suggestion; every step
 * stays reachable at any time.
 */
export function suggestNext(current: FocusId, progress: Progress): FocusId | null {
  // The land is always confirmed right after the goals, even though the border always "has content".
  if (current === "goals") return "boundary";
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
  goals: "Tick what matters most to you — or skip this and come back any time.",
  boundary: "Check that the yellow border follows your land, then move on whenever you are ready.",
  sectors: "Add where the sun, wind and water come from — or skip ahead and come back any time.",
  zones: "Sketch your first zone — or skip ahead and come back any time.",
  elements:
    "Place your first element, such as the house, a tree or something that holds water — in any order.",
  functions: "Pick an element and note what it needs and what it gives.",
};
const WHEN_DONE: Record<FocusId, string> = {
  goals:
    "Your goals stay with the design. Look back at them whenever you are unsure what to do next.",
  boundary: "Your border is saved and used by every step.",
  sectors: "Good start. Sectors stay visible as faint context in the other steps.",
  zones: "Zones are saved. They stay visible as context while you place elements.",
  elements: "Elements are saved. Next, think about what each one does.",
  functions: "Every element can now be checked against the permaculture principles.",
};

/** What the nudge may know about the design beyond which steps have content. */
export interface NudgeContext {
  goals?: PlanGoals | null;
  features?: readonly Pick<DesignFeature, "feature_type" | "properties">[];
}

/**
 * Water, gently: when the owner named water as a goal, the sectors and elements steps wonder aloud
 * where it comes from and where it could be held, until the design says something about it. It is
 * a question, never a requirement: nothing is blocked and every other step stays open.
 */
function waterNudge(current: FocusId, { goals, features = [] }: NudgeContext): string | null {
  if (!goals?.priorities.includes("water")) return null;
  if (current === "sectors" && !features.some(isWaterSector))
    return "Water matters to you. Where does it come from, and where does it run or collect? Mark it if you know — or move on and come back.";
  if (current === "elements" && !features.some(yieldsWater))
    return "Water matters to you. Where could it be caught or kept — a tank, pond, swale or well? Add what fits, whenever it suits you.";
  return null;
}

const isWaterSector = (f: Pick<DesignFeature, "feature_type" | "properties">) =>
  f.feature_type === "sector" && f.properties.sector_kind === "water";
const yieldsWater = (f: Pick<DesignFeature, "feature_type" | "properties">) =>
  (f.feature_type === "element" || f.feature_type === "path") &&
  functionsOf(f, "yields").includes("water");

export function nudgeFor(current: FocusId, progress: Progress, context: NudgeContext = {}): Nudge {
  return {
    text: waterNudge(current, context) ?? (progress[current] ? WHEN_DONE : WHEN_EMPTY)[current],
    next: suggestNext(current, progress),
  };
}
