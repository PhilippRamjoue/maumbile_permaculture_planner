import type { DesignFeature, ElementType } from "../../../entities/planning";
import { FeatureProperties } from "../FeatureProperties";
import { defaultFootprint, footprintLabel } from "../footprint";
import { GlyphIcon } from "../GlyphIcon";
import { FeatureList, ToolButton, type PanelProps } from "./common";

const paletteColor = (type: ElementType | undefined) => {
  const color = type?.default_style.fill ?? type?.default_style.stroke;
  return typeof color === "string" ? color : "#2f855a";
};

/** Elements focus: choose a thing from the palette and place it; paths are drawn as lines. */
export function ElementsPanel({
  props,
  types,
  elementId,
  setElementId,
  elements,
}: {
  props: PanelProps;
  types: readonly ElementType[];
  elementId: number | undefined;
  setElementId(id: number): void;
  elements: readonly DesignFeature[];
}) {
  const { state, tool, choose, pick, disabled, selected, onRotate } = props;
  const chosen = types.find((t) => t.id === elementId);
  const footprint = defaultFootprint(chosen);
  const categories = [...new Set(types.map((t) => t.category))];
  return (
    <>
      <fieldset disabled={disabled}>
        <legend>Elements</legend>
        <label>
          Element palette
          <span className="palette-choice">
            <GlyphIcon icon={chosen?.icon} color={paletteColor(chosen)} size={28} />
            <select
              value={elementId}
              onChange={(event) => {
                setElementId(Number(event.target.value));
                choose("element");
              }}
            >
              {categories.map((category) => (
                <optgroup key={category} label={category}>
                  {types
                    .filter((t) => t.category === category)
                    .map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </span>
        </label>
        <div className="editor-tools">
          <ToolButton tool="select" current={tool} label="Select / edit" choose={choose} />
          <button
            type="button"
            className="btn"
            aria-pressed={tool === "element"}
            disabled={!elementId}
            onClick={() => choose("element")}
          >
            Place element
          </button>
          <ToolButton tool="path" current={tool} label="Draw path" choose={choose} />
        </div>
        <p className="muted">
          {footprint
            ? `One click places a ${footprintLabel(footprint)} ${chosen?.name.toLowerCase()} to scale — set the exact size afterwards.`
            : chosen?.shape === "area"
              ? "Click opposite corners to draw it."
              : chosen?.shape === "line"
                ? "Click points along it, then Enter."
                : "Click the map to place it."}{" "}
          Paths: click points, then Enter.
        </p>
      </fieldset>
      <FeatureList
        title="Elements"
        features={elements}
        selectedId={state.selectedId}
        onPick={pick}
        empty="Nothing placed yet. Choose from the palette, then click the map."
      />
      <FeatureProperties
        selected={selected}
        layers={state.document.layers}
        onChange={state.upsert}
        onDelete={state.remove}
        onClear={() => state.select(null)}
        onRotate={onRotate}
      />
    </>
  );
}
