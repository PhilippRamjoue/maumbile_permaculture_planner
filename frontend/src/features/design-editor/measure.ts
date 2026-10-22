import area from "@turf/area";
import length from "@turf/length";
import type { DesignGeometry } from "../../entities/planning";

export interface Measurement {
  length_m: number;
  area_m2: number;
}
export function measureGeometry(geometry: DesignGeometry): Measurement {
  try {
    if (geometry.type === "Point") return { length_m: 0, area_m2: 0 };
    if (geometry.type === "LineString")
      return {
        length_m: length({ type: "Feature", properties: {}, geometry }, { units: "meters" }),
        area_m2: 0,
      };
    return {
      length_m: geometry.coordinates.reduce(
        (sum, ring) =>
          sum +
          length(
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: ring },
            },
            { units: "meters" },
          ),
        0,
      ),
      area_m2: area(geometry),
    };
  } catch {
    return { length_m: 0, area_m2: 0 }; // incomplete live drawing
  }
}
