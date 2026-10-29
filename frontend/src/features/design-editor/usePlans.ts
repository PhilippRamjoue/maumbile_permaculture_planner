import { useInfiniteQuery } from "@tanstack/react-query";

import { planningApi, planningKeys } from "./api";

/** The plans of a site, newest first, a page at a time (`GET /sites/{id}/plans`). */
export function usePlans(siteId: string) {
  return useInfiniteQuery({
    queryKey: planningKeys.plans(siteId),
    queryFn: ({ pageParam }) => planningApi.list(siteId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.items.length && last.offset + last.items.length < last.total
        ? last.offset + last.items.length
        : undefined,
  });
}
