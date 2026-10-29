import { safeLocalStorage } from "../../shared/safeLocalStorage";
import { useState } from "react";

import type { ImageryProviders } from "../../entities/imagery";

const STORAGE_KEY = "permaculture.basemapSwitcher.open";

const readOpen = () => safeLocalStorage.get(STORAGE_KEY) === "1";

/**
 * A Google-Maps-style basemap switcher over the map: flip between the aerial and map layers that
 * cover the site (Esri, OpenStreetMap, Sentinel-2). Only the picture changes — geometry and
 * measurements come from coordinates, not the basemap, so nothing moves. The choice is remembered
 * per site (the workspace wires it through `useImageryChoice`). Hidden when there is nothing to
 * switch between.
 */
export function BasemapSwitcher({
  providers,
  selected,
  onSelect,
}: {
  providers: ImageryProviders | undefined;
  /** The active source key, or null for the region's default. */
  selected: string | null;
  onSelect(key: string): void;
}) {
  const [open, setOpen] = useState(readOpen);
  const options = providers?.providers ?? [];
  const active = selected ?? providers?.default_key ?? options[0]?.key;
  const toggle = () =>
    setOpen((previous) => {
      safeLocalStorage.set(STORAGE_KEY, previous ? "0" : "1");
      return !previous;
    });
  if (options.length < 2) return null; // nothing to switch between
  const activeOption = options.find((option) => option.key === active);
  // A low-max-zoom layer (Sentinel-2 ~13) is stretched and blurry when zoomed in close.
  const lowRes = activeOption ? activeOption.max_zoom < 16 : false;
  return (
    <span className="map-tool-popover">
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls="basemap-switcher"
        onClick={toggle}
      >
        Basemap
      </button>
      {open && (
        <section id="basemap-switcher" className="map-legend basemap-switcher" aria-label="Basemap">
          <div role="radiogroup" aria-label="Basemap">
            {options.map((option) => (
              <label className="basemap-switcher__option" key={option.key}>
                <input
                  type="radio"
                  name="basemap"
                  checked={option.key === active}
                  onChange={() => onSelect(option.key)}
                />{" "}
                {option.label}
              </label>
            ))}
          </div>
          {lowRes && (
            <p className="muted">
              Low-resolution: it blurs when you zoom in close — switch to Esri for fine tracing.
            </p>
          )}
          <p className="muted">
            Only the picture changes: lines, areas and measurements stay exactly where they are.
          </p>
        </section>
      )}
    </span>
  );
}
