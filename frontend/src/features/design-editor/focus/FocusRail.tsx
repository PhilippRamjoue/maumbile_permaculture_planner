import {
  FOCUS_MODES,
  focusMode,
  nudgeFor,
  type FocusId,
  type NudgeContext,
  type Progress,
} from "./modes";

/**
 * The focus switcher: five numbered steps in the suggested order, a check on those that already
 * hold something, and one gentle "next" suggestion. Every step is always a button — the order is
 * a hint, not a gate.
 */
export function FocusRail({
  current,
  progress,
  warnings,
  context,
  onChange,
}: {
  current: FocusId;
  progress: Progress;
  /** Steps with something that needs attention (e.g. an unsaved border), shown as a marker. */
  warnings: Partial<Record<FocusId, string>>;
  /** The goals and features the nudge may refer to (e.g. water first). */
  context?: NudgeContext;
  onChange(next: FocusId): void;
}) {
  const nudge = nudgeFor(current, progress, context);
  const next = nudge.next ? focusMode(nudge.next) : null;
  return (
    <nav className="focus-rail" aria-label="Design focus">
      <ol className="focus-rail__steps">
        {FOCUS_MODES.map((mode, index) => {
          const active = mode.id === current;
          const done = progress[mode.id];
          const warning = warnings[mode.id];
          return (
            <li key={mode.id}>
              <button
                type="button"
                className="focus-rail__step"
                aria-current={active ? "step" : undefined}
                data-done={done ? "true" : "false"}
                onClick={() => onChange(mode.id)}
              >
                <span className="focus-rail__num" aria-hidden="true">
                  {done && !active ? "✓" : index + 1}
                </span>
                <span className="focus-rail__label">
                  <span>{mode.label}</span>
                  <span className="focus-rail__plain">{mode.plain}</span>
                </span>
                {done && <span className="visually-hidden"> (has content)</span>}
                {warning && (
                  <span
                    className="focus-rail__warn"
                    title={warning}
                    role="img"
                    aria-label={warning}
                  >
                    !
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="focus-rail__nudge" role="status">
        <span>{nudge.text}</span>
        {next && (
          <button type="button" className="btn btn--link" onClick={() => onChange(next.id)}>
            Next: {next.label} →
          </button>
        )}
      </p>
    </nav>
  );
}
