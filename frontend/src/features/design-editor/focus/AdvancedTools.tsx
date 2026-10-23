import type { DesignFeature } from "../../../entities/planning";
import { formatArea } from "../../../shared/format";
import type { Measurement } from "../measure";
import type { EditorState } from "../store";
import type { Tool } from "../useEditorMap";
import { ToolButton } from "./common";

/** Undo / redo of the design (the border has its own, in its panel). */
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

/**
 * Everything that is useful but not part of the current step, folded away: measuring, the plan
 * layers and which layer new shapes go into. Out of sight until asked for.
 */
export function AdvancedTools({
  state,
  disabled,
  tool,
  choose,
  activeLayer,
  setActiveLayer,
  selected,
  measurement,
  confirmed,
  confirming,
  confirmError,
  onConfirm,
}: {
  state: EditorState;
  disabled: boolean;
  tool: Tool;
  choose(tool: Tool): void;
  activeLayer: string;
  setActiveLayer(id: string): void;
  selected: DesignFeature | undefined;
  measurement: Measurement | null;
  confirmed: boolean;
  confirming: boolean;
  confirmError: string | null;
  onConfirm(): void;
}) {
  const reorder = (id: string, delta: number) => {
    const layers = [...state.document.layers].sort((a, b) => a.sort_order - b.sort_order);
    const index = layers.findIndex((l) => l.id === id);
    if (index + delta < 0 || index + delta >= layers.length) return;
    [layers[index], layers[index + delta]] = [layers[index + delta], layers[index]];
    state.commit({
      ...state.document,
      layers: layers.map((l, sort_order) => ({ ...l, sort_order })),
    });
  };

  return (
    <details className="editor-advanced">
      <summary>Measure &amp; layers</summary>
      <fieldset disabled={disabled}>
        <legend>Measure</legend>
        <div className="editor-tools">
          <ToolButton tool="measure-line" current={tool} label="Measure distance" choose={choose} />
          <ToolButton tool="measure-area" current={tool} label="Measure area" choose={choose} />
        </div>
      </fieldset>
      <div className="editor-measurement" aria-label="Measurement">
        <h2>Measurements</h2>
        {measurement ? (
          <>
            <p>
              {measurement.length_m.toFixed(1)} m{" "}
              {selected?.geometry.type === "Polygon" ? "perimeter" : "length"}
            </p>
            <p>{formatArea(measurement.area_m2)}</p>
          </>
        ) : (
          <p>Select a shape or use a measure tool.</p>
        )}
        <p className="muted">
          {selected && confirmed ? "Confirmed by server" : "Live geodesic estimate"}
        </p>
        <button
          type="button"
          className="btn"
          disabled={!selected || confirming || disabled}
          onClick={onConfirm}
        >
          Confirm measurement
        </button>
        {confirmError && <p role="alert">{confirmError}</p>}
      </div>
      <fieldset disabled={disabled}>
        <legend>Layers</legend>
        <label>
          Draw into layer
          <select value={activeLayer} onChange={(event) => setActiveLayer(event.target.value)}>
            {state.document.layers
              .filter((l) => l.visible)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </label>
        <p className="muted">Top of this list draws above the others.</p>
        {[...state.document.layers]
          .sort((a, b) => b.sort_order - a.sort_order)
          .map((layer) => (
            <div className="editor-layer" key={layer.id}>
              <label>
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() =>
                    state.commit({
                      ...state.document,
                      layers: state.document.layers.map((l) =>
                        l.id === layer.id ? { ...l, visible: !l.visible } : l,
                      ),
                    })
                  }
                />
                {layer.name}
              </label>
              <button
                type="button"
                className="btn"
                aria-label={`Raise ${layer.name}`}
                onClick={() => reorder(layer.id, 1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn"
                aria-label={`Lower ${layer.name}`}
                onClick={() => reorder(layer.id, -1)}
              >
                ↓
              </button>
            </div>
          ))}
      </fieldset>
    </details>
  );
}
