import { describe, it, expect } from "vitest";
import { createEditorStore, savePayload, signature } from "./store";
import { measureGeometry } from "./measure";
import type { DesignFeature, PlanLayer } from "../../entities/planning";

const layer: PlanLayer = {
  id: "layer",
  plan_id: "plan",
  name: "Elements",
  visible: true,
  sort_order: 0,
  created_at: "",
};
const feature: DesignFeature = {
  type: "Feature",
  id: "one",
  layer_id: layer.id,
  feature_type: "element",
  element_type_id: null,
  properties: { name: "Tree" },
  geometry: { type: "Point", coordinates: [36.8, -1.3] },
};

describe("editor document history", () => {
  it("undoes geometry, properties and deletions together without mutating previous snapshots", () => {
    const store = createEditorStore({ layers: [layer], features: [feature] });
    const original = signature(store.getState().document);
    store.getState().upsert({
      ...feature,
      properties: { name: "Mango" },
      geometry: { type: "Point", coordinates: [36.81, -1.3] },
    });
    store.getState().remove(feature.id);
    store.getState().undo();
    expect(store.getState().document.features[0].properties.name).toBe("Mango");
    store.getState().undo();
    expect(signature(store.getState().document)).toBe(original);
    store.getState().redo();
    expect(store.getState().document.features[0].geometry.coordinates).toEqual([36.81, -1.3]);
    expect(feature.properties.name).toBe("Tree");
  });
  it("preserves dirty state across a failed save and drops redo history after a new edit", () => {
    const store = createEditorStore({ layers: [layer], features: [feature] });
    store.getState().remove(feature.id);
    expect(signature(store.getState().document)).not.toBe(store.getState().savedSignature);
    store.getState().undo();
    store
      .getState()
      .commit({ ...store.getState().document, layers: [{ ...layer, visible: false }] });
    expect(store.getState().future).toHaveLength(0);
    store.getState().markSaved(store.getState().document);
    expect(store.getState().savedSignature).toBe(signature(store.getState().document));
  });
  it("sends deletions for persisted features, never transient undone additions", () => {
    const store = createEditorStore({ layers: [layer], features: [feature] });
    store.getState().upsert({ ...feature, id: "new" });
    store.getState().remove("new");
    store.getState().remove("one");
    expect(savePayload(store.getState().document, store.getState().persistedIds)).toEqual({
      features: [],
      deletedIds: ["one"],
    });
  });
});

describe("editor geodesic measurements", () => {
  it("measures real metres at the equator and square metres with perimeter", () => {
    const line = measureGeometry({
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.001, 0],
      ],
    });
    expect(line.length_m).toBeCloseTo(111.195, 1);
    const polygon = measureGeometry({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0.001, 0],
          [0.001, 0.001],
          [0, 0.001],
          [0, 0],
        ],
      ],
    });
    expect(polygon.area_m2).toBeGreaterThan(12_300);
    expect(polygon.length_m).toBeCloseTo(444.78, 1);
    expect(measureGeometry(feature.geometry)).toEqual({ length_m: 0, area_m2: 0 });
  });
});
