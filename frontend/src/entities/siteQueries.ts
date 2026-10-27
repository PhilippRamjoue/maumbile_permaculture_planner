import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { apiFetch } from "../shared/api/client";
import type { Page, Site, SiteCreateRequest, SiteUpdateRequest } from "./site";

export const siteKeys = {
  all: ["sites"] as const,
  list: () => [...siteKeys.all, "list"] as const,
  detail: (id: string) => [...siteKeys.all, "detail", id] as const,
};

const LIST_LIMIT = 100;

export const sitesApi = {
  list: (offset = 0) => apiFetch<Page<Site>>("/sites", { query: { limit: LIST_LIMIT, offset } }),
  get: (id: string) => apiFetch<Site>(`/sites/${encodeURIComponent(id)}`),
  create: (body: SiteCreateRequest) => apiFetch<Site>("/sites", { method: "POST", body }),
  update: (id: string, body: SiteUpdateRequest) =>
    apiFetch<Site>(`/sites/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  remove: (id: string) => apiFetch<void>(`/sites/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export function useSites() {
  const query = useInfiniteQuery({
    queryKey: siteKeys.list(),
    queryFn: ({ pageParam }) => sitesApi.list(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.items.length && last.offset + last.items.length < last.total
        ? last.offset + last.items.length
        : undefined,
  });
  return {
    ...query,
    data: query.data
      ? { ...query.data.pages[0], items: query.data.pages.flatMap((page) => page.items) }
      : undefined,
  };
}

export function useSite(id: string) {
  return useQuery({ queryKey: siteKeys.detail(id), queryFn: () => sitesApi.get(id) });
}
