import { safeLocalStorage } from "../../shared/safeLocalStorage";
import { useState } from "react";

import { GlyphIcon } from "./GlyphIcon";
import type { LegendEntry } from "./legend";

const STORAGE_KEY = "permaculture.legend.open";

const readOpen = () => safeLocalStorage.get(STORAGE_KEY) === "1";

/** A small colour key for the shapes on the map. */
function Swatch({ entry }: { entry: LegendEntry }) {
  if (entry.icon) return <GlyphIcon icon={entry.icon} color={entry.color} size={22} />;
  return (
    <span
      className="map-legend__swatch"
      data-shape={entry.shape}
      style={{ "--swatch": entry.color } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}

/**
 * The map key: a toggle button and, when open, a panel naming what the map shows for the current
 * design. Render it inside the map's `.map-tools` row; the panel opens above the button.
 */
export function MapLegend({ entries }: { entries: readonly LegendEntry[] }) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () =>
    setOpen((previous) => {
      safeLocalStorage.set(STORAGE_KEY, previous ? "0" : "1");
      return !previous;
    });
  const groups = [...new Set(entries.map((e) => e.group))];
  return (
    <>
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls="map-legend"
        onClick={toggle}
      >
        Legend
      </button>
      {open && (
        <section id="map-legend" className="map-legend" aria-label="Map legend">
          {entries.length === 0 ? (
            <p className="muted">Nothing drawn yet. What you add appears here.</p>
          ) : (
            groups.map((group) => (
              <div key={group}>
                <h3>{group}</h3>
                <ul>
                  {entries
                    .filter((e) => e.group === group)
                    .map((entry) => (
                      <li key={entry.key}>
                        <Swatch entry={entry} />
                        <span>{entry.label}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}
    </>
  );
}
