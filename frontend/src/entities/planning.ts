import type { LineString, Point, Polygon } from "geojson";

import type { PlanGoals } from "./generated/plan";

export type DesignGeometry = Point | LineString | Polygon;
export type FeatureType = "zone" | "sector" | "element" | "path" | "annotation";
export interface PlanLayer {
  id: string;
  plan_id: string;
  name: string;
  sort_order: number;
  visible: boolean;
  created_at: string;
}
export interface Plan {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  /** What the owner wants from the land; null until they say. */
  goals: PlanGoals | null;
  created_at: string;
  updated_at: string;
}
export interface PlanDetail extends Plan {
  layers: PlanLayer[];
}
export interface DesignFeature {
  type: "Feature";
  id: string;
  layer_id: string;
  feature_type: FeatureType;
  element_type_id: number | null;
  geometry: DesignGeometry;
  properties: Record<string, unknown>;
}
export interface SavedFeature extends DesignFeature {
  plan_id: string;
  length_m: number;
  area_m2: number;
  created_at: string;
  updated_at: string;
}
export interface FeatureCollection {
  type: "FeatureCollection";
  features: SavedFeature[];
}
export interface ElementType {
  id: number;
  key: string;
  name: string;
  category: string;
  feature_type: FeatureType;
  geometry_type: "point" | "line" | "polygon";
  icon: string | null;
  default_style: Record<string, string | number | boolean>;
  /** Properties a placed element starts with, notably its typical `needs` and `yields`. */
  default_properties: Record<string, unknown>;
  sort_order: number;
}
