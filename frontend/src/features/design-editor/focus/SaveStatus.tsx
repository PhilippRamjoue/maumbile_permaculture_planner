import { Link } from "react-router-dom";

export type SaveState = "saving" | "unsaved" | "failed" | "saved";

export function saveStateOf({
  saving,
  dirty,
  failed,
}: {
  saving: boolean;
  dirty: boolean;
  failed: boolean;
}): SaveState {
  if (saving) return "saving";
  if (failed) return "failed";
  return dirty ? "unsaved" : "saved";
}

const TEXT: Record<SaveState, string> = {
  saving: "Saving…",
  unsaved: "Unsaved changes — saving automatically",
  failed: "Not saved yet — see the message below",
  saved: "All changes saved",
};

/**
 * The one place that says whether the design is safe, with the reassurance that it saves by
 * itself and can be reopened later from the site's design plans.
 */
export function SaveStatus({ state, plansPath }: { state: SaveState; plansPath: string }) {
  return (
    <div className="save-status" data-state={state}>
      <span role="status" className="save-status__state">
        <span aria-hidden="true">
          {state === "saved" ? "✓ " : state === "saving" ? "⟳ " : "● "}
        </span>
        {TEXT[state]}
      </span>
      <span className="save-status__note muted">
        Your design saves itself as you work. Reopen it any time from{" "}
        <Link to={plansPath}>Design plans</Link>.
      </span>
    </div>
  );
}

/** Shown right after something was drawn or placed: it is there, and what to do next. */
export function PlacedNotice({
  name,
  saveState,
  anotherLabel,
  onAnother,
  onDone,
}: {
  name: string;
  saveState: SaveState;
  anotherLabel: string;
  onAnother(): void;
  onDone(): void;
}) {
  return (
    <section className="placed-notice" aria-label="Added to your design">
      <p role="status">
        <strong>✓ {name} added.</strong>{" "}
        {saveState === "saved" ? "Saved to your design." : "It will be saved automatically."}
      </p>
      <div className="editor-tools">
        <button type="button" className="btn btn--primary" onClick={onAnother}>
          {anotherLabel}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Done
        </button>
      </div>
    </section>
  );
}
