import { afterEach, expect, it, vi } from "vitest";
import { persistDesign, planningApi } from "./api";
import { createEditorStore, savePayload } from "./store";
import type { SavedFeature, PlanLayer } from "../../entities/planning";

afterEach(() => vi.restoreAllMocks());

it("tracks successful feature writes across a layer failure so retrying cannot leave ghost features", async () => {
  const layer: PlanLayer = {
    id: "layer",
    plan_id: "plan",
    name: "Elements",
    visible: true,
    sort_order: 0,
    created_at: "",
  };
  const store = createEditorStore({ features: [], layers: [layer] });
  const feature: SavedFeature = {
    type: "Feature",
    id: "new",
    layer_id: layer.id,
    plan_id: "plan",
    feature_type: "element",
    element_type_id: null,
    geometry: { type: "Point", coordinates: [36.8, -1.3] },
    properties: {},
    area_m2: 0,
    length_m: 0,
    created_at: "",
    updated_at: "",
  };
  store.getState().upsert(feature);
  vi.spyOn(planningApi, "save").mockResolvedValue({
    type: "FeatureCollection",
    features: [feature],
  });
  vi.spyOn(planningApi, "layer").mockRejectedValue(new Error("Layer unavailable"));
  await expect(
    persistDesign("plan", store.getState().document, [], (persistedIds) =>
      store.setState({ persistedIds }),
    ),
  ).rejects.toThrow("Layer unavailable");
  store.getState().remove("new");
  expect(savePayload(store.getState().document, store.getState().persistedIds).deletedIds).toEqual([
    "new",
  ]);
});
