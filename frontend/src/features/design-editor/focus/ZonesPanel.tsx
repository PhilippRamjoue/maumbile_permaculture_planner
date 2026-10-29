import type { DesignFeature } from "../../../entities/planning";
import { FeatureProperties } from "../FeatureProperties";
import { EditHeader, FeatureList, PlacingBanner, ToolButton, type PanelProps } from "./common";

const ZONE_HELP: readonly string[] = [
  "The house and its immediate surroundings — where you are almost always.",
  "Visited every day: kitchen garden, herbs, salad.",
  "Visited often: orchard, small livestock, main beds.",
  "Visited now and then: field crops, pasture, larger trees.",
  "Visited rarely: woodlot, managed forest, foraging.",
  "Left wild: observe and learn from nature.",
];

/** Zones focus: pick the zone number first (a sensible default is chosen), then draw its area. */
export function ZonesPanel({
  props,
  zones,
  zoneNumber,
  setZoneNumber,
}: {
  props: PanelProps;
  zones: readonly DesignFeature[];
  zoneNumber: number;
  setZoneNumber(n: number): void;
}) {
  const { state, tool, choose, pick, disabled, selected, onRotate } = props;
  return (
    <>
      {selected ? (
        <EditHeader
          name={String(selected.properties.name ?? "zone")}
          label="All zones"
          onDone={() => state.select(null)}
        />
      ) : (
        <>
          <PlacingBanner
            tool={tool}
            what={`zone ${zoneNumber}`}
            how="Click the corners, then click the first corner again to finish."
            choose={choose}
          />
          <fieldset disabled={disabled}>
            <legend>Zones</legend>
            <label>
              Draw as zone
              <select value={zoneNumber} onChange={(e) => setZoneNumber(Number(e.target.value))}>
                {ZONE_HELP.map((_, n) => (
                  <option key={n} value={n}>
                    Zone {n}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">{ZONE_HELP[zoneNumber]}</p>
            <div className="editor-tools">
              <ToolButton tool="select" current={tool} label="Select / edit" choose={choose} />
              <ToolButton tool="zone" current={tool} label="Draw zone" choose={choose} />
            </div>
            {tool === "select" && (
              <p className="muted">
                Click the corners, then click the first corner again to finish.
              </p>
            )}
          </fieldset>
          <FeatureList
            title="Zones"
            features={zones}
            selectedId={state.selectedId}
            onPick={pick}
            empty="No zones yet. Start with the area around the house."
            label={(f) =>
              `${f.properties.name ?? "zone"} · zone ${Number(f.properties.zone_number ?? 1)}`
            }
          />
        </>
      )}
      <FeatureProperties
        selected={selected}
        layers={state.document.layers}
        onChange={state.upsert}
        onDelete={state.remove}
        onRotate={onRotate}
      />
    </>
  );
}
