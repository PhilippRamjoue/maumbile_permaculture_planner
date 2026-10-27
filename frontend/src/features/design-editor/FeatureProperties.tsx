import type { DesignFeature, PlanLayer } from "../../entities/planning";
import { FootprintFields } from "./FootprintFields";
import {
  isParametricSector,
  normalizeBearing,
  redrawSector,
  SECTOR_KINDS,
  syncSectorLook,
} from "./sectors";

export function FeatureProperties({
  selected,
  layers,
  onChange,
  onDelete,
  onRotate,
}: {
  selected: DesignFeature | undefined;
  layers: PlanLayer[];
  onChange(feature: DesignFeature): void;
  onDelete(id: string): void;
  onRotate(angle: number): void;
}) {
  if (!selected) return null;
  const patchProperties = (changes: Record<string, unknown>) =>
    onChange({ ...selected, properties: { ...selected.properties, ...changes } });
  // Reshape a sector from its numbers: redraw the wedge and keep its generated name/colour in step.
  const redrawSectorWith = (changes: Record<string, unknown>) =>
    onChange(
      syncSectorLook(
        selected,
        redrawSector({ ...selected, properties: { ...selected.properties, ...changes } }),
      ),
    );
  const rotateSector = (delta: number) =>
    redrawSectorWith({
      bearing_from: normalizeBearing(Number(selected.properties.bearing_from ?? 0) + delta),
      bearing_to: normalizeBearing(Number(selected.properties.bearing_to ?? 0) + delta),
    });
  const parametricSector = isParametricSector(selected);
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
      <FootprintFields selected={selected} onChange={onChange} />
      <details className="editor-more">
        <summary>More options</summary>
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
      </details>
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
              onChange={(event) =>
                onChange(
                  syncSectorLook(selected, {
                    ...selected,
                    properties: { ...selected.properties, sector_kind: event.target.value },
                  }),
                )
              }
            >
              {SECTOR_KINDS.map((kind) => (
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
                  if (value >= 0 && value < 360) redrawSectorWith({ [key]: value });
                }}
              />
            </label>
          ))}
          {parametricSector && (
            <>
              <label>
                Radius (m)
                <input
                  type="number"
                  min={5}
                  max={100000}
                  step={1}
                  value={Number(selected.properties.radius_m ?? 0)}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (value >= 5 && value <= 100000) redrawSectorWith({ radius_m: value });
                  }}
                />
              </label>
              <div className="editor-tools" role="group" aria-label="Rotate sector">
                <button type="button" className="btn" onClick={() => rotateSector(-15)}>
                  Rotate left 15°
                </button>
                <button type="button" className="btn" onClick={() => rotateSector(15)}>
                  Rotate right 15°
                </button>
              </div>
              <p className="muted">
                This sector is a wedge from one point. Reshape it with its bearings and radius, or
                rotate it — no need to move each point.
              </p>
            </>
          )}
        </>
      )}
      {selected.geometry.type !== "Point" && !parametricSector && (
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
    </div>
  );
}
