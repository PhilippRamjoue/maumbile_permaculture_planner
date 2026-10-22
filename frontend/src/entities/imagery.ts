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

/** Backend-generated response contract for `GET /sites/{id}/imagery/meta`. */
export type { ImageryMeta } from "./generated/imagery";
