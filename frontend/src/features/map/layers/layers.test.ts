import { describe, expect, it } from "vitest";

import { imageryMeta, site } from "../../../shared/testing/fixtures";
import { LayerSynchronizer, type MapLike } from "./applyLayers";
import { imageryLayer, imageryTileUrl } from "./imageryLayer";
import { createLayerRegistry } from "./registry";
import { siteBoundaryLayer } from "./siteBoundaryLayer";
import type { MapLayerDefinition } from "./types";

describe("layer registry", () => {
  const dummy = (id: string): MapLayerDefinition => ({
    id,
    label: id,
    toggleable: true,
    defaultVisible: true,
    build: () => null,
  });

  it("keeps registration order, which is draw order", () => {
    const registry = createLayerRegistry([dummy("a"), dummy("b")]);
    registry.register(dummy("c"));
    expect(registry.list().map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("rejects duplicate ids and supports unregister", () => {
    const registry = createLayerRegistry([dummy("a")]);
    expect(() => registry.register(dummy("a"))).toThrow(/already registered/);
    registry.unregister("a");
    expect(registry.get("a")).toBeUndefined();
  });
});

describe("imagery layer", () => {
  it("points a raster source at the backend tile proxy for the site", () => {
    const spec = imageryLayer.build({ site, imagery: imageryMeta })!;
    const source = spec.sources.imagery;

    expect(source).toMatchObject({ type: "raster", tileSize: 256, maxzoom: 19 });
    expect((source as { tiles: string[] }).tiles).toEqual([
      `http://localhost:3000/api/v1/sites/${site.id}/imagery/{z}/{x}/{y}.png`,
    ]);
    expect(spec.layers).toEqual([{ id: "imagery", type: "raster", source: "imagery" }]);
  });

  it("keeps the {z}/{x}/{y} placeholders unescaped", () => {
    expect(imageryTileUrl("a b")).toContain("/sites/a%20b/imagery/{z}/{x}/{y}.png");
  });

  it("uses the provider's max zoom from the meta", () => {
    const spec = imageryLayer.build({ site, imagery: { ...imageryMeta, max_zoom: 14 } })!;
    expect(spec.sources.imagery).toMatchObject({ maxzoom: 14 });
  });

  it("still shows tiles while the meta is loading", () => {
    expect(imageryLayer.build({ site, imagery: undefined })).not.toBeNull();
  });

  it("is omitted when the backend says imagery is unavailable", () => {
    expect(imageryLayer.build({ site, imagery: { ...imageryMeta, covered: false } })).toBeNull();
  });
});

describe("site boundary layer", () => {
  it("draws the site polygon as fill + outline", () => {
    const spec = siteBoundaryLayer.build({ site, imagery: undefined })!;
    expect(spec.layers.map((l) => l.type)).toEqual(["fill", "line"]);
    expect(spec.sources["site-boundary"]).toMatchObject({
      type: "geojson",
      data: { geometry: site.boundary },
    });
  });
});

/** Records calls against an in-memory map so sync behaviour can be asserted. */
function fakeMap() {
  const sources = new Set<string>();
  const layers: string[] = [];
  const visibility = new Map<string, unknown>();
  const log: string[] = [];
  const map: MapLike = {
    getSource: (id) => (sources.has(id) ? {} : undefined),
    addSource: (id) => (log.push(`+source ${id}`), sources.add(id)),
    removeSource: (id) => (log.push(`-source ${id}`), sources.delete(id)),
    getLayer: (id) => (layers.includes(id) ? {} : undefined),
    addLayer: (layer) => (log.push(`+layer ${layer.id}`), layers.push(layer.id)),
    removeLayer: (id) => (log.push(`-layer ${id}`), layers.splice(layers.indexOf(id), 1)),
    moveLayer: (id) => {
      log.push(`move ${id}`);
      layers.splice(layers.indexOf(id), 1);
      layers.push(id);
    },
    setLayoutProperty: (id, _name, value) => visibility.set(id, value),
  };
  return { map, layers, sources, visibility, log };
}

describe("LayerSynchronizer", () => {
  const always = () => true;

  it("adds every registry layer in order", () => {
    const { map, layers } = fakeMap();
    const sync = new LayerSynchronizer(map, createLayerRegistry([imageryLayer, siteBoundaryLayer]));

    sync.sync({ site, imagery: imageryMeta }, always);

    expect(layers).toEqual(["imagery", "site-boundary-fill", "site-boundary-line"]);
  });

  it("does not touch layers whose spec did not change", () => {
    const { map, log } = fakeMap();
    const sync = new LayerSynchronizer(map, createLayerRegistry([imageryLayer, siteBoundaryLayer]));
    sync.sync({ site, imagery: imageryMeta }, always);
    log.length = 0;

    sync.sync({ site, imagery: { ...imageryMeta } }, always);

    expect(log).toEqual([]);
  });

  it("replaces a changed layer and restacks the ones above it", () => {
    const { map, layers } = fakeMap();
    const sync = new LayerSynchronizer(map, createLayerRegistry([imageryLayer, siteBoundaryLayer]));
    sync.sync({ site, imagery: imageryMeta }, always);

    sync.sync({ site, imagery: { ...imageryMeta, max_zoom: 12 } }, always);

    expect(layers).toEqual(["imagery", "site-boundary-fill", "site-boundary-line"]);
  });

  it("removes imagery that becomes unavailable", () => {
    const { map, layers, sources } = fakeMap();
    const sync = new LayerSynchronizer(map, createLayerRegistry([imageryLayer]));
    sync.sync({ site, imagery: imageryMeta }, always);

    sync.sync({ site, imagery: { ...imageryMeta, covered: false } }, always);

    expect(layers).toEqual([]);
    expect(sources.size).toBe(0);
  });

  it("applies visibility without re-adding", () => {
    const { map, visibility, log } = fakeMap();
    const sync = new LayerSynchronizer(map, createLayerRegistry([siteBoundaryLayer]));
    sync.sync({ site, imagery: undefined }, always);
    log.length = 0;

    sync.sync({ site, imagery: undefined }, () => false);

    expect(visibility.get("site-boundary-line")).toBe("none");
    expect(log).toEqual([]);
  });

  it("picks up layers registered later and drops unregistered ones", () => {
    const { map, layers } = fakeMap();
    const registry = createLayerRegistry([imageryLayer]);
    const sync = new LayerSynchronizer(map, registry);
    sync.sync({ site, imagery: imageryMeta }, always);

    registry.register(siteBoundaryLayer);
    sync.sync({ site, imagery: imageryMeta }, always);
    expect(layers).toContain("site-boundary-line");

    registry.unregister(siteBoundaryLayer.id);
    sync.sync({ site, imagery: imageryMeta }, always);
    expect(layers).toEqual(["imagery"]);
  });

  it("dispose removes everything it added", () => {
    const { map, layers, sources } = fakeMap();
    const sync = new LayerSynchronizer(map, createLayerRegistry([imageryLayer, siteBoundaryLayer]));
    sync.sync({ site, imagery: imageryMeta }, always);

    sync.dispose();

    expect(layers).toEqual([]);
    expect(sources.size).toBe(0);
  });
});
