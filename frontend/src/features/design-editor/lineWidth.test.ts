import { createExpression } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";

import type { DesignFeature } from "../../entities/planning";
import { OPEN_VIEW, renderableFeatures } from "./focus/view";
import { lineWidthExpression, pixelsPerMetre, widthMOf, widthProblem } from "./lineWidth";

const LATITUDE = -3.37;

/** The width, in pixels, the style spec itself computes for a feature at a zoom. */
function widthAt(properties: Record<string, unknown>, zoom: number, latitude = LATITUDE) {
  const parsed = createExpression(lineWidthExpression(latitude), {
    type: "number",
    "property-type": "data-driven",
    expression: { interpolated: true, parameters: ["zoom", "feature"] },
  } as never);
  if (parsed.result !== "success") throw new Error(JSON.stringify(parsed.value));
  return parsed.value.evaluate({ zoom }, { type: "LineString", properties } as never);
}

describe("lineWidthExpression", () => {
  it("draws a width in metres to scale at every zoom", () => {
    for (const zoom of [3, 12, 15.5, 18, 20.25, 22]) {
      expect(widthAt({ _width_m: 4, _width: 5, _selected: false }, zoom)).toBeCloseTo(
        4 * pixelsPerMetre(LATITUDE, zoom),
        5,
      );
    }
  });

  it("doubles the pixels for every zoom level in", () => {
    const at = (zoom: number) => widthAt({ _width_m: 1, _width: 3 }, zoom);
    expect(at(19) / at(18)).toBeCloseTo(2, 6);
  });

  it("is about 3.3 px for a 1 m path at zoom 18 near the equator", () => {
    // 512 px tiles: 2^18 * 512 / 40,075,017 m ≈ 3.35 px per metre.
    expect(widthAt({ _width_m: 1, _width: 3 }, 18)).toBeCloseTo(3.35, 1);
  });

  it("narrows with latitude's cosine on the ground, so a metre looks wider away from the equator", () => {
    const equator = widthAt({ _width_m: 1, _width: 3 }, 18, 0);
    const north = widthAt({ _width_m: 1, _width: 3 }, 18, 60);
    expect(north / equator).toBeCloseTo(2, 3);
  });

  it("keeps the pixel width when there is no width in metres", () => {
    for (const zoom of [5, 18]) {
      expect(widthAt({ _width_m: 0, _width: 5 }, zoom)).toBe(5);
      expect(widthAt({ _width: 7 }, zoom)).toBe(7);
    }
  });

  it("draws a selected line two pixels wider", () => {
    expect(widthAt({ _width_m: 0, _width: 5, _selected: true }, 18)).toBe(7);
    const plain = widthAt({ _width_m: 2, _width: 5, _selected: false }, 18);
    expect(widthAt({ _width_m: 2, _width: 5, _selected: true }, 18)).toBeCloseTo(plain + 2, 6);
  });
});

describe("widthMOf", () => {
  it("accepts a sensible number of metres only", () => {
    expect(widthMOf({ width_m: 4 })).toBe(4);
    expect(widthMOf({ width_m: 0.1 })).toBe(0.1);
    for (const bad of [0, -1, 0.01, 500, "4", null, undefined, Number.NaN]) {
      expect(widthMOf({ width_m: bad })).toBeNull();
    }
    expect(widthMOf({})).toBeNull();
  });

  it("explains a bad width", () => {
    expect(widthProblem(1)).toBeNull();
    expect(widthProblem(Number.NaN)).toMatch(/number/);
    expect(widthProblem(0)).toMatch(/between/);
    expect(widthProblem(101)).toMatch(/between/);
  });
});

describe("renderableFeatures", () => {
  const path = (properties: Record<string, unknown>): DesignFeature => ({
    type: "Feature",
    id: "p1",
    layer_id: "l1",
    feature_type: "path",
    element_type_id: null,
    geometry: {
      type: "LineString",
      coordinates: [
        [35, -3],
        [35.001, -3],
      ],
    },
    properties,
  });

  it("surfaces the width in metres, or 0 for older paths without one", () => {
    const [withWidth, without] = [path({ width_m: 4 }), path({ style: { stroke_width: 6 } })].map(
      (f) => renderableFeatures([f], OPEN_VIEW, null, null)[0]!.properties,
    );
    expect(withWidth!._width_m).toBe(4);
    expect(without!._width_m).toBe(0);
    expect(without!._width).toBe(6);
  });
});
