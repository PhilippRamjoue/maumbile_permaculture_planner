/** GeoJSON geometries as served by the backend. */
export interface GeoPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

interface GeoPoint {
  type: "Point";
  coordinates: [number, number];
}

/** [min_lng, min_lat, max_lng, max_lat] */
export type BBox = [number, number, number, number];

/** Mirrors `SiteRead` (backend/app/modules/sites/schemas.py). */
export interface Site {
  id: string;
  owner_id: string | null;
  name: string;
  country_code: string | null;
  boundary: GeoPolygon;
  centroid: GeoPoint;
  bbox: BBox;
  area_m2: number;
  utm_epsg: number;
  created_at: string;
  updated_at: string;
}

/** Mirrors `Page[T]` (backend/app/core/pagination.py). */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Body of `PATCH /sites/{id}` (`SiteUpdate`); replacing `coordinates` recomputes centroid, bbox, area and UTM. */
export interface SiteUpdateRequest {
  expected_updated_at?: string;
  name?: string;
  country_code?: string;
  coordinates?: [number, number][];
}

/** Body of `POST /sites`(`SiteCreate`): `coordinates` is a ring of [lng, lat], closed or closable. */
export interface SiteCreateRequest {
  name: string;
  country_code?: string;
  coordinates: [number, number][];
}
