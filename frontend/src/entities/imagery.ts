/** Mirrors `SourceInfo` (backend/app/modules/regions/attribution.py) — one row of the credits page. */
export interface DataSource {
  key: string;
  category: string;
  attribution: string;
  license: string;
  terms_url: string;
  /** Always sent by `/regions/attribution`; absent when derived from imagery meta alone. */
  cacheable?: boolean;
}

export interface AttributionResponse {
  sources: DataSource[];
}

/**
 * `GET /sites/{id}/imagery/meta` (WP4, docs/ARCHITECTURE.md §6): the active provider's
 * attribution, max zoom and an availability flag. `license` / `terms_url` / `sources` are
 * optional extras — the UI falls back to `/regions/attribution` when they are absent.
 */
export interface ImageryMeta {
  provider: string;
  attribution: string;
  max_zoom: number;
  available: boolean;
  license?: string;
  terms_url?: string;
  sources?: DataSource[];
}
