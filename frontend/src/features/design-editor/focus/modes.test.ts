import { describe, expect, it } from "vitest";

import type { DesignFeature, FeatureType } from "../../../entities/planning";
import type { EditorDocument } from "../store";
import {
  type ContextGroup,
  FOCUS_IDS,
  contextGroups,
  groupOf,
  initialFocus,
  isEditable,
  isShown,
  nudgeFor,
  progressOf,
  suggestNext,
} from "./modes";

const feat = (feature_type: FeatureType, properties: Record<string, unknown> = {}): DesignFeature =>
  ({ feature_type, properties }) as unknown as DesignFeature;
const doc = (...features: DesignFeature[]): EditorDocument =>
  ({ features }) as unknown as EditorDocument;
const noneHidden = new Set<ContextGroup>();

describe("focus modes", () => {
  it("run in the permaculture design order", () => {
    expect(FOCUS_IDS).toEqual(["goals", "boundary", "sectors", "zones", "elements", "functions"]);
  });

  describe("one focus editable at a time", () => {
    it("sectors mode edits only sectors", () => {
      expect(isEditable("sectors", feat("sector"))).toBe(true);
      expect(isEditable("sectors", feat("zone"))).toBe(false);
      expect(isEditable("sectors", feat("element"))).toBe(false);
    });
    it("zones mode edits only zones", () => {
      expect(isEditable("zones", feat("zone"))).toBe(true);
      expect(isEditable("zones", feat("sector"))).toBe(false);
    });
    it("elements mode edits elements, paths and annotations", () => {
      for (const t of ["element", "path", "annotation"] as FeatureType[]) {
        expect(isEditable("elements", feat(t))).toBe(true);
      }
      expect(isEditable("elements", feat("zone"))).toBe(false);
    });
    it("boundary mode edits no plan features (the border is the Site)", () => {
      for (const t of ["sector", "zone", "element", "path"] as FeatureType[]) {
        expect(isEditable("boundary", feat(t))).toBe(false);
      }
    });
  });

  describe("the goals step", () => {
    it("edits nothing on the map and treats every family as context", () => {
      for (const t of ["sector", "zone", "element"] as FeatureType[]) {
        expect(isEditable("goals", feat(t))).toBe(false);
      }
      expect(contextGroups("goals")).toEqual(["boundary", "sectors", "zones", "elements"]);
    });
  });

  describe("other families stay as faint context", () => {
    it("a mode never lists its own family as context", () => {
      expect(contextGroups("zones")).not.toContain("zones");
      expect(contextGroups("sectors")).not.toContain("sectors");
    });
    it("shows editable features always, and context families unless hidden", () => {
      expect(isShown("zones", noneHidden, feat("sector"))).toBe(true);
      expect(isShown("zones", new Set<ContextGroup>(["sectors"]), feat("sector"))).toBe(false);
      // The feature being worked on is editable, so it shows even if its family is toggled off.
      expect(isShown("zones", new Set<ContextGroup>(["zones"]), feat("zone"))).toBe(true);
    });
    it("maps feature types to context families", () => {
      expect(groupOf(feat("sector"))).toBe("sectors");
      expect(groupOf(feat("zone"))).toBe("zones");
      expect(groupOf(feat("element"))).toBe("elements");
      expect(groupOf(feat("path"))).toBe("elements");
    });
  });

  describe("one saved design, seen from every mode", () => {
    it("progress reflects what the saved plan holds, not the current mode", () => {
      const p = progressOf(doc(feat("zone")));
      expect(p.zones).toBe(true);
      expect(p.sectors).toBe(false);
      expect(p.boundary).toBe(true); // a site always has a boundary
    });
    it("counts goals once a priority or a vision is written", () => {
      expect(progressOf(doc()).goals).toBe(false);
      expect(progressOf(doc(), { priorities: ["food"], vision: "" }).goals).toBe(true);
      expect(progressOf(doc(), { priorities: [], vision: "A shady garden" }).goals).toBe(true);
    });
    it("counts functions only when an element records needs or yields", () => {
      expect(progressOf(doc(feat("element"))).functions).toBe(false);
      expect(progressOf(doc(feat("element", { needs: ["water"] }))).functions).toBe(true);
    });
  });

  describe("guided but never blocking", () => {
    it("opens a brand-new design on the goals, then on the boundary once goals exist", () => {
      expect(initialFocus(doc())).toBe("goals");
      expect(initialFocus(doc(), { priorities: ["water"], vision: "" })).toBe("boundary");
      expect(initialFocus(doc(), { priorities: [], vision: "  " })).toBe("goals");
    });
    it("opens on the first unstarted map step, never pulling back to optional goals", () => {
      expect(initialFocus(doc(feat("zone")))).toBe("sectors");
    });
    it("suggests the next unstarted step, and every step stays reachable", () => {
      const progress = progressOf(doc());
      expect(suggestNext("goals", progress)).toBe("boundary");
      expect(suggestNext("boundary", progress)).toBe("sectors");
      expect(FOCUS_IDS).toContain(suggestNext("sectors", progress)!);
      expect(suggestNext("functions", progress)).toBeNull();
    });
    it("gives an empty-vs-done nudge per step", () => {
      expect(nudgeFor("sectors", progressOf(doc())).text).toMatch(/sun, wind and water/i);
      expect(nudgeFor("sectors", progressOf(doc(feat("sector")))).text).toMatch(/context/i);
    });
  });
});

describe("water-first nudge", () => {
  const water = { priorities: ["water" as const], vision: "" };
  const food = { priorities: ["food" as const], vision: "" };
  const sector = (kind: string) => feat("sector", { sector_kind: kind });

  it("stays quiet unless water is a goal", () => {
    const text = nudgeFor("elements", progressOf(doc()), { goals: food, features: [] }).text;
    expect(text).not.toMatch(/water matters to you/i);
    expect(nudgeFor("sectors", progressOf(doc())).text).toMatch(/sun, wind and water/i);
  });

  it("asks for a water sector until there is one", () => {
    const sectors = [sector("sun"), sector("wind")];
    const progress = progressOf(doc(...sectors));
    expect(nudgeFor("sectors", progress, { goals: water, features: sectors }).text).toMatch(
      /where does it come from/i,
    );
    const withWater = [...sectors, sector("water")];
    expect(nudgeFor("sectors", progress, { goals: water, features: withWater }).text).toMatch(
      /context/i,
    );
  });

  it("asks for a water source among the elements until one is placed", () => {
    const house = feat("element", { yields: ["shelter"] });
    const progress = progressOf(doc(house));
    expect(nudgeFor("elements", progress, { goals: water, features: [house] }).text).toMatch(
      /caught or kept/i,
    );
    const tank = feat("element", { yields: ["Water"] });
    expect(nudgeFor("elements", progress, { goals: water, features: [house, tank] }).text).toMatch(
      /Elements are saved/,
    );
  });

  it("leaves the other steps alone", () => {
    expect(nudgeFor("zones", progressOf(doc()), { goals: water, features: [] }).text).toMatch(
      /first zone/i,
    );
  });
});
