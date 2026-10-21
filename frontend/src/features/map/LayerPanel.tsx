import { layerRegistry } from "./layers/defaultRegistry";
import type { LayerRegistry } from "./layers/registry";
import { isLayerVisible, useMapLayerStore } from "./store";

/** Toggles for every registry layer the user is allowed to hide. */
export function LayerPanel({ registry = layerRegistry }: { registry?: LayerRegistry }) {
  const overrides = useMapLayerStore((s) => s.overrides);
  const setVisible = useMapLayerStore((s) => s.setVisible);
  const toggleable = registry.list().filter((d) => d.toggleable);
  if (toggleable.length === 0) return null;

  return (
    <fieldset className="layer-panel">
      <legend>Layers</legend>
      {toggleable.map((definition) => (
        <label key={definition.id}>
          <input
            type="checkbox"
            checked={isLayerVisible(definition, overrides)}
            onChange={(e) => setVisible(definition.id, e.target.checked)}
          />{" "}
          {definition.label}
        </label>
      ))}
    </fieldset>
  );
}
