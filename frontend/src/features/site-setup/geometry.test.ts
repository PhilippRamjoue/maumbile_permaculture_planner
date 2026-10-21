import { describe, expect, it } from "vitest";

import { countryBBox, suggestCountry, WORLD_BBOX } from "./countries";
import {
  bboxOf,
  closeRing,
  hasSelfIntersection,
  parseCoordinateText,
  ringAreaM2,
  validateRing,
  type LngLat,
} from "./geometry";

const square: LngLat[] = [
  [36.8, -1.2],
  [36.801, -1.2],
  [36.801, -1.201],
  [36.8, -1.201],
];

describe("parseCoordinateText", () => {
  it("reads lat,lng lines in any common separator style", () => {
    const { points, errors } = parseCoordinateText(
      "-1.2, 36.8\n(-1.2; 36.801)\n\n -1.201\t36.801 \n[-1.201 , 36.8]",
      "lat-lng",
    );
    expect(errors).toEqual([]);
    expect(points).toEqual([
      [36.8, -1.2],
      [36.801, -1.2],
      [36.801, -1.201],
      [36.8, -1.201],
    ]);
  });

  it("honours lng,lat order", () => {
    expect(parseCoordinateText("36.8, -1.2", "lng-lat").points).toEqual([[36.8, -1.2]]);
  });

  it("reports unreadable and out-of-range lines with their line number", () => {
    const { points, errors } = parseCoordinateText("-1.2, 36.8\nhello\n95, 10\n1, 2, 3", "lat-lng");
    expect(points).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(errors[1].message).toMatch(/latitude must be between -90 and 90/i);
  });

  it("hints at swapped latitude/longitude", () => {
    expect(parseCoordinateText("-91, 36.8", "lat-lng").errors[0].message).toMatch(/swapped/i);
  });
});

describe("validateRing", () => {
  it("accepts a simple quadrilateral and estimates its area", () => {
    const result = validateRing(square);
    expect(result.status).toBe("valid");
    // ~111 m x ~111 m
    expect(result.areaM2).toBeGreaterThan(10_000);
    expect(result.areaM2).toBeLessThan(14_000);
  });

  it("accepts an already-closed ring and does not double count the closing point", () => {
    const result = validateRing([...square, square[0]]);
    expect(result.status).toBe("valid");
    expect(result.ring).toHaveLength(4);
  });

  it("is empty / incomplete until there are 3 points", () => {
    expect(validateRing([]).status).toBe("empty");
    const two = validateRing(square.slice(0, 2));
    expect(two.status).toBe("incomplete");
    expect(two.messages[0]).toMatch(/1 more needed/);
  });

  it("rejects a bow-tie (self-intersecting) ring", () => {
    const bowTie: LngLat[] = [square[0], square[2], square[1], square[3]];
    const result = validateRing(bowTie);
    expect(result.status).toBe("invalid");
    expect(result.messages[0]).toMatch(/crosses itself/i);
  });

  it("rejects collinear and duplicate points", () => {
    expect(
      validateRing([
        [36.8, -1.2],
        [36.801, -1.2],
        [36.802, -1.2],
      ]).status,
    ).toBe("invalid");
    expect(validateRing([square[0], square[0], square[1], square[2]]).messages[0]).toMatch(
      /identical/i,
    );
  });
});

describe("geometry helpers", () => {
  it("detects self-intersection only for non-neighbouring edges", () => {
    expect(hasSelfIntersection(square)).toBe(false);
    expect(hasSelfIntersection([square[0], square[2], square[1], square[3]])).toBe(true);
  });

  it("closes a ring once and computes bbox / area", () => {
    expect(closeRing(square)).toHaveLength(5);
    expect(closeRing([...square, square[0]])).toHaveLength(5);
    expect(bboxOf(square)).toEqual([36.8, -1.201, 36.801, -1.2]);
    expect(bboxOf([])).toBeNull();
    expect(ringAreaM2(square.slice(0, 2))).toBe(0);
  });
});

describe("countries", () => {
  it("suggests the most specific country for a coordinate", () => {
    expect(suggestCountry([36.82, -1.29])).toBe("KE");
    expect(suggestCountry([30.06, -1.95])).toBe("RW");
    expect(suggestCountry([0, 0])).toBeNull();
  });

  it("frames unknown countries on the world", () => {
    expect(countryBBox("KE")).not.toEqual(WORLD_BBOX);
    expect(countryBBox("JP")).toEqual(WORLD_BBOX);
    expect(countryBBox(null)).toEqual(WORLD_BBOX);
  });
});
