import { describe, expect, it } from "vitest";

import type { SlopeGrid } from "../../../entities/terrain";
import { site, terrainEmpty, terrainReady } from "../../../shared/testing/fixtures";
import { LayerSynchronizer, type MapLike } from "./applyLayers";
import { createLayerRegistry } from "./registry";
import { slopeBlocks, slopeOverlayGeoJSON } from "./slopeOverlay";
import { terrainContoursLayer, terrainSlopeLayer } from "./terrainLayers";

const grid = terrainReady.slope_grid!;
const legend = terrainReady.slope!.legend;

describe("slope overlay geometry", () => {
  it("merges runs of equal slope class into rectangles", () => {
    const blocks = slopeBlocks(grid);

    // Fixture rows: [0,0,1] / [1,1,1] / [null,2,2]
    expect(blocks).toHaveLength(4);
    expect(blocks).toContainEqual({ col0: 0, col1: 2, row0: 0, row1: 1, cls: 0 });
    expect(blocks).toContainEqual({ col0: 1, col1: 3, row0: 2, row1: 3, cls: 2 });
  });

  it("stacks identical runs of consecutive rows", () => {
    const flat: SlopeGrid = {
      ...grid,
      width: 2,
      height: 3,
      classes: [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    };
    expect(slopeBlocks(flat)).toEqual([{ col0: 0, col1: 2, row0: 0, row1: 3, cls: 0 }]);
  });

  it("leaves unknown cells empty", () => {
    const unknown: SlopeGrid = { ...grid, width: 2, height: 1, classes: [[null, 1]] };
    expect(slopeBlocks(unknown)).toEqual([{ col0: 1, col1: 2, row0: 0, row1: 1, cls: 1 }]);
  });

  it("georeferences cells from the north-west corner, row 0 being north", () => {
    const one: SlopeGrid = { ...grid, width: 1, height: 2, classes: [[null], [2]] };
    const [feature] = slopeOverlayGeoJSON(one, legend).features;

    const ring = feature.geometry.coordinates[0][0];
    const { west, north, pixel_width_deg: w, pixel_height_deg: h } = grid;
    expect(ring[0]).toEqual([west, north - h]);
    expect(ring[2]).toEqual([west + w, north - 2 * h]);
    expect(ring[0]).toEqual(ring[4]);
    expect(feature.properties).toEqual({ class_index: 2, label: "Steep", color: "#f4511e" });
  });

  it("produces one coloured feature per class and memoises per grid", () => {
    const collection = slopeOverlayGeoJSON(grid, legend);

    expect(collection.features.map((f) => f.properties.class_index)).toEqual([0, 1, 2]);
    expect(slopeOverlayGeoJSON(grid, legend)).toBe(collection);
  });
});

describe("terrain layers", () => {
  const context = (terrain: typeof terrainReady | undefined) => ({
    site,
    imagery: undefined,
    terrain,
  });

  it("are toggleable members of the terrain group, slope off and contours on by default", () => {
    for (const layer of [terrainSlopeLayer, terrainContoursLayer]) {
      expect(layer).toMatchObject({ toggleable: true, group: "terrain" });
    }
    expect(terrainSlopeLayer.defaultVisible).toBe(false);
    expect(terrainContoursLayer.defaultVisible).toBe(true);
  });

  it("draw nothing until terrain is ready", () => {
    for (const terrain of [
      undefined,
      terrainEmpty,
      { ...terrainReady, status: "running" as const },
    ]) {
      expect(terrainSlopeLayer.build(context(terrain))).toBeNull();
      expect(terrainContoursLayer.build(context(terrain))).toBeNull();
    }
  });

  it("draw nothing when the backend found no contours or no slope grid", () => {
    const bare = {
      ...terrainReady,
      contours: { type: "FeatureCollection" as const, features: [] },
      slope_grid: null,
    };
    expect(terrainContoursLayer.build(context(bare))).toBeNull();
    expect(terrainSlopeLayer.build(context(bare))).toBeNull();
  });

  it("render contours with heavier index lines", () => {
    const spec = terrainContoursLayer.build(context(terrainReady))!;

    expect(spec.sources["terrain-contours"]).toMatchObject({
      type: "geojson",
      data: terrainReady.contours,
    });
    expect(spec.layers.map((l) => l.id)).toEqual([
      "terrain-contours-line",
      "terrain-contours-index",
    ]);
    const widths = spec.layers.map((l) => (l.paint as Record<string, number>)["line-width"]);
    expect(widths[1]).toBeGreaterThan(widths[0]);
  });

  it("render the slope classes with the legend colours", () => {
    const spec = terrainSlopeLayer.build(context(terrainReady))!;

    expect(spec.layers).toMatchObject([
      { id: "terrain-slope-fill", type: "fill", paint: { "fill-color": ["get", "color"] } },
    ]);
  });
});

function fakeMap() {
  const layers: string[] = [];
  const visibility = new Map<string, unknown>();
  const map: MapLike = {
    getSource: () => ({}),
    addSource: () => {},
    removeSource: () => {},
    getLayer: (id) => (layers.includes(id) ? {} : undefined),
    addLayer: (layer) => layers.push(layer.id),
    removeLayer: (id) => layers.splice(layers.indexOf(id), 1),
    moveLayer: () => {},
    setLayoutProperty: (id, _name, value) => visibility.set(id, value),
  };
  return { map, layers, visibility };
}

describe("terrain layers on the synchronizer", () => {
  const registry = () => createLayerRegistry([terrainSlopeLayer, terrainContoursLayer]);

  it("appear when terrain becomes ready and disappear when it is recomputed", () => {
    const { map, layers } = fakeMap();
    const sync = new LayerSynchronizer(map, registry());

    sync.sync({ site, imagery: undefined, terrain: terrainEmpty }, () => true);
    expect(layers).toEqual([]);

    sync.sync({ site, imagery: undefined, terrain: terrainReady }, () => true);
    expect(layers).toEqual([
      "terrain-slope-fill",
      "terrain-contours-line",
      "terrain-contours-index",
    ]);

    sync.sync(
      { site, imagery: undefined, terrain: { ...terrainReady, status: "pending" } },
      () => true,
    );
    expect(layers).toEqual([]);
  });

  it("toggle through visibility without rebuilding", () => {
    const { map, visibility } = fakeMap();
    const sync = new LayerSynchronizer(map, registry());
    const ctx = { site, imagery: undefined, terrain: terrainReady };

    sync.sync(ctx, (d) => d.defaultVisible);

    expect(visibility.get("terrain-slope-fill")).toBe("none");
    expect(visibility.get("terrain-contours-line")).toBe("visible");
  });
});
