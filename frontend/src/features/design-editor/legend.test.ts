import { describe, expect, it } from "vitest";

import type { DesignFeature, ElementType, PlanLayer } from "../../entities/planning";
import { buildLegend } from "./legend";

const layers = [
  { id: "L1", visible: true },
  { id: "L2", visible: false },
] as PlanLayer[];
const tank = {
  id: 7,
  name: "Water tank",
  default_style: { fill: "#0d47a1" },
} as unknown as ElementType;
const POINT: DesignFeature["geometry"] = { type: "Point", coordinates: [36, -1] };
const POLY: DesignFeature["geometry"] = {
  type: "Polygon",
  coordinates: [
    [
      [36, -1],
      [36.1, -1],
      [36.1, -1.1],
      [36, -1],
    ],
  ],
};
const feat = (
  feature_type: DesignFeature["feature_type"],
  properties: Record<string, unknown> = {},
  extra: Partial<DesignFeature> = {},
): DesignFeature =>
  ({
    type: "Feature",
    id: Math.random().toString(),
    layer_id: "L1",
    feature_type,
    element_type_id: null,
    geometry: POLY,
    properties,
    ...extra,
  }) as DesignFeature;

describe("buildLegend", () => {
  it("is empty for an empty plan", () => {
    expect(buildLegend([], [tank], layers)).toEqual([]);
  });

  it("lists one entry per zone number, sector kind and element type, grouped in that order", () => {
    const entries = buildLegend(
      [
        feat("element", { color: "#123456" }, { element_type_id: 7, geometry: POINT }),
        feat("element", {}, { element_type_id: 7, geometry: POINT }),
        feat("zone", { zone_number: 2, color: "#ffa726" }),
        feat("zone", { zone_number: 2 }),
        feat("zone", { zone_number: 1 }),
        feat("sector", { sector_kind: "sun", color: "#f59e0b" }),
        feat("sector", { sector_kind: "wind" }),
      ],
      [tank],
      layers,
    );
    expect(entries.map((e) => `${e.group}:${e.label}:${e.count}`)).toEqual([
      "Zones:Zone 1:1",
      "Zones:Zone 2:2",
      "Sectors:Sun:1",
      "Sectors:Wind:1",
      "Elements:Water tank:2",
    ]);
    const element = entries.at(-1)!;
    expect(element.color).toBe("#123456"); // the first feature's own colour
    expect(element.shape).toBe("point");
    expect(entries.find((e) => e.label === "Wind")!.color).toBe("#3b82c4"); // sector default
  });

  it("falls back to the catalogue colour and skips hidden layers and hidden features", () => {
    const features = [
      feat("element", {}, { element_type_id: 7, geometry: POINT }),
      feat("zone", { zone_number: 3 }, { layer_id: "L2" }),
      feat("sector", { sector_kind: "fire" }),
    ];
    const entries = buildLegend(features, [tank], layers, (f) => f.feature_type !== "sector");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ label: "Water tank", color: "#0d47a1" });
  });
});
