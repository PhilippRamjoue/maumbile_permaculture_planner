import type { EditorState } from "../store";

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
 * The plan layers and which layer new shapes go into. Not part of any one step, so it lives folded
 * inside the sidebar's "More" section. (Measuring lives on the map.)
 */
export function AdvancedTools({
  state,
  disabled,
  activeLayer,
  setActiveLayer,
}: {
  state: EditorState;
  disabled: boolean;
  activeLayer: string;
  setActiveLayer(id: string): void;
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
    <fieldset className="editor-advanced" disabled={disabled}>
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
  );
}
