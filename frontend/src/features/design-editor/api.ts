import type {
  DesignFeature,
  FeatureCollection,
  ElementType,
  Plan,
  PlanDetail,
  PlanLayer,
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
};
export const planningApi = {
  list: (siteId: string) =>
    apiFetch<Page<Plan>>(`/sites/${siteId}/plans`, { query: { limit: 100 } }),
  create: (siteId: string, name: string) =>
    apiFetch<PlanDetail>(`/sites/${siteId}/plans`, { method: "POST", body: { name } }),
  get: (id: string) => apiFetch<PlanDetail>(`/plans/${id}`),
  updateGoals: (id: string, goals: PlanGoals) =>
    apiFetch<Plan>(`/plans/${id}`, { method: "PATCH", body: { goals } }),
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

/** Features are atomic; layer metadata uses existing idempotent PATCH endpoints. Report the
 * successful feature baseline even if a later layer PATCH fails, so a retry can delete newly
 * persisted features that the user subsequently removes from their local draft. */
export async function persistDesign(
  planId: string,
  snapshot: EditorDocument,
  persistedIds: string[],
  onFeaturesPersisted: (ids: string[]) => void,
) {
  if (snapshot.features.length > 1000)
    throw new Error(
      "A plan can save up to 1,000 features. Split larger designs into separate plans.",
    );
  const payload = savePayload(snapshot, persistedIds);
  const result = await planningApi.save(planId, payload.features, payload.deletedIds);
  onFeaturesPersisted(result.features.map((feature) => feature.id));
  const layers = await Promise.all(snapshot.layers.map(planningApi.layer));
  return { snapshot, result, layers };
}
