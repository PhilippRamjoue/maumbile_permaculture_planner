import { useQuery } from "@tanstack/react-query";

import type { AttributionResponse, DataSource, ImageryMeta } from "../../entities/imagery";
import { apiFetch } from "../../shared/api/client";
import { useImageryMeta } from "../map/imageryMeta";

const creditsKeys = {
  all: ["credits", "all"] as const,
  keys: (keys: string[]) => ["credits", "keys", ...keys] as const,
};

/** Every source the platform can use (`GET /regions/attribution`). Public. */
export function useAllSources() {
  return useQuery({
    queryKey: creditsKeys.all,
    queryFn: async () => (await apiFetch<AttributionResponse>("/regions/attribution")).sources,
    staleTime: 60 * 60_000,
  });
}

/** Sources straight from the imagery meta, when it already carries license + terms. */
function sourcesFromMeta(meta: ImageryMeta): DataSource[] | null {
  if (!meta.covered || !meta.provider_key) return [];
  if (meta.license && meta.terms_url && meta.attribution) {
    return [
      {
        key: meta.provider_key,
        category: "imagery",
        attribution: meta.attribution,
        license: meta.license,
        terms_url: meta.terms_url,
      },
    ];
  }
  return null;
}

/**
 * The sources actually used by one site: from `/imagery/meta`, completed (license + terms link)
 * from the regions attribution endpoint when the meta only names the provider.
 */
export function useSiteSources(siteId: string) {
  const meta = useImageryMeta(siteId);
  const fromMeta = meta.data ? sourcesFromMeta(meta.data) : null;
  const providerKey = meta.data?.provider_key;

  const lookup = useQuery({
    queryKey: creditsKeys.keys(providerKey ? [providerKey] : []),
    queryFn: async () =>
      (
        await apiFetch<AttributionResponse>("/regions/attribution", {
          query: { keys: providerKey ?? undefined },
        })
      ).sources,
    enabled: Boolean(providerKey) && fromMeta === null,
    staleTime: 60 * 60_000,
  });

  if (fromMeta) return { sources: fromMeta, isPending: false, isError: false };
  if (meta.isError) return { sources: undefined, isPending: false, isError: true };
  if (lookup.isError) {
    // The meta still has the credit line; show that (license/terms unknown) rather than nothing.
    const fallback: DataSource[] | undefined = meta.data && [
      {
        key: meta.data.provider_key ?? "unknown",
        category: "imagery",
        attribution: meta.data.attribution ?? "",
        license: "",
        terms_url: "",
      },
    ];
    return { sources: fallback, isPending: false, isError: !fallback };
  }
  return { sources: lookup.data, isPending: meta.isPending || lookup.isPending, isError: false };
}
