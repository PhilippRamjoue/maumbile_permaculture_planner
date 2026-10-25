import { describe, expect, it } from "vitest";

import type { DesignGeometry } from "../../entities/planning";
import {
  formatSize,
  liveMeasureGeometry,
  measureGeometry,
  measureMode,
  orientedSize,
} from "./measure";

const LAT = -1.2;
const LNG = 36.8;
const M_LAT = 111_132;
const M_LNG = 111_320 * Math.cos((LAT * Math.PI) / 180);

/** A polygon from corner offsets in metres (east, north) from a fixed point. */
const polygon = (...corners: [number, number][]): DesignGeometry => ({
  type: "Polygon",
  coordinates: [[...corners, corners[0]].map(([x, y]) => [LNG + x / M_LNG, LAT + y / M_LAT])],
});

/** A `w` x `h` metre rectangle turned `degrees` counter-clockwise around its first corner. */
const rectangle = (w: number, h: number, degrees = 0): DesignGeometry => {
  const a = (degrees * Math.PI) / 180;
  const turn = ([x, y]: [number, number]): [number, number] => [
    x * Math.cos(a) - y * Math.sin(a),
    x * Math.sin(a) + y * Math.cos(a),
  ];
  return polygon(turn([0, 0]), turn([w, 0]), turn([w, h]), turn([0, h]));
};

describe("orientedSize", () => {
  it("gives the sides of a north-aligned bed, longer first", () => {
    const size = orientedSize(rectangle(1.2, 4.2))!;
    expect(size.long_m).toBeCloseTo(4.2, 2);
    expect(size.short_m).toBeCloseTo(1.2, 2);
  });

  it("is not fooled by a rotated bed (its bounding box would be larger)", () => {
    const size = orientedSize(rectangle(4.2, 1.2, 33))!;
    expect(size.long_m).toBeCloseTo(4.2, 2);
    expect(size.short_m).toBeCloseTo(1.2, 2);
  });

  it("encloses an irregular shape in the smallest rectangle", () => {
    // A right triangle with legs 6 and 3 fits a 6 x 3 rectangle.
    const size = orientedSize(polygon([0, 0], [6, 0], [0, 3]))!;
    expect(size.long_m).toBeCloseTo(6, 2);
    expect(size.short_m).toBeCloseTo(3, 2);
  });

  it("has no size for points, lines or a flat polygon", () => {
    expect(orientedSize({ type: "Point", coordinates: [LNG, LAT] })).toBeNull();
    expect(
      orientedSize({
        type: "LineString",
        coordinates: [
          [LNG, LAT],
          [LNG + 0.001, LAT],
        ],
      }),
    ).toBeNull();
    expect(orientedSize(polygon([0, 0], [5, 0], [10, 0]))).toBeNull();
  });
});

describe("formatSize", () => {
  it("writes metres with a decimal while small, whole metres from 100 m, kilometres from 1 km", () => {
    expect(formatSize({ long_m: 4.23, short_m: 1.18 })).toBe("4.2 × 1.2 m");
    expect(formatSize({ long_m: 130.4, short_m: 42.6 })).toBe("130 × 43 m");
    expect(formatSize({ long_m: 1520, short_m: 800 })).toBe("1.52 × 0.8 km");
  });
});

describe("measureGeometry", () => {
  it("agrees with the size on area for a rectangle", () => {
    const { area_m2 } = measureGeometry(rectangle(4.2, 1.2));
    expect(area_m2).toBeCloseTo(4.2 * 1.2, 1);
  });
});

describe("measureMode", () => {
  it("maps measure tools to their Terra Draw mode, and nothing else", () => {
    expect(measureMode("measure-line")).toBe("linestring");
    expect(measureMode("measure-area")).toBe("polygon");
    expect(measureMode("select")).toBeNull();
    expect(measureMode("zone")).toBeNull();
  });
});

describe("liveMeasureGeometry", () => {
  const line: DesignGeometry = {
    type: "LineString",
    coordinates: [
      [LNG, LAT],
      [LNG + 10 / M_LNG, LAT],
    ],
  };
  const helperPoint = {
    properties: { mode: "point" },
    geometry: { type: "Point", coordinates: [LNG, LAT] } as DesignGeometry,
  };
  const lineFeature = { properties: { mode: "linestring" }, geometry: line };

  it("keeps the line being measured even when a snapping-point helper is drawn last", () => {
    // After a click, the trailing feature can be the snapping point; the distance must not vanish.
    expect(liveMeasureGeometry([lineFeature, helperPoint], "linestring")).toBe(line);
  });

  it("returns null while measuring when no feature of the wanted mode exists yet", () => {
    expect(liveMeasureGeometry([helperPoint], "linestring")).toBeNull();
    expect(liveMeasureGeometry([], "polygon")).toBeNull();
  });

  it("falls back to the last drawable feature when not measuring", () => {
    expect(liveMeasureGeometry([lineFeature, helperPoint], null)).toBe(helperPoint.geometry);
  });
});
