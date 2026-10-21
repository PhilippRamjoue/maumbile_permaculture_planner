import { useQuery } from "@tanstack/react-query";

import type { ImageryMeta } from "../../entities/imagery";
import { siteKeys } from "../../entities/siteQueries";
import { apiFetch } from "../../shared/api/client";

export const imageryMetaKey = (siteId: string) =>
  [...siteKeys.detail(siteId), "imagery-meta"] as const;

/** Attribution, provider and zoom limits for the site's imagery (`GET /sites/{id}/imagery/meta`). */
export function useImageryMeta(siteId: string) {
  return useQuery({
    queryKey: imageryMetaKey(siteId),
    queryFn: () => apiFetch<ImageryMeta>(`/sites/${encodeURIComponent(siteId)}/imagery/meta`),
    staleTime: 10 * 60_000,
  });
}
