import type { DesignFeature } from "../../../entities/planning";
import type { Site } from "../../../entities/site";
import { TerrainPanel } from "../../terrain";
import { FeatureProperties } from "../FeatureProperties";
import { SectorHelper } from "../SectorHelper";
import { defaultSectorRadius } from "../sectors";
import { FeatureList, ToolButton, type PanelProps } from "./common";

/**
 * Sectors & terrain focus: what the site is subject to. Sectors are added from bearings (the
 * easy way) or drawn by hand; terrain shows slope and contours beneath them.
 */
export function SectorsPanel({
  props,
  site,
  sectors,
  sectorsLayerId,
  onAdd,
}: {
  props: PanelProps;
  site: Site;
  sectors: readonly DesignFeature[];
  sectorsLayerId: string | undefined;
  onAdd(feature: DesignFeature): void;
}) {
  const { state, tool, choose, pick, disabled, selected, onRotate } = props;
  return (
    <>
      <fieldset disabled={disabled}>
        <legend>Sectors</legend>
        <div className="editor-tools">
          <ToolButton tool="select" current={tool} label="Select / edit" choose={choose} />
          <ToolButton tool="sector" current={tool} label="Draw sector by hand" choose={choose} />
        </div>
        <SectorHelper
          origin={site.centroid.coordinates}
          defaultRadiusM={defaultSectorRadius(site.bbox)}
          layerId={sectorsLayerId}
          disabled={disabled}
          onAdd={onAdd}
        />
      </fieldset>
      <TerrainPanel siteId={site.id} />
      <FeatureList
        title="Sectors"
        features={sectors}
        selectedId={state.selectedId}
        onPick={pick}
        empty="No sectors yet. Add the direction of the afternoon sun or the prevailing wind."
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
