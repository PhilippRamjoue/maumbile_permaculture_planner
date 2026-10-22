import { describe, expect, it } from "vitest";

import {
  dayOfYear,
  defaultSectorRadius,
  normalizeBearing,
  offsetPoint,
  redrawSector,
  sectorFeature,
  sectorProblem,
  sectorSpan,
  sectorWedge,
  sunPath,
} from "./sectors";

const nairobi: [number, number] = [36.82, -1.29];

describe("bearings", () => {
  it("folds into [0, 360)", () => {
    expect(normalizeBearing(-90)).toBe(270);
    expect(normalizeBearing(360)).toBe(0);
    expect(normalizeBearing(725.04)).toBe(5);
    expect(normalizeBearing(359.97)).toBe(0);
  });

  it("measures the clockwise span, wrapping through north", () => {
    expect(sectorSpan(0, 90)).toBe(90);
    expect(sectorSpan(315, 45)).toBe(90);
    expect(sectorSpan(90, 0)).toBe(270);
    expect(sectorSpan(10, 10)).toBe(0);
  });

  it("offsets north/east in metres", () => {
    const [lng, lat] = offsetPoint(nairobi, 0, 1000);
    expect(lng).toBeCloseTo(nairobi[0], 6);
    expect(lat - nairobi[1]).toBeCloseTo(1000 / 111_320, 5);
    expect(offsetPoint(nairobi, 90, 1000)[0]).toBeGreaterThan(nairobi[0]);
  });
});

describe("sector wedge", () => {
  it("is a closed ring from the origin along the arc and back", () => {
    const wedge = sectorWedge(nairobi, 0, 90, 100);
    const ring = wedge.coordinates[0];

    expect(ring[0]).toEqual(nairobi);
    expect(ring.at(-1)).toEqual(nairobi);
    // Origin + arc (90° / 5° steps + 1 points) + closing point.
    expect(ring).toHaveLength(1 + 19 + 1);
    // The arc starts due north and ends due east of the origin.
    expect(ring[1][0]).toBeCloseTo(nairobi[0], 6);
    expect(ring[1][1]).toBeGreaterThan(nairobi[1]);
    expect(ring[19][1]).toBeCloseTo(nairobi[1], 6);
    expect(ring[19][0]).toBeGreaterThan(nairobi[0]);
  });

  it("sweeps through north when the bearings wrap", () => {
    const ring = sectorWedge(nairobi, 315, 45, 100).coordinates[0];
    const arc = ring.slice(1, -1);

    expect(arc.every(([, lat]) => lat > nairobi[1])).toBe(true);
    expect(arc[0][0]).toBeLessThan(nairobi[0]);
    expect(arc.at(-1)![0]).toBeGreaterThan(nairobi[0]);
  });
});

describe("sector feature", () => {
  const spec = { kind: "wind" as const, from: 45, to: 135, origin: nairobi, radiusM: 80 };

  it("is a sector polygon that satisfies the planning API's property rules", () => {
    const feature = sectorFeature(spec, "id-1", "layer-1");

    expect(feature).toMatchObject({
      id: "id-1",
      layer_id: "layer-1",
      feature_type: "sector",
      element_type_id: null,
      geometry: { type: "Polygon" },
      properties: { sector_kind: "wind", bearing_from: 45, bearing_to: 135, radius_m: 80 },
    });
    for (const key of ["bearing_from", "bearing_to"]) {
      const value = feature.properties[key] as number;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(360);
    }
  });

  it("normalises bearings before storing them", () => {
    const feature = sectorFeature({ ...spec, from: -45, to: 450 }, "id", "layer");
    expect(feature.properties).toMatchObject({ bearing_from: 315, bearing_to: 90 });
  });

  it("redraws the wedge when bearings change, but leaves hand-drawn sectors alone", () => {
    const feature = sectorFeature(spec, "id", "layer");
    const edited = redrawSector({
      ...feature,
      properties: { ...feature.properties, bearing_to: 180 },
    });
    expect(edited.geometry).toEqual(sectorWedge(nairobi, 45, 180, 80));

    const drawn = {
      ...feature,
      properties: { sector_kind: "wind", bearing_from: 0, bearing_to: 90 },
    };
    expect(redrawSector(drawn)).toBe(drawn);
  });

  it("rejects unusable input", () => {
    expect(sectorProblem({ from: 10, to: 10, radiusM: 50 })).toMatch(/differ/);
    expect(sectorProblem({ from: 0, to: 90, radiusM: 1 })).toMatch(/Radius/);
    expect(sectorProblem({ from: NaN, to: 90, radiusM: 50 })).toMatch(/numeric/);
    expect(sectorProblem({ from: 0, to: 90, radiusM: 50 })).toBeNull();
  });

  it("defaults the radius to half the site's longer side", () => {
    // ~1.1 km north-south, ~1.1 km east-west at the equator.
    expect(defaultSectorRadius([36.8, -0.005, 36.81, 0.005])).toBe(560);
    expect(defaultSectorRadius([36.8, -0.00001, 36.80001, 0.00001])).toBe(20);
  });
});

describe("sun path", () => {
  const juneSolstice = dayOfYear("2026-06-21")!;
  const decemberSolstice = dayOfYear("2026-12-21")!;

  it("parses dates strictly", () => {
    expect(dayOfYear("2026-01-01")).toBe(1);
    expect(dayOfYear("2026-12-31")).toBe(365);
    expect(dayOfYear("2026-02-30")).toBeNull();
    expect(dayOfYear("21/06/2026")).toBeNull();
  });

  it("rises north of east in the northern summer and sweeps clockwise through south", () => {
    const path = sunPath(50, juneSolstice)!;

    expect(path.sunrise).toBeGreaterThan(45);
    expect(path.sunrise).toBeLessThan(55);
    expect(path.sunset).toBeCloseTo(360 - path.sunrise, 0);
    expect([path.from, path.to]).toEqual([path.sunrise, path.sunset]);
    expect(sectorSpan(path.from, path.to)).toBeGreaterThan(180);
  });

  it("passes north of an equatorial site at the June solstice (Nairobi)", () => {
    const path = sunPath(nairobi[1], juneSolstice)!;

    expect(path.sunrise).toBeCloseTo(66.6, 0);
    // From sunset round through north to sunrise: the short way, 133° wide.
    expect([path.from, path.to]).toEqual([path.sunset, path.sunrise]);
    expect(sectorSpan(path.from, path.to)).toBeCloseTo(133, 0);
  });

  it("passes south of Nairobi at the December solstice", () => {
    const path = sunPath(nairobi[1], decemberSolstice)!;

    expect(path.sunrise).toBeCloseTo(113.4, 0);
    expect([path.from, path.to]).toEqual([path.sunrise, path.sunset]);
    expect(sectorSpan(path.from, path.to)).toBeCloseTo(133, 0);
  });

  it("rises due east near the equinox", () => {
    // Cooper's declination is good to about a degree, so "due east" is within 2°.
    expect(Math.abs(sunPath(-1.29, dayOfYear("2026-03-20")!)!.sunrise - 90)).toBeLessThan(2);
  });

  it("is undefined during polar day", () => {
    expect(sunPath(80, juneSolstice)).toBeNull();
  });
});
