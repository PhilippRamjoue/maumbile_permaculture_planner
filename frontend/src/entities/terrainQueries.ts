import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../shared/api/client";
import { TERRAIN_IN_PROGRESS, type TerrainRead } from "./terrain";

export const terrainKeys = {
  all: ["terrain"] as const,
  site: (siteId: string) => [...terrainKeys.all, siteId] as const,
};

/** While a job is queued/running the status is re-read this often. */
export const TERRAIN_POLL_MS = 2000;

const terrainApi = {
  get: (siteId: string) => apiFetch<TerrainRead>(`/sites/${encodeURIComponent(siteId)}/terrain`),
  /** 202 = queued/in progress, 200 = already derived (only the status is returned). */
  request: (siteId: string, contourIntervalM?: number) =>
    apiFetch<TerrainRead>(`/sites/${encodeURIComponent(siteId)}/terrain`, {
      method: "POST",
      body: contourIntervalM === undefined ? undefined : { contour_interval_m: contourIntervalM },
    }),
};

/** Terrain for a site; polls by itself while the backend job is pending or running. */
export function useTerrain(siteId: string) {
  return useQuery({
    queryKey: terrainKeys.site(siteId),
    queryFn: () => terrainApi.get(siteId),
    refetchInterval: (query) =>
      query.state.data && TERRAIN_IN_PROGRESS.includes(query.state.data.status)
        ? TERRAIN_POLL_MS
        : false,
  });
}

/** Triggers the derivation; the status query then takes over (poll → ready). */
export function useRequestTerrain(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contourIntervalM?: number) => terrainApi.request(siteId, contourIntervalM),
    onSuccess: (body) => {
      const key = terrainKeys.site(siteId);
      // POST carries no contours/slope grid: a job in flight is tracked from its status alone, and a
      // result that is already stored is fetched in full.
      if (TERRAIN_IN_PROGRESS.includes(body.status)) queryClient.setQueryData(key, body);
      else void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
