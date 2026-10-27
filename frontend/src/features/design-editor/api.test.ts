import { afterEach, expect, it, vi } from "vitest";
import { createDesignWriter, persistDesign, planningApi } from "./api";
import type { DesignRead, PlanLayer } from "../../entities/planning";

const layer: PlanLayer = {
  id: "layer",
  plan_id: "plan",
  name: "Elements",
  visible: true,
  sort_order: 0,
  created_at: "",
};
const response = (revision: number): DesignRead => ({
  plan: {
    id: "plan",
    site_id: "site",
    name: "Plan",
    description: null,
    goals: null,
    revision,
    created_at: "",
    updated_at: "",
    layers: [layer],
  },
  features: { type: "FeatureCollection", features: [] },
});
afterEach(() => vi.restoreAllMocks());

it("serializes goal and document writes with the latest acknowledged revision", async () => {
  const write = vi
    .spyOn(planningApi, "writeDesign")
    .mockResolvedValueOnce(response(5))
    .mockResolvedValueOnce(response(6));
  const writer = createDesignWriter("plan", 4);
  await Promise.all([
    writer.write({ goals: { priorities: [], vision: "Water" } }),
    writer.write({ features: [] }),
  ]);
  expect(write.mock.calls.map((call) => call[1].expected_revision)).toEqual([4, 5]);
});

it("keeps the original revision after a failed atomic write", async () => {
  const write = vi
    .spyOn(planningApi, "writeDesign")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(response(5));
  const writer = createDesignWriter("plan", 4);
  await expect(writer.write({ features: [] })).rejects.toThrow("offline");
  await writer.write({ features: [] });
  expect(write.mock.calls.map((call) => call[1].expected_revision)).toEqual([4, 4]);
});

it("saves feature deletions atomically and omits unchanged layers", async () => {
  const write = vi.spyOn(planningApi, "writeDesign").mockResolvedValue(response(5));
  const writer = createDesignWriter("plan", 4);
  await persistDesign(writer, { features: [], layers: [layer] }, ["removed"], [layer]);
  expect(write).toHaveBeenCalledWith("plan", {
    expected_revision: 4,
    features: [],
    deleted_ids: ["removed"],
    layers: [],
  });
});
