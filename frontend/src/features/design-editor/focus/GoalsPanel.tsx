import type { GoalPriority, PlanGoals } from "../../../entities/generated/plan";
import { GOAL_OPTIONS, VISION_MAX_LENGTH } from "./goals";

/**
 * Goals focus: what the owner wants from the land, before any map work. A handful of priorities
 * to tick (water first, since it shapes the rest) and a few free words. Everything is optional —
 * this step can be skipped, and it is saved with the rest of the design.
 */
export function GoalsPanel({
  goals,
  onChange,
  onContinue,
}: {
  goals: PlanGoals;
  onChange(next: PlanGoals): void;
  /** Move on to the next step. */
  onContinue(): void;
}) {
  const toggle = (key: GoalPriority) =>
    onChange({
      ...goals,
      priorities: goals.priorities.includes(key)
        ? goals.priorities.filter((k) => k !== key)
        : [...goals.priorities, key],
    });
  const [water, ...others] = GOAL_OPTIONS;
  const button = (option: (typeof GOAL_OPTIONS)[number]) => (
    <button
      key={option.key}
      type="button"
      className="goal-option"
      data-goal={option.key}
      aria-pressed={goals.priorities.includes(option.key)}
      onClick={() => toggle(option.key)}
    >
      <strong>{option.label}</strong>
      <span className="muted">{option.hint}</span>
    </button>
  );
  return (
    <>
      <fieldset className="goal-options">
        <legend>What matters most?</legend>
        <p className="muted">Tick as many as you like.</p>
        {button(water!)}
        <p className="goal-water-note">
          Water first: where it comes from, where it goes and how you hold it on the land shapes
          nearly every other choice. Many designers start here.
        </p>
        <div className="goal-options__rest">{others.map(button)}</div>
      </fieldset>
      <label>
        In your own words
        <textarea
          value={goals.vision}
          rows={5}
          maxLength={VISION_MAX_LENGTH}
          placeholder="For example: a shady family garden with fruit trees, enough water through the dry season, and room for the children to play."
          onChange={(event) => onChange({ ...goals, vision: event.target.value })}
        />
      </label>
      <button type="button" className="btn btn--primary btn--wide" onClick={onContinue}>
        Next → Your boundary
      </button>
      <p className="muted">
        Optional — you can skip this and come back any time. Your goals are saved with the design.
      </p>
    </>
  );
}

/** A one-line reminder of the owner's goals, shown above the other steps. */
export function GoalsReminder({
  goals,
  labelOf,
  onOpen,
}: {
  goals: PlanGoals;
  labelOf(key: GoalPriority): string;
  onOpen(): void;
}) {
  if (goals.priorities.length === 0) return null;
  return (
    <p className="goals-reminder muted">
      Your goals: {goals.priorities.map(labelOf).join(" · ")}{" "}
      <button type="button" className="btn btn--link" onClick={onOpen}>
        Edit
      </button>
    </p>
  );
}
