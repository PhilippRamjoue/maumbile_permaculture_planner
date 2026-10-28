import { useState } from "react";

import { useRequestTerrain, useTerrain } from "../../entities/terrainQueries";
import { layerRegistry } from "../map/layers/defaultRegistry";
import { TERRAIN_GROUP } from "../map/layers/terrainLayers";
import { isLayerVisible, useMapLayerStore } from "../map/store";
import { SlopeLegend, TerrainSummary } from "./TerrainPanel";

const STORAGE_KEY = "permaculture.terrainControl.open";

const readOpen = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * A compact terrain control that floats over the map in the design editor, so slope and contour
 * lines can be shown or hidden — and the land re-measured — from any step, not only the guided
 * Sectors & terrain panel. Toggling visibility never recomputes; "Recompute terrain" does, which is
 * how you refresh the slope after moving the border. `onEditBoundary` jumps to the boundary step.
 */
export function TerrainControl({
  siteId,
  onEditBoundary,
}: {
  siteId: string;
  /** Jump to the boundary step; omitted when the editor is already on it. */
  onEditBoundary?: () => void;
}) {
  const [open, setOpen] = useState(readOpen);
  const terrain = useTerrain(siteId);
  const request = useRequestTerrain(siteId);
  const overrides = useMapLayerStore((s) => s.overrides);
  const setVisible = useMapLayerStore((s) => s.setVisible);
  const layers = layerRegistry.list().filter((d) => d.group === TERRAIN_GROUP && d.toggleable);
  const data = terrain.data;
  const running = data?.status === "pending" || data?.status === "running";

  const toggle = () =>
    setOpen((previous) => {
      try {
        localStorage.setItem(STORAGE_KEY, previous ? "0" : "1");
      } catch {
        /* the choice just is not remembered */
      }
      return !previous;
    });

  const editBoundary = onEditBoundary && (
    <button type="button" className="btn" onClick={onEditBoundary}>
      Edit land boundary
    </button>
  );

  return (
    <span className="map-tool-popover">
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls="terrain-control"
        onClick={toggle}
      >
        Terrain
      </button>
      {open && (
        <section id="terrain-control" className="map-legend terrain-control" aria-label="Terrain">
          {data?.status === "ready" ? (
            <>
              <div className="terrain-control__toggles" role="group" aria-label="Show on the map">
                {layers.map((definition) => (
                  <label key={definition.id}>
                    <input
                      type="checkbox"
                      checked={isLayerVisible(definition, overrides)}
                      onChange={(e) => setVisible(definition.id, e.target.checked)}
                    />{" "}
                    {definition.label}
                  </label>
                ))}
              </div>
              <TerrainSummary terrain={data} />
              {data.slope && <SlopeLegend legend={data.slope.legend} />}
              <div className="editor-tools">
                <button
                  type="button"
                  className="btn"
                  disabled={request.isPending}
                  onClick={() => request.mutate(undefined)}
                >
                  {request.isPending ? "Recomputing…" : "Recompute terrain"}
                </button>
                {editBoundary}
              </div>
              <p className="muted">Recompute after you move the border, so the slope matches.</p>
            </>
          ) : running ? (
            <p role="status">Computing terrain… this can take up to a minute.</p>
          ) : (
            <>
              <p className="muted">
                Show slope and contour lines from a 30 m elevation model. Computing takes a moment.
              </p>
              <div className="editor-tools">
                <button
                  type="button"
                  className="btn"
                  disabled={request.isPending}
                  onClick={() => request.mutate(undefined)}
                >
                  {request.isPending ? "Starting…" : "Compute terrain"}
                </button>
                {editBoundary}
              </div>
            </>
          )}
          {request.isError && <p role="alert">Could not start terrain. Please try again.</p>}
        </section>
      )}
    </span>
  );
}
