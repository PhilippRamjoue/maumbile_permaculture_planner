import { useState } from "react";

import type { SlopeClass, TerrainRead } from "../../entities/terrain";
import { useRequestTerrain, useTerrain } from "../../entities/terrainQueries";
import { ApiError } from "../../shared/api/client";
import { layerRegistry } from "../map/layers/defaultRegistry";
import type { LayerRegistry } from "../map/layers/registry";
import { TERRAIN_GROUP } from "../map/layers/terrainLayers";
import { isLayerVisible, useMapLayerStore } from "../map/store";

const INTERVALS_M = [1, 2, 5, 10, 20];

const FLAG_NOTES: Record<string, string> = {
  flat: "This site is almost flat at 30 m resolution, so there are few contour lines.",
  ocean: "Much of this area is open water; its elevation is not meaningful.",
  partial_nodata: "Part of the elevation data is missing; the slope there is left blank.",
  no_contours: "No contour lines at this interval. Try a smaller interval.",
};

const message = (error: unknown) =>
  error instanceof ApiError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "Something went wrong.";

const formatRange = (c: SlopeClass) =>
  c.max_pct === null ? `> ${c.min_pct}%` : `${c.min_pct}–${c.max_pct}%`;

/**
 * Slope colour key. Shown whenever terrain is ready, so the overlay is never unexplained. Each row
 * is one line — swatch, class, its slope range and its share of the mapped slope — so the key stays
 * compact enough to sit over the map.
 */
export function SlopeLegend({ legend }: { legend: SlopeClass[] }) {
  return (
    <ul className="terrain-legend" aria-label="Slope legend">
      {legend.map((c) => (
        <li key={c.label}>
          <span className="terrain-legend__swatch" style={{ background: c.color }} aria-hidden />
          <span className="terrain-legend__name">
            {c.label} <span className="muted">{formatRange(c)}</span>
          </span>
          <span className="muted">{Math.round(c.area_fraction * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

/** One-line elevation/slope summary for a ready terrain. */
export function TerrainSummary({ terrain }: { terrain: TerrainRead }) {
  const { slope } = terrain;
  if (!slope) return null;
  return (
    <p className="muted">
      Elevation {Math.round(slope.elevation_m.min)}–{Math.round(slope.elevation_m.max)} m (
      {Math.round(slope.elevation_m.relief)} m relief) · mean slope{" "}
      {slope.slope_pct.mean.toFixed(1)}%
      {terrain.contour_interval_m ? ` · contours every ${terrain.contour_interval_m} m` : ""}
    </p>
  );
}

/**
 * Terrain for one site: computes it on request, shows the status while the background job runs,
 * and then offers the contour/slope layer toggles, the slope legend, source credit and the
 * planning-aid notice. Rendered over the site map and in the design editor sidebar.
 */
export function TerrainPanel({
  siteId,
  registry = layerRegistry,
}: {
  siteId: string;
  registry?: LayerRegistry;
}) {
  const terrain = useTerrain(siteId);
  const request = useRequestTerrain(siteId);
  const overrides = useMapLayerStore((s) => s.overrides);
  const setVisible = useMapLayerStore((s) => s.setVisible);
  const [intervalChoice, setIntervalChoice] = useState<number | null>(null);

  const data = terrain.data;
  const layers = registry.list().filter((d) => d.group === TERRAIN_GROUP && d.toggleable);
  const chosenInterval = intervalChoice ?? data?.contour_interval_m ?? 5;
  const intervals = INTERVALS_M.includes(chosenInterval)
    ? INTERVALS_M
    : [...INTERVALS_M, chosenInterval].sort((a, b) => a - b);

  let body;
  if (terrain.isPending) {
    body = <p role="status">Loading terrain…</p>;
  } else if (terrain.isError && !data) {
    body = <p role="alert">Could not load terrain: {message(terrain.error)}</p>;
  } else if (data) {
    switch (data.status) {
      case "not_requested":
        body = (
          <>
            <p className="muted">
              Terrain has not been computed for this site. Contours and slope are derived from a 30
              m elevation model, which takes a moment.
            </p>
            <button
              type="button"
              className="btn"
              disabled={request.isPending}
              onClick={() => request.mutate(undefined)}
            >
              {request.isPending ? "Starting…" : "Compute terrain"}
            </button>
          </>
        );
        break;
      case "pending":
      case "running":
        body = <p role="status">Computing terrain… this can take up to a minute.</p>;
        break;
      case "failed":
      case "interrupted":
        body = (
          <>
            <p role="alert">
              {data.status === "interrupted"
                ? "Terrain computation was interrupted. Try again to restart it."
                : `Terrain could not be computed${data.error ? `: ${data.error}` : "."}`}
            </p>
            <button
              type="button"
              className="btn"
              disabled={request.isPending}
              onClick={() => request.mutate(undefined)}
            >
              {request.isPending ? "Starting…" : "Try again"}
            </button>
          </>
        );
        break;
      case "ready":
        body = (
          <>
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
            <TerrainSummary terrain={data} />
            <p className="muted">
              Estimates cover the rectangle around your land, including neighboring land, using
              available 30 m elevation data.
            </p>
            {data.slope && <SlopeLegend legend={data.slope.legend} />}
            {data.slope?.flags.map((flag) => (
              <p key={flag} className="notice" role="status">
                {FLAG_NOTES[flag] ?? flag}
              </p>
            ))}
            <label>
              Contour interval
              <select
                value={chosenInterval}
                disabled={request.isPending}
                onChange={(e) => setIntervalChoice(Number(e.target.value))}
              >
                {intervals.map((m) => (
                  <option key={m} value={m}>
                    {m} m
                  </option>
                ))}
              </select>
            </label>
            {chosenInterval !== data.contour_interval_m && (
              <button
                type="button"
                className="btn"
                disabled={request.isPending}
                onClick={() => request.mutate(chosenInterval)}
              >
                Update contours
              </button>
            )}
          </>
        );
        break;
    }
  }

  return (
    <section className="terrain-panel" aria-label="Terrain">
      <h2>Terrain</h2>
      {body}
      {request.isError && <p role="alert">{message(request.error)}</p>}
      {data?.status === "ready" && (
        <p className="muted terrain-panel__credit">
          {data.attribution} · {data.notice}
        </p>
      )}
    </section>
  );
}
