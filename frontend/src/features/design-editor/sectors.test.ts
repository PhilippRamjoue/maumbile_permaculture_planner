import { describe, expect, it } from "vitest";

import {
  bearingBetween,
  dayOfYear,
  defaultSectorRadius,
  distanceBetween,
  isParametricSector,
  MAX_SECTOR_SPAN,
  MIN_SECTOR_SPAN,
  moveSectorOrigin,
  normalizeBearing,
  offsetPoint,
  redrawSector,
  SECTOR_COLORS,
  sectorFeature,
  sectorHandles,
  sectorKindOf,
  sectorProblem,
  sectorSpan,
  sectorSpecOf,
  sectorWedge,
  setSectorBearing,
  setSectorRadius,
  sunPath,
  sunPathFeature,
  syncSectorLook,
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

describe("sun sector for an equatorial site in Tanzania", () => {
  const origin: [number, number] = [36.588, -3.327];

  it("draws a real wedge on every day of the year, whichever way the sun passes", () => {
    for (let day = 1; day <= 365; day += 7) {
      const path = sunPath(origin[1], day)!;
      const feature = sectorFeature(
        { kind: "sun", from: path.from, to: path.to, origin, radiusM: 60 },
        "id",
        "layer",
      );
      const ring = (feature.geometry as GeoJSON.Polygon).coordinates[0];
      expect(ring.length).toBeGreaterThan(10);
      expect(sectorSpan(path.from, path.to)).toBeGreaterThan(120);
      expect(sectorSpan(path.from, path.to)).toBeLessThan(240);
      expect(feature.properties.sector_kind).toBe("sun");
    }
  });

  it("builds a one-click sun sector for a date", () => {
    // 23 October: the sun is south of this site at noon, rising south of east.
    const feature = sunPathFeature(origin, 60, "layer", "id", new Date(2026, 9, 23))!;
    expect(feature.properties).toMatchObject({ sector_kind: "sun", color: SECTOR_COLORS.sun });
    expect(feature.properties.bearing_from).toBeCloseTo(102.4, 0);
    expect(feature.properties.bearing_to).toBeCloseTo(257.6, 0);
  });

  it("has no sun sector when the sun never rises or sets", () => {
    expect(sunPathFeature([0, 80], 60, "layer", "id", new Date(2026, 5, 21))).toBeNull();
  });
});

describe("keeping a sector look in step with its kind and bearings", () => {
  const sun = sectorFeature(
    { kind: "sun", from: 315, to: 45, origin: [36.8, -1.2], radiusM: 50 },
    "id",
    "layer",
  );

  it("recolours and renames a generated sector when its kind changes", () => {
    const after = syncSectorLook(sun, {
      ...sun,
      properties: { ...sun.properties, sector_kind: "wind" },
    });
    expect(after.properties.color).toBe(SECTOR_COLORS.wind);
    expect(after.properties.name).toBe("Wind 315°–45°");
  });

  it("renames a generated sector when its bearings change", () => {
    const edited = redrawSector({
      ...sun,
      properties: { ...sun.properties, bearing_from: 100 },
    });
    expect(syncSectorLook(sun, edited).properties.name).toBe("Sun 100°–45°");
  });

  it("leaves a name and colour the user chose alone", () => {
    const custom = {
      ...sun,
      properties: { ...sun.properties, name: "Hot afternoon sun", color: "#123456" },
    };
    const after = syncSectorLook(custom, {
      ...custom,
      properties: { ...custom.properties, sector_kind: "fire" },
    });
    expect(after.properties.name).toBe("Hot afternoon sun");
    expect(after.properties.color).toBe("#123456");
  });

  it("treats a sector without a kind as wind", () => {
    expect(sectorKindOf({ properties: {} })).toBe("wind");
    expect(sectorKindOf({ properties: { sector_kind: "sun" } })).toBe("sun");
  });
});

describe("wedge coordinates are storable by the map editor", () => {
  const decimals = (n: number) => (String(n).split(".")[1] ?? "").length;

  it("rounds the tip too, even for an unrounded site centroid", () => {
    const wedge = sectorWedge([36.588374728697275, -3.326970021640812], 102, 258, 60);
    for (const [lng, lat] of wedge.coordinates[0]) {
      expect(decimals(lng)).toBeLessThanOrEqual(8);
      expect(decimals(lat)).toBeLessThanOrEqual(8);
    }
    expect(wedge.coordinates[0][0]).toEqual(wedge.coordinates[0].at(-1));
  });
});

describe("isParametricSector", () => {
  const sun = sectorFeature(
    { kind: "sun", from: 90, to: 270, origin: nairobi, radiusM: 60 },
    "s1",
    "layer",
  );

  it("is true for a sector made from an origin, radius and bearings", () => {
    expect(isParametricSector(sun)).toBe(true);
  });

  it("is false for a hand-drawn sector (no origin/radius) and for non-sectors", () => {
    const handDrawn = {
      ...sun,
      properties: { ...sun.properties, origin: undefined, radius_m: undefined },
    };
    expect(isParametricSector(handDrawn)).toBe(false);
    expect(isParametricSector({ ...sun, feature_type: "zone" })).toBe(false);
  });
});

describe("dragging a parametric sector on the map", () => {
  const origin: [number, number] = [36.82, -1.29];
  const sun = sectorFeature({ kind: "sun", from: 315, to: 45, origin, radiusM: 80 }, "s1", "layer");

  it("inverts offsetPoint: bearing and distance back to the same point", () => {
    const tip = offsetPoint(origin, 120, 250);
    expect(bearingBetween(origin, tip)).toBeCloseTo(120, 1);
    expect(distanceBetween(origin, tip)).toBeCloseTo(250, 0);
  });

  it("places a handle at the centre, each edge tip and the arc midpoint", () => {
    const handles = sectorHandles(sun);
    expect(handles.map((h) => h.role)).toEqual(["origin", "from", "to", "radius"]);
    expect(handles[0].point).toEqual(origin);
    expect(handles[1].point).toEqual(offsetPoint(origin, 315, 80));
    expect(handles[2].point).toEqual(offsetPoint(origin, 45, 80));
    // The arc midpoint sits due north (315 → 45 sweeps through 0).
    expect(handles[3].point).toEqual(offsetPoint(origin, 0, 80));
    expect(sectorHandles({ ...sun, properties: { ...sun.properties, origin: undefined } })).toEqual(
      [],
    );
  });

  it("moves the whole wedge, keeping its opening and radius", () => {
    const moved = moveSectorOrigin(sun, [36.9, -1.2]);
    expect(sectorSpecOf(moved)).toMatchObject({
      origin: [36.9, -1.2],
      from: 315,
      to: 45,
      radiusM: 80,
    });
    expect(moved.geometry).toEqual(sectorWedge([36.9, -1.2], 315, 45, 80));
  });

  it("opens the wedge by dragging an edge, the opposite edge staying put", () => {
    const wider = setSectorBearing(sun, "to", 120);
    expect(sectorSpecOf(wider)).toMatchObject({ from: 315, to: 120 });
    expect(sectorSpan(315, 120)).toBe(165);
    // Dragging the "from" edge leaves "to" where it was.
    const fromDrag = setSectorBearing(sun, "from", 270);
    expect(sectorSpecOf(fromDrag)).toMatchObject({ from: 270, to: 45 });
  });

  it("never lets the opening collapse or wrap fully", () => {
    const tiny = setSectorBearing(sun, "to", 316); // would be a 1° sliver past "from"
    expect(sectorSpan(sectorSpecOf(tiny)!.from, sectorSpecOf(tiny)!.to)).toBe(MIN_SECTOR_SPAN);
    const huge = setSectorBearing(sun, "to", 310); // would wrap almost all the way round
    expect(sectorSpan(sectorSpecOf(huge)!.from, sectorSpecOf(huge)!.to)).toBe(MAX_SECTOR_SPAN);
  });

  it("resizes by the arc handle, clamping the radius to a sane range", () => {
    expect(sectorSpecOf(setSectorRadius(sun, 150))!.radiusM).toBe(150);
    expect(sectorSpecOf(setSectorRadius(sun, 1))!.radiusM).toBe(5);
    expect(sectorSpecOf(setSectorRadius(sun, 1e9))!.radiusM).toBe(100_000);
  });

  it("keeps the generated name in step as the wedge is dragged", () => {
    expect(setSectorBearing(sun, "to", 90).properties.name).toBe("Sun 315°–90°");
  });
});
