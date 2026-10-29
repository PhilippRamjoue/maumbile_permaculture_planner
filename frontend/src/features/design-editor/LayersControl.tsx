import { safeLocalStorage } from "../../shared/safeLocalStorage";
import { useState } from "react";

import type { EditorState } from "./store";

const STORAGE_KEY = "permaculture.layersControl.open";

const readOpen = () => safeLocalStorage.get(STORAGE_KEY) === "1";

/**
 * Layer visibility and draw order — a floating control over the map, beside Legend, Basemap and
 * Terrain, since these are whole-map settings rather than anything to do with the step you are in.
 * New shapes are filed into their own role's layer automatically (see `useActiveLayer`), and the
 * basemap is switched from its own control, so neither is a knob here any more.
 */
export function LayersControl({ state, disabled }: { state: EditorState; disabled: boolean }) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () =>
    setOpen((previous) => {
      safeLocalStorage.set(STORAGE_KEY, previous ? "0" : "1");
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
          </fieldset>
        </section>
      )}
    </span>
  );
}
