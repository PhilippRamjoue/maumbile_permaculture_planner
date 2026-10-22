import { describe, expect, it } from "vitest";

import { site } from "../../../shared/testing/fixtures";
import type { LngLat } from "../geometry";
import {
  DRAFT_BOUNDARY_LAYER_ID,
  draftBoundaryLayer,
  type DraftBoundaryUi,
} from "./draftBoundaryLayer";

const square: LngLat[] = [
  [36.8, -1.2],
  [36.801, -1.2],
  [36.801, -1.201],
  [36.8, -1.201],
];

function build(points: LngLat[], ui?: Partial<DraftBoundaryUi>) {
  return draftBoundaryLayer.build({
    site: { ...site, boundary: { type: "Polygon", coordinates: [points] } },
    imagery: undefined,
    ui: ui ? { [DRAFT_BOUNDARY_LAYER_ID]: ui } : undefined,
  });
}

interface DraftData {
  data: { features: { properties: Record<string, unknown> }[] };
}

function vertexFlags(points: LngLat[], ui?: Partial<DraftBoundaryUi>) {
  const source = build(points, ui)!.sources[DRAFT_BOUNDARY_LAYER_ID] as unknown as DraftData;
  return source.data.features
    .filter((f) => f.properties.kind === "vertex")
    .map((f) => [f.properties.hover, f.properties.selected, f.properties.snap]);
}

describe("draft boundary layer", () => {
  it("draws nothing before the first corner", () => {
    expect(build([])).toBeNull();
  });

  it("marks the hovered, selected and snap-target corners", () => {
    expect(vertexFlags(square, { hoverIndex: 1, selectedIndex: 2, snapIndex: 0 })).toEqual([
      [false, false, true],
      [true, false, false],
      [false, true, false],
      [false, false, false],
    ]);
  });

  it("marks nothing without interaction state", () => {
    expect(
      vertexFlags(square)
        .flat()
        .every((flag) => flag === false),
    ).toBe(true);
  });

  it("keeps the same layers whatever the interaction state, so only the data changes", () => {
    const plain = build(square)!;
    const busy = build(square, { selectedIndex: 1 })!;
    expect(busy.layers).toEqual(plain.layers);
    expect(busy.layers.map((l) => l.id)).toContain("draft-boundary-snap");
  });

  it("turns the whole preview red when the ring crosses itself", () => {
    const [a, b, c, d] = square;
    const source = build([a, c, b, d])!.sources[DRAFT_BOUNDARY_LAYER_ID] as unknown as DraftData;
    expect(source.data.features.every((f) => f.properties.state === "invalid")).toBe(true);
  });
});
