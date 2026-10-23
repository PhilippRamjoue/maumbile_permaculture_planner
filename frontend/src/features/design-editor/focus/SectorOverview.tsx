import type { DesignFeature } from "../../../entities/planning";
import {
  SECTOR_COLORS,
  SECTOR_KINDS,
  kindLabel,
  sectorKindOf,
  sectorSummary,
  type SectorKind,
} from "../sectors";

/**
 * Every sector of the design in one place: a show/hide switch per kind (to read the map when
 * several overlap) and the list of sectors, each selectable for editing and removable. Any number
 * of sectors of one kind is fine, e.g. a dry-season and a rainy-season wind.
 */
export function SectorOverview({
  sectors,
  selectedId,
  hiddenKinds,
  disabled,
  onPick,
  onDelete,
  onToggleKind,
}: {
  sectors: readonly DesignFeature[];
  selectedId: string | null;
  hiddenKinds: ReadonlySet<SectorKind>;
  disabled: boolean;
  onPick(id: string): void;
  onDelete(id: string): void;
  onToggleKind(kind: SectorKind, shown: boolean): void;
}) {
  const count = (kind: SectorKind) => sectors.filter((s) => sectorKindOf(s) === kind).length;
  const kinds = SECTOR_KINDS.filter((kind) => count(kind) > 0);
  return (
    <section aria-label="Sector overview" className="sector-overview">
      <h2>Your sectors ({sectors.length})</h2>
      {sectors.length === 0 ? (
        <p className="muted">
          No sectors yet. Add the sun's path or the direction the prevailing wind comes from.
        </p>
      ) : (
        <>
          <fieldset className="sector-overview__kinds">
            <legend>Show on the map</legend>
            {kinds.map((kind) => (
              <label key={kind} className="sector-overview__kind">
                <input
                  type="checkbox"
                  checked={!hiddenKinds.has(kind)}
                  onChange={(event) => onToggleKind(kind, event.target.checked)}
                />
                <span
                  className="sector-overview__swatch"
                  style={{ background: SECTOR_COLORS[kind] }}
                  aria-hidden="true"
                />
                {kindLabel(kind)} ({count(kind)})
              </label>
            ))}
          </fieldset>
          <ul className="editor-feature-list sector-overview__list">
            {sectors.map((sector) => {
              const kind = sectorKindOf(sector);
              const name = String(sector.properties.name ?? kindLabel(kind));
              return (
                <li key={sector.id} className="sector-overview__item">
                  <button
                    type="button"
                    className="btn"
                    aria-pressed={sector.id === selectedId}
                    onClick={() => onPick(sector.id)}
                    title="Select to edit its kind and bearings"
                  >
                    <span
                      className="sector-overview__swatch"
                      style={{ background: SECTOR_COLORS[kind] }}
                      aria-hidden="true"
                    />
                    <span>
                      <strong>{name}</strong>
                      <small className="muted"> {sectorSummary(sector)}</small>
                    </span>
                    {hiddenKinds.has(kind) && <em className="muted"> (hidden)</em>}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={disabled}
                    aria-label={`Delete ${name}`}
                    onClick={() => onDelete(sector.id)}
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
