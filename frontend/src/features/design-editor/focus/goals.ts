import type { GoalPriority, PlanGoals } from "../../../entities/generated/plan";

export const VISION_MAX_LENGTH = 2000;

export interface GoalOption {
  key: GoalPriority;
  label: string;
  /** One plain sentence on what choosing it means for the design. */
  hint: string;
}

/** What the owner can want from the land, in the order shown. Water leads: it shapes the rest. */
export const GOAL_OPTIONS: readonly GoalOption[] = [
  {
    key: "water",
    label: "Water",
    hint: "Catch, store and slow down rain; keep the land and your supply secure.",
  },
  { key: "food", label: "Food", hint: "Grow food for the household." },
  { key: "income", label: "Income", hint: "Earn something from the land." },
  {
    key: "habitat",
    label: "Habitat & biodiversity",
    hint: "Make room for wildlife and soil life.",
  },
  { key: "beauty", label: "Beauty", hint: "A place that is a joy to be in." },
  { key: "shelter", label: "Shelter & privacy", hint: "Shade, windbreaks and a sheltered home." },
  { key: "education", label: "Learning & sharing", hint: "Teach, demonstrate and host visitors." },
  { key: "low_maintenance", label: "Low maintenance", hint: "Little work once it is established." },
];

export const EMPTY_GOALS: PlanGoals = { priorities: [], vision: "" };

const ORDER = GOAL_OPTIONS.map((option) => option.key);

/** Goals in their canonical form (priorities in display order, text trimmed at the ends). */
export function normaliseGoals(goals: PlanGoals | null | undefined): PlanGoals {
  const chosen = new Set(goals?.priorities ?? []);
  return {
    priorities: ORDER.filter((key) => chosen.has(key)),
    vision: (goals?.vision ?? "").trim(),
  };
}

/** Identifies the content of the goals; a plan without goals equals an untouched form. */
export const goalsSignature = (goals: PlanGoals | null | undefined) =>
  JSON.stringify(normaliseGoals(goals));

export const labelOf = (key: GoalPriority) =>
  GOAL_OPTIONS.find((option) => option.key === key)?.label ?? key;
