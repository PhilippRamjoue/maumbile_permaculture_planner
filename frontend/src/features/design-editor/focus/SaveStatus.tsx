import { Link } from "react-router-dom";

export type SaveState = "saving" | "unsaved" | "failed" | "saved" | "invalid";

export function saveStateOf({
  saving,
  dirty,
  failed,
  invalid = false,
}: {
  saving: boolean;
  dirty: boolean;
  failed: boolean;
  invalid?: boolean;
}): SaveState {
  if (saving) return "saving";
  if (invalid) return "invalid";
  if (failed) return "failed";
  return dirty ? "unsaved" : "saved";
}

const TEXT: Record<SaveState, string> = {
  invalid: "Not saved — fix the border",
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
