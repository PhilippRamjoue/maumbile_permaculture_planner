import { describe, expect, it } from "vitest";

import { site } from "../../../shared/testing/fixtures";
import {
  GRID_LAYER_ID,
  buildGrid,
  formatGridDistance,
  gridLayer,
  gridStepFor,
  metresPerDegree,
  pickGridStep,
  type ViewBounds,
} from "./gridLayer";
import { gridLabelName, parseGridLabelName } from "./gridLabels";

const ORIGIN: [number, number] = [36.8, -1.21];

/** A view `widthM` x `heightM` metres, starting `eastM` / `northM` from the origin. */
const view = (widthM: number, heightM: number, eastM = 0, northM = 0): ViewBounds => {
  const per = metresPerDegree(ORIGIN[1]);
  const west = ORIGIN[0] + eastM / per.lng;
  const south = ORIGIN[1] + northM / per.lat;
  return [west, south, west + widthM / per.lng, south + heightM / per.lat];
};

describe("grid spacing", () => {
  it("grows with the view so a readable number of lines remain", () => {
    expect(pickGridStep(20)).toBe(2);
    expect(pickGridStep(50)).toBe(5);
    expect(pickGridStep(100)).toBe(10);
    expect(pickGridStep(300)).toBe(25);
    expect(pickGridStep(1200)).toBe(100);
  });

  it("offers no grid for a view too wide to read one", () => {
    expect(pickGridStep(500_000)).toBeNull();
    expect(buildGrid(view(500_000, 400_000), ORIGIN).lines.features).toHaveLength(0);
  });

  it("measures the longer side of the view", () => {
    expect(gridStepFor(view(40, 700), ORIGIN)).toBe(100);
  });
});

describe("buildGrid", () => {
  const grid = buildGrid(view(60, 40, 3, 3), ORIGIN);

  it("spaces lines the chosen number of metres apart, north-aligned", () => {
    expect(grid.step).toBe(5);
    const verticals = grid.lines.features
      .filter((f) => f.geometry.coordinates[0][0] === f.geometry.coordinates[1][0])
      .map((f) => f.geometry.coordinates[0][0])
      .sort((a, b) => a - b);
    const per = metresPerDegree(ORIGIN[1]);
    const gaps = verticals.slice(1).map((lng, i) => (lng - verticals[i]) * per.lng);
    for (const gap of gaps) expect(gap).toBeCloseTo(5, 6);
    // Every line is a whole number of steps from the origin.
    for (const lng of verticals) {
      const metres = (lng - ORIGIN[0]) * per.lng;
      expect(metres / 5).toBeCloseTo(Math.round(metres / 5), 6);
    }
  });

  it("draws a modest number of lines", () => {
    expect(grid.lines.features.length).toBeLessThan(40);
  });

  it("numbers a few lines with their distance from the origin", () => {
    const labels = grid.labels.features.map((f) => f.properties.label);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(12);
    expect(labels).toContain("10 m");
    // top edge numbers east, left edge numbers north
    expect(new Set(grid.labels.features.map((f) => f.properties.anchor))).toEqual(
      new Set(["top", "left"]),
    );
  });

  it("is the same grid for the same view", () => {
    expect(buildGrid(view(60, 40, 3, 3), ORIGIN)).toEqual(grid);
  });

  it("labels fewer lines when many are shown, still starting from 0 m", () => {
    const wide = buildGrid(view(1200, 800), ORIGIN);
    const eastLabels = wide.labels.features.filter((f) => f.properties.anchor === "top");
    expect(eastLabels.length).toBeLessThanOrEqual(6);
    expect(eastLabels.map((f) => f.properties.label)).toContain("0 m");
  });
});

describe("formatGridDistance", () => {
  it("writes metres, signs and kilometres", () => {
    expect(formatGridDistance(5)).toBe("5 m");
    expect(formatGridDistance(-25)).toBe("−25 m");
    expect(formatGridDistance(1500)).toBe("1.5 km");
  });
});

describe("grid label image names", () => {
  it("round-trips the text", () => {
    expect(parseGridLabelName(gridLabelName("10 m"))).toBe("10 m");
    expect(parseGridLabelName("glyph|tree|#fff")).toBeNull();
  });
});

describe("grid layer", () => {
  it("draws nothing until it is given a viewport", () => {
    expect(gridLayer.build({ site, imagery: undefined })).toBeNull();
  });

  it("keeps its layer structure across views so a pan only swaps data", () => {
    const build = (bounds: ViewBounds) =>
      gridLayer.build({ site, imagery: undefined, ui: { [GRID_LAYER_ID]: { bounds } } })!;
    const a = build(view(60, 40));
    const b = build(view(300, 200, 40, 40));
    expect(a.layers).toEqual(b.layers);
    expect(Object.keys(a.sources)).toEqual(Object.keys(b.sources));
    expect(a.layers.map((l) => l.type)).toEqual(["line", "symbol"]);
  });
});
