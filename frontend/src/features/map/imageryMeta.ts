import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { ImageryMeta, ImageryProviders } from "../../entities/imagery";
import { siteKeys } from "../../entities/siteQueries";
import { apiFetch } from "../../shared/api/client";

/** Every imagery-meta query of a site (prefix: invalidating it refetches whichever source is shown). */
export const imageryMetaKey = (siteId: string) =>
  [...siteKeys.detail(siteId), "imagery-meta"] as const;
export const imageryProvidersKey = (siteId: string) =>
  [...siteKeys.detail(siteId), "imagery-providers"] as const;

const imageryPath = (siteId: string) => `/sites/${encodeURIComponent(siteId)}/imagery`;

/**
 * Attribution, provider and zoom limits for the site's imagery (`GET /sites/{id}/imagery/meta`).
 * `provider` names one of the sources that cover the site (see {@link useImageryProviders});
 * without it the region's own first choice is described. The previous answer stays on screen while
 * another source's loads, so switching never flashes the default imagery.
 */
export function useImageryMeta(siteId: string, provider?: string | null) {
  return useQuery({
    queryKey: [...imageryMetaKey(siteId), provider ?? "default"],
    queryFn: () =>
      apiFetch<ImageryMeta>(
        `${imageryPath(siteId)}/meta${provider ? `?provider=${encodeURIComponent(provider)}` : ""}`,
      ),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/** The satellite sources that cover the site (`GET /sites/{id}/imagery/providers`). */
export function useImageryProviders(siteId: string) {
  return useQuery({
    queryKey: imageryProvidersKey(siteId),
    queryFn: () => apiFetch<ImageryProviders>(`${imageryPath(siteId)}/providers`),
    staleTime: 10 * 60_000,
  });
}
