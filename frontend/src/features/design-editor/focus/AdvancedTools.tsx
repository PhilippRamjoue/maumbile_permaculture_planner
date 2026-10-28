import type { EditorState } from "../store";

/**
 * Undo / redo of the design (the border has its own, in its panel). Layer visibility, order and the
 * draw-into-layer choice moved to the `LayersControl` map popover.
 */
export function HistoryButtons({ state, disabled }: { state: EditorState; disabled: boolean }) {
  return (
    <div className="editor-tools" role="group" aria-label="History">
      <button
        type="button"
        className="btn"
        disabled={disabled || !state.past.length}
        onClick={state.undo}
      >
        Undo
      </button>
      <button
        type="button"
        className="btn"
        disabled={disabled || !state.future.length}
        onClick={state.redo}
      >
        Redo
      </button>
    </div>
  );
}
