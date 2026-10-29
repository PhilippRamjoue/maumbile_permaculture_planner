import type { Feature, FeatureCollection, MultiPolygon } from "geojson";

import type { SlopeClass, SlopeGrid } from "../../../entities/terrain";

interface Block {
  col0: number;
  col1: number; // exclusive
  row0: number;
  row1: number; // exclusive
  cls: number;
}

/**
 * Merges the per-cell slope classes into as few rectangles as possible: horizontal runs of one
 * class first, then identical runs in consecutive rows are stacked. A 30 m DEM over a farm is
 * thousands of cells, but typically only dozens of blocks.
 */
export function slopeBlocks(grid: SlopeGrid): Block[] {
  const done: Block[] = [];
  let open = new Map<string, Block>();

  for (let row = 0; row < grid.height; row++) {
    const cells = grid.classes[row] ?? [];
    const next = new Map<string, Block>();
    let col = 0;
    while (col < grid.width) {
      const cls = cells[col] ?? null;
      let end = col + 1;
      while (end < grid.width && (cells[end] ?? null) === cls) end++;
      if (cls !== null) {
        const key = `${col}:${end}:${cls}`;
        const above = open.get(key);
        if (above) {
          above.row1 = row + 1;
          next.set(key, above);
          open.delete(key);
        } else {
          next.set(key, { col0: col, col1: end, row0: row, row1: row + 1, cls });
        }
      }
      col = end;
    }
    done.push(...open.values());
    open = next;
  }
  done.push(...open.values());
  return done;
}

interface SlopeFeatureProperties {
  class_index: number;
  label: string;
  color: string;
}

type SlopeCollection = FeatureCollection<MultiPolygon, SlopeFeatureProperties>;

const cache = new WeakMap<SlopeGrid, WeakMap<SlopeClass[], SlopeCollection>>();

/**
 * One MultiPolygon feature per slope class, coloured from the legend. Unknown cells are left out.
 * Memoised per grid object, because the layer spec is rebuilt on every map sync.
 */
export function slopeOverlayGeoJSON(grid: SlopeGrid, legend: SlopeClass[]): SlopeCollection {
  const cached = cache.get(grid)?.get(legend);
  if (cached) return cached;

  const x = (col: number) => grid.west + col * grid.pixel_width_deg;
  const y = (row: number) => grid.north - row * grid.pixel_height_deg;
  const byClass = new Map<number, MultiPolygon["coordinates"]>();
  for (const block of slopeBlocks(grid)) {
    if (!legend[block.cls]) continue;
    const ring = [
      [x(block.col0), y(block.row0)],
      [x(block.col1), y(block.row0)],
      [x(block.col1), y(block.row1)],
      [x(block.col0), y(block.row1)],
      [x(block.col0), y(block.row0)],
    ];
    const polygons = byClass.get(block.cls) ?? [];
    polygons.push([ring]);
    byClass.set(block.cls, polygons);
  }

  const features: Feature<MultiPolygon, SlopeFeatureProperties>[] = [...byClass]
    .sort(([a], [b]) => a - b)
    .map(([cls, coordinates]) => ({
      type: "Feature",
      properties: { class_index: cls, label: legend[cls].label, color: legend[cls].color },
      geometry: { type: "MultiPolygon", coordinates },
    }));
  const collection: SlopeCollection = { type: "FeatureCollection", features };
  const forGrid = cache.get(grid) ?? new WeakMap<SlopeClass[], SlopeCollection>();
  forGrid.set(legend, collection);
  cache.set(grid, forGrid);
  return collection;
}
