import type { DesignFeature, PlanLayer } from "../../entities/planning";

export function FeatureProperties({
  selected,
  layers,
  onChange,
  onDelete,
  onClear,
  onRotate,
}: {
  selected: DesignFeature | undefined;
  layers: PlanLayer[];
  onChange(feature: DesignFeature): void;
  onDelete(id: string): void;
  onClear(): void;
  onRotate(angle: number): void;
}) {
  if (!selected) return null;
  const patchProperties = (changes: Record<string, unknown>) =>
    onChange({ ...selected, properties: { ...selected.properties, ...changes } });
  return (
    <div className="editor-properties">
      <h2>Selected feature</h2>
      <label>
        Feature name
        <input
          maxLength={200}
          value={String(selected.properties.name ?? "")}
          onChange={(event) => patchProperties({ name: event.target.value })}
        />
      </label>
      <label>
        Notes
        <textarea
          value={String(selected.properties.notes ?? "")}
          maxLength={5000}
          onChange={(event) => patchProperties({ notes: event.target.value })}
        />
      </label>
      <label>
        Feature color
        <input
          type="color"
          value={String(selected.properties.color ?? "#2f855a")}
          onChange={(event) => patchProperties({ color: event.target.value })}
        />
      </label>
      <label>
        Feature layer
        <select
          value={selected.layer_id}
          onChange={(event) => onChange({ ...selected, layer_id: event.target.value })}
        >
          {layers.map((l) => (
            <option value={l.id} key={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {selected.feature_type === "zone" && (
        <label>
          Zone number
          <select
            value={Number(selected.properties.zone_number ?? 1)}
            onChange={(event) => patchProperties({ zone_number: Number(event.target.value) })}
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
      {selected.feature_type === "sector" && (
        <>
          <label>
            Sector kind
            <select
              value={String(selected.properties.sector_kind ?? "wind")}
              onChange={(event) => patchProperties({ sector_kind: event.target.value })}
            >
              {["sun", "wind", "fire", "view", "water", "wildlife", "noise"].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          {["bearing_from", "bearing_to"].map((key) => (
            <label key={key}>
              {key === "bearing_from" ? "Bearing from" : "Bearing to"}
              <input
                type="number"
                min={0}
                max={359.99}
                step="0.1"
                value={Number(selected.properties[key] ?? 0)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (value >= 0 && value < 360) patchProperties({ [key]: value });
                }}
              />
            </label>
          ))}
        </>
      )}
      {selected.geometry.type !== "Point" && (
        <>
          <button className="btn" onClick={() => onRotate(-15)}>
            Rotate left 15°
          </button>
          <button className="btn" onClick={() => onRotate(15)}>
            Rotate right 15°
          </button>
        </>
      )}
      <button className="btn" onClick={() => onDelete(selected.id)}>
        Delete feature
      </button>
      <button className="btn" onClick={() => onClear()}>
        Clear selection
      </button>
    </div>
  );
}
