import type {
  DesignFeature,
  FeatureCollection,
  ElementType,
  Plan,
  PlanDetail,
  PlanLayer,
  DesignRead,
} from "../../entities/planning";
import type { PlanGoals } from "../../entities/generated/plan";
import type { Page } from "../../entities/site";
import { apiFetch } from "../../shared/api/client";
import { savePayload, type EditorDocument } from "./store";

export const planningKeys = {
  plans: (siteId: string) => ["plans", siteId] as const,
  plan: (id: string) => ["plan", id] as const,
  features: (id: string) => ["plan", id, "features"] as const,
  types: ["element-types"] as const,
  design: (id: string) => ["design", id] as const,
};
export const planningApi = {
  list: (siteId: string, offset = 0) =>
    apiFetch<Page<Plan>>(`/sites/${siteId}/plans`, { query: { limit: 100, offset } }),
  create: (siteId: string, name: string) =>
    apiFetch<PlanDetail>(`/sites/${siteId}/plans`, { method: "POST", body: { name } }),
  get: (id: string) => apiFetch<PlanDetail>(`/plans/${id}`),
  design: (id: string) => apiFetch<DesignRead>(`/plans/${id}/design`),
  writeDesign: (id: string, body: DesignChanges & { expected_revision: number }) =>
    apiFetch<DesignRead>(`/plans/${id}/design`, { method: "PUT", body }),
  updateGoals: (id: string, goals: PlanGoals) =>
    apiFetch<Plan>(`/plans/${id}`, { method: "PATCH", body: { goals } }),
  rename: (id: string, name: string) =>
    apiFetch<Plan>(`/plans/${id}`, { method: "PATCH", body: { name } }),
  remove: (id: string) => apiFetch<void>(`/plans/${id}`, { method: "DELETE" }),
  features: (id: string) => apiFetch<FeatureCollection>(`/plans/${id}/features`),
  types: () => apiFetch<ElementType[]>("/element-types"),
  save: (id: string, features: DesignFeature[], deleted_ids: string[]) =>
    apiFetch<FeatureCollection>(`/plans/${id}/features:batch`, {
      method: "POST",
      body: { features, deleted_ids },
    }),
  layer: (layer: PlanLayer) =>
    apiFetch<PlanLayer>(`/layers/${layer.id}`, {
      method: "PATCH",
      body: { name: layer.name, visible: layer.visible, sort_order: layer.sort_order },
    }),
  measure: (geometry: DesignFeature["geometry"]) =>
    apiFetch<{ length_m: number; area_m2: number }>("/features:measure", {
      method: "POST",
      body: { geometry },
    }),
};

export interface DesignChanges {
  features?: DesignFeature[];
  deleted_ids?: string[];
  layers?: Pick<PlanLayer, "id" | "name" | "visible" | "sort_order">[];
  goals?: PlanGoals;
}

/** One queue per mounted editor: goals and geometry share a revision without racing each other. */
export function createDesignWriter(planId: string, initialRevision: number) {
  let revision = initialRevision;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    write(changes: DesignChanges) {
      const result = queue.then(async () => {
        const saved = await planningApi.writeDesign(planId, {
          ...changes,
          expected_revision: revision,
        });
        revision = saved.plan.revision;
        return saved;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
}
export type DesignWriter = ReturnType<typeof createDesignWriter>;

/** Features and changed layer metadata commit atomically under one revision check. */
export async function persistDesign(
  writer: DesignWriter,
  snapshot: EditorDocument,
  persistedIds: string[],
  savedLayers: PlanLayer[],
  savedFeatures: DesignFeature[] = [],
) {
  if (snapshot.features.length > 1000)
    throw new Error(
      "A plan can save up to 1,000 features. Split larger designs into separate plans.",
    );
  const payload = savePayload(snapshot, persistedIds);
  const baseline = new Map(savedFeatures.map((feature) => [feature.id, JSON.stringify(feature)]));
  const changedFeatures = payload.features.filter(
    (feature) => baseline.get(feature.id) !== JSON.stringify(feature),
  );
  const layers = snapshot.layers
    .filter((layer) => {
      const old = savedLayers.find((item) => item.id === layer.id);
      return (
        !old ||
        old.name !== layer.name ||
        old.visible !== layer.visible ||
        old.sort_order !== layer.sort_order
      );
    })
    .map(({ id, name, visible, sort_order }) => ({ id, name, visible, sort_order }));
  const saved = await writer.write({
    features: changedFeatures,
    deleted_ids: payload.deletedIds,
    layers,
  });
  return { snapshot, result: saved.features, layers: saved.plan.layers, plan: saved.plan };
}
