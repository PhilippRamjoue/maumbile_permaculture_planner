import { useState } from "react";

import type { DesignFeature } from "../../../entities/planning";
import type { Site } from "../../../entities/site";
import { TerrainPanel } from "../../terrain";
import { FeatureProperties } from "../FeatureProperties";
import { SectorHelper } from "../SectorHelper";
import { defaultSectorRadius, sectorKindOf, sunPathFeature, type SectorKind } from "../sectors";
import { EditHeader, PlacingBanner, ToolButton, type PanelProps } from "./common";
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
  const [bearingsOpen, setBearingsOpen] = useState(false);
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
        <EditHeader
          name={String(selected.properties.name ?? "sector")}
          label="All sectors"
          onDone={() => state.select(null)}
        />
      ) : (
        <>
          <PlacingBanner
            tool={tool}
            what={tool === "sector-rect" ? "a rectangular sector" : "a sector"}
            how={
              tool === "sector-rect"
                ? "Click opposite corners."
                : "Click the corners, then click the first corner again to finish."
            }
            choose={choose}
          />
          <fieldset className="sector-add" disabled={disabled}>
            <legend>Add a sector</legend>
            <p className="muted">
              A sector is a direction something reaches your land from — sun, wind, water, fire,
              views or noise. Add any kind, and several of the same.
            </p>
            <div className="sector-add__grid" role="group" aria-label="How to add a sector">
              <button
                type="button"
                className="btn"
                disabled={!sectorsLayerId}
                onClick={addSun}
                title="A wedge covering today's sun path across the sky"
              >
                ☀ Sun path (today)
              </button>
              <ToolButton tool="sector" current={tool} label="Draw by hand" choose={choose} />
              <ToolButton tool="sector-rect" current={tool} label="Rectangle" choose={choose} />
              <button
                type="button"
                className="btn"
                aria-expanded={bearingsOpen}
                onClick={() => setBearingsOpen((open) => !open)}
              >
                From bearings
              </button>
            </div>
            <p className="muted">
              A wedge suits what radiates from a direction (sun, wind); a rectangle suits a straight
              edge like a road or fence.
            </p>
            {bearingsOpen && (
              <SectorHelper
                origin={site.centroid.coordinates}
                defaultRadiusM={radiusM}
                layerId={sectorsLayerId}
                disabled={disabled}
                onAdd={onAdd}
              />
            )}
            <div className="editor-tools">
              <ToolButton tool="select" current={tool} label="Select / edit" choose={choose} />
            </div>
          </fieldset>
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
          <TerrainPanel siteId={site.id} />
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
