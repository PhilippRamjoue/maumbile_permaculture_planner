import { renderHook, waitFor } from "@testing-library/react";
import type { ElementType, PlanLayer } from "../../entities/planning";
import { createEditorStore } from "./store";
import { destinationLayer, useActiveLayer } from "./useActiveLayer";

const layer = (id: string, role: PlanLayer["role"], visible = true): PlanLayer => ({
  id,
  role,
  name: "Renamed by owner",
  visible,
  sort_order: 0,
  plan_id: "p",
  created_at: "",
});

it("reveals the intended layer and survives renaming instead of falling back to Elements", async () => {
  const store = createEditorStore({
    layers: [layer("e", "element"), layer("z", "zone", false)],
    features: [],
  });
  const { result } = renderHook(() => useActiveLayer(store, "zone", undefined));
  expect(result.current).toBe("z");
  await waitFor(() => expect(store.getState().document.layers[1].visible).toBe(true));
});

it("uses the actual palette feature type and never reuses a layer for a missing destination", () => {
  const store = createEditorStore({
    layers: [layer("e", "element"), layer("p", "path")],
    features: [],
  });
  const element = { feature_type: "path" } as ElementType;
  const { result } = renderHook(() => useActiveLayer(store, "element", element));
  expect(result.current).toBe("p");
  expect(destinationLayer(store.getState().document.layers, "zone")).toBeUndefined();
});

it("supports old server responses without reassigning custom layers", () => {
  expect(destinationLayer([{ ...layer("old", undefined), name: "Zones" }], "zone")?.id).toBe("old");
  expect(destinationLayer([{ ...layer("custom", null), name: "Zones" }], "zone")).toBeUndefined();
});
