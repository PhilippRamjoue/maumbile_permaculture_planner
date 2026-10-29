import { apiBlob, apiFetch } from "../shared/api/client";
import type { SiteImported } from "./generated/export";

export type { SiteImported };

/**
 * Export a whole site (boundary + all its plans) as a portable `.maumbile.json` file, and import
 * such a file into the signed-in account as a fresh, independently editable site. The import body
 * is the parsed bundle; the backend validates it and owns the new site.
 */
export const siteBundleApi = {
  export: (siteId: string) => apiBlob(`/sites/${encodeURIComponent(siteId)}/export/bundle`),
  import: (bundle: unknown) =>
    apiFetch<SiteImported>("/sites/import", { method: "POST", body: bundle }),
};
