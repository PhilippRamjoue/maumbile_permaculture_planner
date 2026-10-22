import type { ElementType } from "../../entities/planning";
import type { EditorState } from "./store";
import type { Tool } from "./useEditorMap";
import { FeatureProperties } from "./FeatureProperties";

export function EditorControls({
  state,
  disabled,
  tool,
  choose,
  setTool,
  types,
  elementId,
  setElementId,
  activeLayer,
  setActiveLayer,
  onRotate,
}: {
  state: EditorState;
  disabled: boolean;
  tool: Tool;
  choose(tool: Tool): void;
  setTool(tool: Tool): void;
  types: ElementType[];
  elementId: number | undefined;
  setElementId(id: number): void;
  activeLayer: string;
  setActiveLayer(id: string): void;
  onRotate(angle: number): void;
}) {
  const selected = state.document.features.find((feature) => feature.id === state.selectedId);
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
    <fieldset disabled={disabled}>
      <legend>Tools</legend>
      <div className="editor-tools">
        {(
          [
            ["select", "Select / edit"],
            ["zone", "Draw zone"],
            ["sector", "Draw sector"],
            ["path", "Draw path"],
            ["measure-line", "Measure distance"],
            ["measure-area", "Measure area"],
          ] as [Tool, string][]
        ).map(([value, label]) => (
          <button
            type="button"
            className="btn"
            key={value}
            aria-pressed={tool === value}
            onClick={() => choose(value)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="btn" disabled={!state.past.length} onClick={state.undo}>
          Undo
        </button>
        <button type="button" className="btn" disabled={!state.future.length} onClick={state.redo}>
          Redo
        </button>
      </div>
      <p className="muted">
        Polygons: click corners, then the first corner to finish. Paths: click points, then Enter.
        Select a shape to drag it or edit its vertices.
      </p>
      <label>
        Element palette
        <select
          value={elementId}
          onChange={(event) => {
            setElementId(Number(event.target.value));
            choose("element");
          }}
        >
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn" disabled={!elementId} onClick={() => choose("element")}>
        Place element
      </button>
      <p className="muted">
        Points: click to place. Footprints: click opposite corners. Lines: click points, then Enter.
      </p>
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
      <h2>Layers</h2>
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
              className="btn"
              aria-label={`Raise ${layer.name}`}
              onClick={() => reorder(layer.id, 1)}
            >
              ↑
            </button>
            <button
              className="btn"
              aria-label={`Lower ${layer.name}`}
              onClick={() => reorder(layer.id, -1)}
            >
              ↓
            </button>
          </div>
        ))}
      <h2>Features ({state.document.features.length})</h2>
      <ul className="editor-feature-list">
        {state.document.features.map((feature) => (
          <li key={feature.id}>
            <button
              className="btn"
              aria-pressed={feature.id === state.selectedId}
              onClick={() => {
                setTool("select");
                state.select(feature.id);
              }}
            >
              {String(feature.properties.name ?? feature.feature_type)}
            </button>
          </li>
        ))}
      </ul>
      <FeatureProperties
        selected={selected}
        layers={state.document.layers}
        onChange={state.upsert}
        onDelete={state.remove}
        onClear={() => state.select(null)}
        onRotate={onRotate}
      />
    </fieldset>
  );
}
