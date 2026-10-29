import distance from "@turf/distance";
import type { LineString } from "geojson";
import { describe, expect, it } from "vitest";

import type { DesignFeature } from "../../entities/planning";
import { OPEN_VIEW, renderableFeatures } from "./focus/view";
import { MAX_ROW_ICONS, rowOf, rowPoints, rowSpacingProblem } from "./rowIcons";
import { offsetPoint } from "./sectors";

const metres = (a: number[], b: number[]) => distance(a, b, { units: "kilometers" }) * 1000;
const START: [number, number] = [35.74, -3.37];

/**
 * A straight line a little over `lengthM` metres long, running due east from START. (`offsetPoint`
 * is flat-earth, a few centimetres short of the great-circle metres the row is measured in, so the
 * margin keeps "as far as 20 m" from landing a hair short.)
 */
const eastward = (lengthM: number): LineString => ({
  type: "LineString",
  coordinates: [START, offsetPoint(START, 90, lengthM + 0.1)],
});

describe("rowPoints", () => {
  it("puts an icon on the start and then one every spacing, as far as the line goes", () => {
    const points = rowPoints(eastward(20), 4);
    expect(points).toHaveLength(6); // 0, 4, 8, 12, 16, 20
    expect(points[0]).toEqual([...START]);
    points.slice(1).forEach((p, i) => expect(metres(points[i]!, p)).toBeCloseTo(4, 1));
    expect(metres(points[0]!, points.at(-1)!)).toBeCloseTo(20, 1);
  });

  it("stops short of a remainder smaller than the spacing", () => {
    const points = rowPoints(eastward(10), 4);
    expect(points).toHaveLength(3); // 0, 4, 8
    expect(metres(points[0]!, points.at(-1)!)).toBeCloseTo(8, 1);
  });

  it("keeps the spacing round a corner, measured along the line", () => {
    const corner = offsetPoint(START, 90, 10);
    const line: LineString = {
      type: "LineString",
      coordinates: [START, corner, offsetPoint(corner, 0, 10.1)],
    };
    const points = rowPoints(line, 5);
    expect(points).toHaveLength(5); // 0, 5, 10 (the corner), 15, 20
    expect(points[2]![0]).toBeCloseTo(corner[0], 5); // within half a metre of the corner
    expect(points[2]![1]).toBeCloseTo(corner[1], 5);
    expect(metres(points[3]!, points[4]!)).toBeCloseTo(5, 1);
  });

  it("draws nothing for a degenerate line, and thins out an absurdly dense row", () => {
    expect(rowPoints({ type: "LineString", coordinates: [START, START] }, 3)).toEqual([]);
    expect(rowPoints(eastward(20), 0)).toEqual([]);
    expect(rowPoints(eastward(5000), 0.5).length).toBeLessThanOrEqual(MAX_ROW_ICONS + 1);
  });
});

describe("rowOf", () => {
  it("needs a known glyph and a sensible spacing", () => {
    expect(rowOf({ row_icon: "tree", row_spacing_m: 4 })).toEqual({ icon: "tree", spacing_m: 4 });
    expect(rowOf({ row_icon: "nonsense", row_spacing_m: 4 })).toBeNull();
    expect(rowOf({ row_icon: "tree" })).toBeNull();
    expect(rowOf({ row_icon: "tree", row_spacing_m: 0.1 })).toBeNull();
    expect(rowOf({ row_icon: "tree", row_spacing_m: "4" })).toBeNull();
    expect(rowOf({})).toBeNull();
  });

  it("explains a bad spacing", () => {
    expect(rowSpacingProblem(2)).toBeNull();
    expect(rowSpacingProblem(Number.NaN)).toMatch(/number/);
    expect(rowSpacingProblem(0.2)).toMatch(/between/);
    expect(rowSpacingProblem(101)).toMatch(/between/);
  });
});

describe("renderableFeatures rows", () => {
  const line = (properties: Record<string, unknown>): DesignFeature => ({
    type: "Feature",
    id: "w1",
    layer_id: "l1",
    feature_type: "element",
    element_type_id: null,
    geometry: eastward(20),
    properties: { color: "#1b5e20", ...properties },
  });
  const rows = (features: ReturnType<typeof renderableFeatures>) =>
    features.filter((f) => f.geometry.type === "Point");
  const planted = { row_icon: "tree", row_spacing_m: 4 };

  it("adds render-only points along the line, and keeps the line itself", () => {
    const out = renderableFeatures([line(planted)], OPEN_VIEW, null, null);
    expect(out.filter((f) => f.geometry.type === "LineString")).toHaveLength(1);
    const points = rows(out);
    expect(points).toHaveLength(6);
    expect(points.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5].map((n) => `w1#row${n}`));
    for (const p of points as { id: unknown; properties: Record<string, unknown> }[]) {
      expect(p.properties._icon).toBe("glyph|tree|#1b5e20");
      expect(p.properties._row).toBe(true);
      expect(p.properties._selected).toBe(false);
      expect(p.properties._editor_id).toBe(p.id);
    }
  });

  it("still draws the row of a line Terra Draw is editing, but not the line", () => {
    const out = renderableFeatures([line(planted)], OPEN_VIEW, "w1", "w1");
    expect(out.filter((f) => f.geometry.type === "LineString")).toHaveLength(0);
    expect(rows(out)).toHaveLength(6);
  });

  it("adds nothing for a plain line, an unknown icon or a bad spacing", () => {
    for (const properties of [
      {},
      { row_icon: "nonsense", row_spacing_m: 4 },
      { row_icon: "tree", row_spacing_m: 0 },
    ]) {
      expect(rows(renderableFeatures([line(properties)], OPEN_VIEW, null, null))).toEqual([]);
    }
  });

  it("is faint with its line when the line is context, and gone when it is hidden", () => {
    const view = { ...OPEN_VIEW, isEditable: () => false };
    const faint = renderableFeatures([line(planted)], view, null, null);
    expect(rows(faint).every((p) => p.properties._context === true)).toBe(true);
    const hidden = { ...OPEN_VIEW, isShown: () => false };
    expect(renderableFeatures([line(planted)], hidden, null, null)).toEqual([]);
  });
});
