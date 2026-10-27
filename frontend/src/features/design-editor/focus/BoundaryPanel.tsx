import { useStore } from "zustand";

import { formatArea } from "../../../shared/format";
import {
  MIN_CORNERS,
  isBoundaryDirty,
  validateDraft,
  type BoundaryDraftStore,
} from "./boundaryDraft";

/**
 * Boundary focus: the site border on the satellite image. The map does the work (drag a corner,
 * click one to select it); this panel is the few buttons the map cannot offer — insert, delete,
 * undo, save — and says in plain words what is wrong when the border is not a valid piece of land.
 */
export function BoundaryPanel({
  draft,
  saving,
  error,
  onSave,
  onContinue,
}: {
  draft: BoundaryDraftStore;
  saving: boolean;
  error: string | null;
  onSave(): void;
  /** Move on to the next step (leaving this step saves a valid, changed border). */
  onContinue(): void;
}) {
  const state = useStore(draft);
  const validation = validateDraft(state.vertices);
  const dirty = isBoundaryDirty(state);
  const selected = state.selectedId;
  const lonely = state.vertices.length <= MIN_CORNERS;

  return (
    <fieldset disabled={saving}>
      <legend>Your border</legend>
      <p>
        {state.vertices.length} corners
        {validation.status === "valid" ? ` · ${formatArea(validation.areaM2)}` : ""}
      </p>
      <button
        type="button"
        className="btn btn--primary btn--wide"
        disabled={validation.status !== "valid" || saving}
        onClick={onContinue}
      >
        Looks good → Sectors &amp; terrain
      </button>
      <p className="muted">
        {validation.status === "valid"
          ? "Happy with the border? Continue. You can come back and adjust it any time."
          : "Fix the border first, then you can continue."}
      </p>
      <p className="muted">
        Drag a corner to nudge it; it snaps onto another corner when close. Click a corner to select
        it, then add a corner next to it or delete it.
      </p>
      <div className="editor-tools">
        <button
          type="button"
          className="btn"
          disabled={selected === null}
          onClick={() => selected !== null && state.insertAfter(selected)}
        >
          Add corner after selected
        </button>
        <button
          type="button"
          className="btn"
          disabled={selected === null || lonely}
          title={lonely ? `A border needs at least ${MIN_CORNERS} corners` : undefined}
          onClick={state.deleteSelected}
        >
          Delete corner
        </button>
        <button type="button" className="btn" disabled={!state.past.length} onClick={state.undo}>
          Undo
        </button>
        <button type="button" className="btn" disabled={!state.future.length} onClick={state.redo}>
          Redo
        </button>
      </div>
      {validation.status === "invalid" &&
        validation.messages.map((m) => (
          <p key={m} role="alert">
            {m}
          </p>
        ))}
      {error && <p role="alert">Could not save the border: {error}</p>}
      <div className="editor-tools">
        <button
          type="button"
          className="btn"
          disabled={!dirty || validation.status !== "valid" || saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save border"}
        </button>
        <button type="button" className="btn" disabled={!dirty || saving} onClick={state.discard}>
          Discard changes
        </button>
      </div>
      <p className="muted">
        {dirty
          ? "Your valid border changes save automatically. Invalid borders stay here until you fix or discard them."
          : "This border is shared by all plans for this site. Moving it does not move your drawings. Recompute terrain after a change."}
      </p>
    </fieldset>
  );
}
