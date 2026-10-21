import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Site, SiteCreateRequest } from "../../entities/site";
import { siteKeys, sitesApi } from "../../entities/siteQueries";
import type { ApiError } from "../../shared/api/client";

/** `POST /sites`; refreshes the sites list and seeds the new site's detail cache. */
export function useCreateSite() {
  const queryClient = useQueryClient();
  return useMutation<Site, ApiError, SiteCreateRequest>({
    mutationFn: sitesApi.create,
    onSuccess: (site) => {
      queryClient.setQueryData(siteKeys.detail(site.id), site);
      return queryClient.invalidateQueries({ queryKey: siteKeys.list() });
    },
  });
}
