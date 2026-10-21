import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../shared/api/client";
import type { Page, Site, SiteCreateRequest } from "./site";

export const siteKeys = {
  all: ["sites"] as const,
  list: () => [...siteKeys.all, "list"] as const,
  detail: (id: string) => [...siteKeys.all, "detail", id] as const,
};

const LIST_LIMIT = 100;

export const sitesApi = {
  list: () => apiFetch<Page<Site>>("/sites", { query: { limit: LIST_LIMIT } }),
  get: (id: string) => apiFetch<Site>(`/sites/${encodeURIComponent(id)}`),
  create: (body: SiteCreateRequest) => apiFetch<Site>("/sites", { method: "POST", body }),
};

export function useSites() {
  return useQuery({ queryKey: siteKeys.list(), queryFn: sitesApi.list });
}

export function useSite(id: string) {
  return useQuery({ queryKey: siteKeys.detail(id), queryFn: () => sitesApi.get(id) });
}
