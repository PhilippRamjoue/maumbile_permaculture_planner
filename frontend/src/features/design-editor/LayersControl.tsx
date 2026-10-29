import { useState } from "react";

import type { ImageryProviders } from "../../entities/imagery";
import type { EditorState } from "./store";

const STORAGE_KEY = "permaculture.layersControl.open";

const readOpen = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Layer visibility, draw order and which layer new shapes go into — a floating control over the map,
 * beside Legend and Terrain, since these are whole-map settings rather than anything to do with the
 * step you are in. Replaces the per-step "Layers & context" sidebar block.
 */
export function LayersControl({
  state,
  disabled,
  activeLayer,
  setActiveLayer,
  imagery,
}: {
  state: EditorState;
  disabled: boolean;
  activeLayer: string;
  setActiveLayer(id: string): void;
  /** The satellite sources covering the site; the choice is offered when there is more than one. */
  imagery?: {
    providers: ImageryProviders | undefined;
    /** The key in use (the default's, when nothing else was chosen). */
    selected: string | null;
    onSelect(key: string): void;
  };
}) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () =>
    setOpen((previous) => {
      try {
        localStorage.setItem(STORAGE_KEY, previous ? "0" : "1");
      } catch {
        /* the choice just is not remembered */
      }
      return !previous;
    });

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
  const setVisible = (id: string, visible: boolean) =>
    state.commit({
      ...state.document,
      layers: state.document.layers.map((l) => (l.id === id ? { ...l, visible } : l)),
    });

  const ordered = [...state.document.layers].sort((a, b) => b.sort_order - a.sort_order);

  return (
    <span className="map-tool-popover">
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls="layers-control"
        onClick={toggle}
      >
        Layers
      </button>
      {open && (
        <section id="layers-control" className="map-legend layers-control" aria-label="Layers">
          <fieldset disabled={disabled}>
            <legend className="visually-hidden">Layers</legend>
            <p className="muted">Show, hide and order the layers. Top of the list draws on top.</p>
            {ordered.map((layer) => (
              <div className="editor-layer" key={layer.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={(e) => setVisible(layer.id, e.target.checked)}
                  />{" "}
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
            {imagery && (imagery.providers?.providers.length ?? 0) > 1 && (
              <label className="layers-control__draw">
                Satellite source
                <select
                  value={imagery.selected ?? imagery.providers?.default_key ?? ""}
                  onChange={(e) => imagery.onSelect(e.target.value)}
                >
                  {imagery.providers?.providers.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span className="muted">
                  Only the picture changes: lines, areas and measurements stay exactly where they
                  are.
                </span>
              </label>
            )}
            <label className="layers-control__draw">
              New shapes go into
              <select value={activeLayer} onChange={(e) => setActiveLayer(e.target.value)}>
                {state.document.layers
                  .filter((l) => l.visible)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </label>
          </fieldset>
        </section>
      )}
    </span>
  );
}
