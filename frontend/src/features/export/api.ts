import type { ShareCreated, ShareStatus } from "../../entities/generated/export";
import { apiBlob, apiFetch } from "../../shared/api/client";
import { API_BASE } from "../../shared/config";

export type ExportFormat = "geojson" | "png" | "pdf";
/** How many feature labels a PNG/PDF prints (ignored for GeoJSON). */
export type LabelMode = "all" | "tidy" | "none";

export const exportKeys = {
  share: (planId: string) => ["export", "share", planId] as const,
};

export const exportApi = {
  download: (planId: string, format: ExportFormat, labels: LabelMode = "tidy") =>
    apiBlob(`/plans/${planId}/export`, { query: { format, labels } }),
  shareStatus: (planId: string) => apiFetch<ShareStatus>(`/plans/${planId}/share`),
  createShare: (planId: string) =>
    apiFetch<ShareCreated>(`/plans/${planId}/share`, { method: "POST" }),
  revokeShare: (planId: string) => apiFetch<void>(`/plans/${planId}/share`, { method: "DELETE" }),
};

/** Public URL of a shared export. `inline` serves it for embedding (e.g. an `<img>`). */
export function sharedExportUrl(token: string, format: ExportFormat, inline = false): string {
  const query = new URLSearchParams({ format });
  if (inline) query.set("download", "false");
  return `${API_BASE}/shared/${encodeURIComponent(token)}/export?${query}`;
}

/** The page address to hand out for a share token. */
export function sharePageUrl(token: string): string {
  return `${window.location.origin}/shared/${encodeURIComponent(token)}`;
}

/** Hands a blob to the browser as a file download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
