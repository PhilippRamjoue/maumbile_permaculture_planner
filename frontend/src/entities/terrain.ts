import type { TerrainRead } from "./generated/terrain";

/** Backend-generated response contract for `GET`/`POST /sites/{id}/terrain`. */
export type {
  ContourCollection,
  ContourFeature,
  SlopeClass,
  SlopeGrid,
  SlopeSummary,
  TerrainRead,
} from "./generated/terrain";

export type TerrainStatus = TerrainRead["status"];

/** Statuses in which a background job is (or is about to be) running — keep polling. */
export const TERRAIN_IN_PROGRESS: readonly TerrainStatus[] = ["pending", "running"];
