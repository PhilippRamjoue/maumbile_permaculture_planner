import { describe, expect, it } from "vitest";

import type { DesignFeature } from "../../entities/planning";
import { recolorZones, zoneColor, ZONE_COLORS, zoneColorOf, zoneNumberOf } from "./zoneColors";

const zone = (zone_number: number, color?: string, id = `z${zone_number}`): DesignFeature =>
  ({
    type: "Feature",
    id,
    layer_id: "l1",
    feature_type: "zone",
    element_type_id: null,
    geometry: { type: "Polygon", coordinates: [] },
    properties: { zone_number, ...(color ? { color } : {}) },
  }) as unknown as DesignFeature;

const element = (id = "e1"): DesignFeature =>
  ({
    type: "Feature",
    id,
    layer_id: "l2",
    feature_type: "element",
    element_type_id: 1,
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { color: "#123456" },
  }) as unknown as DesignFeature;

describe("zoneColors", () => {
  it("gives each zone number a distinct default colour, amber outside 0–5", () => {
    const used = [0, 1, 2, 3, 4, 5].map(zoneColor);
    expect(new Set(used).size).toBe(6); // all distinct
    expect(zoneColor(0)).toBe(ZONE_COLORS[0]);
    expect(zoneColor(9)).toBe("#f59e0b");
  });

  it("reads a zone number, defaulting a missing one to 1", () => {
    expect(zoneNumberOf(zone(3))).toBe(3);
    expect(zoneNumberOf({ properties: {} })).toBe(1);
  });

  it("zoneColorOf uses an existing zone of that number, else the default", () => {
    const features = [zone(1, "#aa0000"), zone(2)];
    expect(zoneColorOf(features, 1)).toBe("#aa0000"); // an existing Zone 1's colour
    expect(zoneColorOf(features, 3)).toBe(zoneColor(3)); // none placed yet → default
    expect(zoneColorOf([zone(1, "not-a-hex")], 1)).toBe(zoneColor(1)); // ignores junk
  });

  it("recolorZones recolours only the zones of that number, leaving the rest alone", () => {
    const features = [zone(1, "#111111", "a"), zone(1, "#222222", "b"), zone(2, "#333333"), element()];
    const next = recolorZones(features, 1, "#00ff00");
    expect(next.filter((f) => f.feature_type === "zone" && zoneNumberOf(f) === 1).map((f) => f.properties.color)).toEqual([
      "#00ff00",
      "#00ff00",
    ]);
    // Zone 2 and the element are untouched (same references).
    expect(next[2]).toBe(features[2]);
    expect(next[3]).toBe(features[3]);
  });
});
