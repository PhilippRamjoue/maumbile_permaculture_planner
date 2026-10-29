import type { DesignFeature, PlanLayer } from "../../entities/planning";
import { LayerSynchronizer } from "../map/layers/applyLayers";
import { createLayerRegistry } from "../map/layers/registry";
import { designLayerSpecs } from "./designLayers";
import { OPEN_VIEW } from "./focus/view";

it("updates selection, geometry, visibility and order without rebuilding design sources", () => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const map = {
    addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
    getSource: (id: string) => sources.get(id),
    removeSource: vi.fn(),
    getLayer: vi.fn(() => true),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    moveLayer: vi.fn(),
    setLayoutProperty: vi.fn(),
  };
  const layers: PlanLayer[] = ["a", "b"].map((id, sort_order) => ({
    id,
    sort_order,
    name: id,
    visible: true,
    plan_id: "p",
    created_at: "",
  }));
  const feature: DesignFeature = {
    id: "f",
    type: "Feature",
    layer_id: "a",
    feature_type: "element",
    element_type_id: null,
    properties: {},
    geometry: { type: "Point", coordinates: [36.8, -1.2] },
  };
  const renderer = new LayerSynchronizer(map, createLayerRegistry());
  const sync = (selected: string | null, geometry = feature.geometry) => {
    const specs = designLayerSpecs(
      { layers, features: [{ ...feature, geometry }] },
      selected,
      null,
      OPEN_VIEW,
      -1.2,
    );
    renderer.syncSpecs(specs, (id) => layers.find((layer) => layer.id === id)?.visible ?? true);
    renderer.restack([...specs.keys()]);
  };
  sync(null);
  const original = sources.get("design-a");
  sync("f", { type: "Point", coordinates: [36.801, -1.2] });
  layers[0].visible = false;
  layers[0].sort_order = 3;
  sync("f");
  expect(map.addSource).toHaveBeenCalledTimes(2);
  expect(map.removeSource).not.toHaveBeenCalled();
  expect(sources.get("design-a")).toBe(original);
  expect(original?.setData).toHaveBeenCalled();
  expect(map.setLayoutProperty).toHaveBeenCalledWith("design-a-fill", "visibility", "none");
  expect(map.moveLayer.mock.calls.at(-1)).toEqual(["design-a-symbol"]);
  renderer.dispose();
  expect(map.removeSource).toHaveBeenCalledTimes(2);
});
