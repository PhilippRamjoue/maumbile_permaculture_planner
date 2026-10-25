import distance from "@turf/distance";
import { describe, expect, it } from "vitest";

import type { DesignFeature } from "../../entities/planning";
import {
  centerOf,
  defaultFootprint,
  footprintLabel,
  footprintOf,
  footprintPolygon,
  placementMode,
  rotationOf,
  sizeProblem,
  syncRotation,
  withFootprint,
  type Footprint,
} from "./footprint";
import { measureGeometry, orientedSize } from "./measure";

// Near the equator, like the owner's plot in Tanzania.
const CLICK: [number, number] = [35.74, -3.37];
const metres = (a: number[], b: number[]) => distance(a, b, { units: "kilometers" }) * 1000;

const feature = (footprint: Footprint): DesignFeature => ({
  type: "Feature",
  id: "f1",
  layer_id: "l1",
  feature_type: "element",
  element_type_id: 1,
  geometry: footprintPolygon(CLICK, footprint),
  properties: { name: "Thing", footprint },
});

describe("footprintPolygon", () => {
  it("draws a circle of the diameter about the click", () => {
    const tank: Footprint = { shape: "round", diameter_m: 2 };
    const polygon = footprintPolygon(CLICK, tank);
    const ring = polygon.coordinates[0]!;

    expect(ring[0]).toEqual(ring.at(-1)); // closed
    for (const point of ring.slice(0, -1)) expect(metres(CLICK, point)).toBeCloseTo(1, 1);
    // A circle of diameter 2 m has area pi, give or take the 32-gon.
    expect(measureGeometry(polygon).area_m2).toBeCloseTo(Math.PI, 1);
    expect(centerOf(polygon)[0]).toBeCloseTo(CLICK[0], 6);
    expect(centerOf(polygon)[1]).toBeCloseTo(CLICK[1], 6);
  });

  it("draws a north-aligned rectangle of the width and length", () => {
    const bed: Footprint = { shape: "rect", width_m: 1.2, length_m: 4, rotation_deg: 0 };
    const polygon = footprintPolygon(CLICK, bed);
    const [sw, se, ne, nw] = polygon.coordinates[0]!;

    expect(polygon.coordinates[0]).toHaveLength(5);
    expect(metres(sw!, se!)).toBeCloseTo(1.2, 1); // west to east
    expect(metres(se!, ne!)).toBeCloseTo(4, 1); // south to north
    expect(sw![1]).toBeCloseTo(nw![1]! - 4 / 111_320, 6);
    expect(sw![1]).toBe(se![1]); // aligned with north
    expect(measureGeometry(polygon).area_m2).toBeCloseTo(4.8, 1);
    expect(orientedSize(polygon)).toEqual({
      long_m: expect.closeTo(4, 1),
      short_m: expect.closeTo(1.2, 1),
    });
  });

  it("turns a rectangle clockwise about its centre without changing its size", () => {
    const house: Footprint = { shape: "rect", width_m: 8, length_m: 6, rotation_deg: 90 };
    const polygon = footprintPolygon(CLICK, house);
    const [sw, se] = polygon.coordinates[0]!;

    // The south-west corner of an 8 x 6 house turned a quarter clockwise is the north-west one:
    // the first edge now runs south instead of east.
    expect(se![1]).toBeLessThan(sw![1]!);
    expect(metres(sw!, se!)).toBeCloseTo(8, 1);
    expect(measureGeometry(polygon).area_m2).toBeCloseTo(48, 0);
    expect(centerOf(polygon)[0]).toBeCloseTo(CLICK[0], 6);
    expect(rotationOf(polygon)).toBeCloseTo(90, 1);
  });

  it("stores no more decimals than the editor keeps", () => {
    const ring = footprintPolygon(CLICK, { shape: "round", diameter_m: 3 }).coordinates[0]!;
    for (const point of ring) for (const n of point) expect(Number(n.toFixed(8))).toBe(n);
  });
});

describe("withFootprint", () => {
  it("redraws the shape at its new size around the same centre", () => {
    const before = feature({ shape: "round", diameter_m: 2 });
    const after = withFootprint(before, { shape: "round", diameter_m: 6 });

    expect(footprintOf(after)).toEqual({ shape: "round", diameter_m: 6 });
    expect(after.properties.name).toBe("Thing");
    const [lng, lat] = centerOf(after.geometry as GeoJSON.Polygon);
    expect(lng).toBeCloseTo(CLICK[0], 6);
    expect(lat).toBeCloseTo(CLICK[1], 6);
    const ring = (after.geometry as GeoJSON.Polygon).coordinates[0]!;
    expect(metres(CLICK, ring[0]!)).toBeCloseTo(3, 1);
  });

  it("keeps the centre of a moved shape", () => {
    const moved: DesignFeature = {
      ...feature({ shape: "rect", width_m: 3, length_m: 3, rotation_deg: 0 }),
      geometry: footprintPolygon([CLICK[0] + 0.001, CLICK[1] - 0.002], {
        shape: "rect",
        width_m: 3,
        length_m: 3,
        rotation_deg: 0,
      }),
    };
    const after = withFootprint(moved, {
      shape: "rect",
      width_m: 5,
      length_m: 2,
      rotation_deg: 30,
    });
    const [lng, lat] = centerOf(after.geometry as GeoJSON.Polygon);
    // The bounding-box centre of a turned rectangle is still its centre.
    expect(lng).toBeCloseTo(CLICK[0] + 0.001, 6);
    expect(lat).toBeCloseTo(CLICK[1] - 0.002, 6);
  });
});

describe("syncRotation", () => {
  it("reads the turn back from the geometry the map rotated", () => {
    const turned: DesignFeature = {
      ...feature({ shape: "rect", width_m: 1.2, length_m: 4, rotation_deg: 0 }),
      geometry: footprintPolygon(CLICK, {
        shape: "rect",
        width_m: 1.2,
        length_m: 4,
        rotation_deg: 45,
      }),
    };
    const synced = syncRotation(turned);
    expect(footprintOf(synced)).toMatchObject({ rotation_deg: expect.closeTo(45, 1) });
  });

  it("leaves circles and shapes without a footprint alone", () => {
    const circle = feature({ shape: "round", diameter_m: 2 });
    expect(syncRotation(circle)).toBe(circle);
    const plain: DesignFeature = { ...circle, properties: { name: "Zone" } };
    expect(syncRotation(plain)).toBe(plain);
  });
});

describe("footprintOf", () => {
  const base = feature({ shape: "round", diameter_m: 2 });

  it("ignores missing, malformed or non-polygon footprints", () => {
    expect(footprintOf({ ...base, properties: {} })).toBeNull();
    expect(footprintOf({ ...base, properties: { footprint: "big" } })).toBeNull();
    expect(footprintOf({ ...base, properties: { footprint: { shape: "round" } } })).toBeNull();
    expect(
      footprintOf({ ...base, properties: { footprint: { shape: "rect", width_m: 2 } } }),
    ).toBeNull();
    expect(footprintOf({ ...base, geometry: { type: "Point", coordinates: CLICK } })).toBeNull();
  });

  it("defaults a rectangle's missing rotation to zero", () => {
    const found = footprintOf({
      ...base,
      properties: { footprint: { shape: "rect", width_m: 2, length_m: 3 } },
    });
    expect(found).toEqual({ shape: "rect", width_m: 2, length_m: 3, rotation_deg: 0 });
  });
});

describe("catalog helpers", () => {
  const type = {
    shape: "round" as const,
    default_diameter_m: 2,
    default_width_m: null,
    default_length_m: null,
  };

  it("builds a default footprint from the palette entry", () => {
    expect(defaultFootprint(type)).toEqual({ shape: "round", diameter_m: 2 });
    expect(
      defaultFootprint({
        shape: "rect",
        default_diameter_m: null,
        default_width_m: 1.2,
        default_length_m: 4,
      }),
    ).toEqual({ shape: "rect", width_m: 1.2, length_m: 4, rotation_deg: 0 });
    expect(defaultFootprint({ ...type, shape: "line", default_diameter_m: null })).toBeNull();
    expect(defaultFootprint({ ...type, default_diameter_m: null })).toBeNull();
    expect(defaultFootprint(undefined)).toBeNull();
  });

  it("collects footprints with a click, areas by drawing, lines point by point", () => {
    expect(placementMode({ shape: "round", geometry_type: "polygon" })).toBe("point");
    expect(placementMode({ shape: "rect", geometry_type: "polygon" })).toBe("point");
    expect(placementMode({ shape: "point", geometry_type: "point" })).toBe("point");
    expect(placementMode({ shape: "line", geometry_type: "line" })).toBe("linestring");
    expect(placementMode({ shape: "area", geometry_type: "polygon" })).toBe("rectangle");
    expect(placementMode(undefined)).toBe("point");
  });

  it("validates sizes", () => {
    expect(sizeProblem(2)).toBeNull();
    expect(sizeProblem(0.1)).toBeNull();
    expect(sizeProblem(0)).not.toBeNull();
    expect(sizeProblem(-3)).not.toBeNull();
    expect(sizeProblem(5000)).not.toBeNull();
    expect(sizeProblem(Number.NaN)).not.toBeNull();
  });

  it("labels a footprint as it would be said aloud", () => {
    expect(footprintLabel({ shape: "round", diameter_m: 2 })).toBe("Ø 2 m");
    expect(footprintLabel({ shape: "rect", width_m: 1.2, length_m: 4, rotation_deg: 10 })).toBe(
      "1.2 × 4 m",
    );
  });
});
