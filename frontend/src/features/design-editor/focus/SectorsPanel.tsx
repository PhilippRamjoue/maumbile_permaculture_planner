import type { DesignFeature } from "../../../entities/planning";
import type { Site } from "../../../entities/site";
import { TerrainPanel } from "../../terrain";
import { FeatureProperties } from "../FeatureProperties";
import { SectorHelper } from "../SectorHelper";
import { defaultSectorRadius, sectorKindOf, sunPathFeature, type SectorKind } from "../sectors";
import { BackToAdding, ToolButton, type PanelProps } from "./common";
import { SectorOverview } from "./SectorOverview";

/**
 * Sectors & terrain focus: what the site is subject to. Sectors are added from bearings (the
 * easy way) or drawn by hand; terrain shows slope and contours beneath them.
 */
export function SectorsPanel({
  props,
  site,
  sectors,
  sectorsLayerId,
  hiddenKinds,
  onToggleKind,
  onAdd,
}: {
  props: PanelProps;
  site: Site;
  sectors: readonly DesignFeature[];
  sectorsLayerId: string | undefined;
  hiddenKinds: ReadonlySet<SectorKind>;
  onToggleKind(kind: SectorKind, shown: boolean): void;
  onAdd(feature: DesignFeature): void;
}) {
  const { state, tool, choose, pick, disabled, selected, onRotate } = props;
  const radiusM = defaultSectorRadius(site.bbox);
  const addSun = () => {
    if (!sectorsLayerId) return;
    const feature = sunPathFeature(
      site.centroid.coordinates,
      radiusM,
      sectorsLayerId,
      crypto.randomUUID(),
      new Date(),
    );
    if (feature) onAdd(feature);
  };
  return (
    <>
      {selected ? (
        <BackToAdding onBack={() => state.select(null)} />
      ) : (
        <>
          <fieldset disabled={disabled}>
            <legend>Add a sector</legend>
            <p className="muted">
              A sector is a direction something reaches your land from. Start with the sun, then add
              wind. You can add several of the same kind.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!sectorsLayerId}
              onClick={addSun}
            >
              ☀ Add the sun's path (today)
            </button>
            <div className="editor-tools">
              <ToolButton tool="select" current={tool} label="Select / edit" choose={choose} />
              <ToolButton
                tool="sector"
                current={tool}
                label="Draw sector by hand"
                choose={choose}
              />
              <ToolButton
                tool="sector-rect"
                current={tool}
                label="Rectangle sector"
                choose={choose}
              />
            </div>
            <p className="muted">
              A wedge suits what radiates from a direction (sun, wind); a rectangle suits a straight
              edge like a road or fence. Both can be any sector kind.
            </p>
            <SectorHelper
              origin={site.centroid.coordinates}
              defaultRadiusM={radiusM}
              layerId={sectorsLayerId}
              disabled={disabled}
              onAdd={onAdd}
            />
          </fieldset>
          <TerrainPanel siteId={site.id} />
          <SectorOverview
            sectors={sectors}
            selectedId={state.selectedId}
            hiddenKinds={hiddenKinds}
            disabled={disabled}
            onPick={(id) => {
              // Picking a hidden sector would edit something invisible: show its kind first.
              const picked = sectors.find((sector) => sector.id === id);
              if (picked) onToggleKind(sectorKindOf(picked), true);
              pick(id);
            }}
            onDelete={state.remove}
            onToggleKind={onToggleKind}
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
