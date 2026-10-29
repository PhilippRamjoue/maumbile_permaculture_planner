import { useState } from "react";

import type { DesignFeature } from "../../../entities/planning";
import type { Site } from "../../../entities/site";
import { TerrainPanel } from "../../terrain";
import { FeatureProperties } from "../FeatureProperties";
import { SectorHelper } from "../SectorHelper";
import {
  defaultSectorRadius,
  kindLabel,
  sectorFeature,
  sectorKindOf,
  SECTOR_COLORS,
  SECTOR_KINDS,
  sunPathFeature,
  type SectorKind,
} from "../sectors";
import { EditHeader, PlacingBanner, ToolButton, type PanelProps } from "./common";
import { SectorOverview } from "./SectorOverview";

/**
 * Sectors & terrain focus: what the site is subject to. Adding is kind-first and uniform — pick any
 * kind (sun included, with no privileged button of its own), then add it: one click drops a wedge
 * at the site centre to drag into place, or draw it by hand, as a rectangle, or from bearings. The
 * chosen kind is shared with the map, so a hand-drawn sector takes it too. Terrain shows slope and
 * contours beneath them.
 */
export function SectorsPanel({
  props,
  site,
  sectors,
  sectorsLayerId,
  hiddenKinds,
  onToggleKind,
  onAdd,
  kind,
  onKindChange,
}: {
  props: PanelProps;
  site: Site;
  sectors: readonly DesignFeature[];
  sectorsLayerId: string | undefined;
  hiddenKinds: ReadonlySet<SectorKind>;
  onToggleKind(kind: SectorKind, shown: boolean): void;
  onAdd(feature: DesignFeature): void;
  /** The kind the add tools create — lifted to the workspace so a drawn sector takes it too. */
  kind: SectorKind;
  onKindChange(kind: SectorKind): void;
}) {
  const { state, tool, choose, pick, disabled, selected, onRotate } = props;
  const radiusM = defaultSectorRadius(site.bbox);
  const [bearingsOpen, setBearingsOpen] = useState(false);
  // One click adds the chosen kind: a wedge at the site centre to aim by dragging. Sun fills in
  // today's path; any other kind starts as a north-facing 90° wedge.
  const addChosen = () => {
    if (!sectorsLayerId) return;
    const origin = site.centroid.coordinates as [number, number];
    const id = crypto.randomUUID();
    const feature =
      kind === "sun"
        ? (sunPathFeature(origin, radiusM, sectorsLayerId, id, new Date()) ??
          sectorFeature({ kind, from: 90, to: 270, origin, radiusM }, id, sectorsLayerId))
        : sectorFeature({ kind, from: 315, to: 45, origin, radiusM }, id, sectorsLayerId);
    onAdd(feature);
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
              A sector is a direction something reaches your land from. Pick its kind, then add it —
              any kind, and several of the same.
            </p>
            <div className="sector-kinds" role="radiogroup" aria-label="Sector kind">
              {SECTOR_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  className={`sector-kind${kind === k ? " sector-kind--on" : ""}`}
                  onClick={() => onKindChange(k)}
                >
                  <span className="sector-kind__dot" style={{ background: SECTOR_COLORS[k] }} />
                  {k === "sun" ? "☀ " : ""}
                  {kindLabel(k)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn--primary sector-add__go"
              disabled={!sectorsLayerId}
              onClick={addChosen}
            >
              Add {kindLabel(kind).toLowerCase()} sector{kind === "sun" ? " (today's path)" : ""}
            </button>
            <p className="muted">
              Dropped at the centre — drag it on the map to aim and size it. Or draw it yourself:
            </p>
            <div className="sector-add__grid" role="group" aria-label="How to add a sector">
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
              <ToolButton tool="select" current={tool} label="Select / edit" choose={choose} />
            </div>
            {bearingsOpen && (
              <SectorHelper
                origin={site.centroid.coordinates}
                defaultRadiusM={radiusM}
                layerId={sectorsLayerId}
                disabled={disabled}
                initialKind={kind}
                onAdd={onAdd}
              />
            )}
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
