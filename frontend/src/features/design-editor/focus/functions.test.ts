import { describe, expect, it } from "vitest";

import type { DesignFeature, ElementType } from "../../../entities/planning";
import {
  anchorOf,
  connectionLines,
  connectionsOf,
  functionsOf,
  normalizeFunction,
  permacultureCheck,
  toggleFunction,
  typicalFunctions,
  withTypicalFunctions,
} from "./functions";

interface ElOpts {
  id?: string;
  type?: "element" | "path" | "zone";
  needs?: string[];
  yields?: string[];
  name?: string;
  point?: [number, number];
}
let seq = 0;
const el = (opts: ElOpts = {}): DesignFeature =>
  ({
    id: opts.id ?? `f${++seq}`,
    feature_type: opts.type ?? "element",
    properties: {
      ...(opts.needs ? { needs: opts.needs } : {}),
      ...(opts.yields ? { yields: opts.yields } : {}),
      ...(opts.name ? { name: opts.name } : {}),
    },
    geometry: { type: "Point", coordinates: opts.point ?? [0, 0] },
  }) as unknown as DesignFeature;
const ids = (features: readonly DesignFeature[]) => features.map((f) => f.id).sort();

describe("function names", () => {
  it("normalizes to trimmed, lower-case, single-spaced and bounded", () => {
    expect(normalizeFunction("  Water ")).toBe("water");
    expect(normalizeFunction("pest   control")).toBe("pest control");
    expect(normalizeFunction("x".repeat(80))).toHaveLength(40);
  });

  it("reads a list defensively: skips non-strings, normalizes and dedupes", () => {
    const f = el({ needs: ["Water", " water ", "shade"] });
    (f.properties as Record<string, unknown>).needs = ["Water", " water ", "shade", 123, null];
    expect(functionsOf(f, "needs").sort()).toEqual(["shade", "water"]);
    expect(functionsOf(el(), "needs")).toEqual([]); // absent key → []
  });

  it("toggles a function on and off without mutating, and caps the list", () => {
    const base = el();
    const added = toggleFunction(base, "yields", "Water", true);
    expect(functionsOf(added, "yields")).toEqual(["water"]);
    expect(base.properties).not.toHaveProperty("yields"); // original untouched
    expect(toggleFunction(added, "yields", "water", true)).toBe(added); // already on → no-op
    expect(functionsOf(toggleFunction(added, "yields", "water", false), "yields")).toEqual([]);

    const full = el({ yields: Array.from({ length: 20 }, (_, i) => `fn${i}`) });
    expect(toggleFunction(full, "yields", "extra", true)).toBe(full); // MAX reached → unchanged
  });
});

describe("permaculture check", () => {
  it("flags nothing but is not ok when there is nothing to check", () => {
    const check = permacultureCheck([]);
    expect(check.count).toBe(0);
    expect(check.ok).toBe(false);
  });

  it("is ok when every function has several providers and every element yields several", () => {
    const check = permacultureCheck([
      el({ yields: ["water", "shade"] }),
      el({ yields: ["water", "shade"] }),
    ]);
    expect(check.ok).toBe(true);
    expect(check.unmet).toEqual([]);
    expect(check.fragile).toEqual([]);
  });

  it("reports a need that no other element yields (and self-supply does not count)", () => {
    const a = el({ id: "a", needs: ["water"], yields: ["water"] }); // can't satisfy itself
    const check = permacultureCheck([a]);
    expect(check.unmet.map((u) => u.fn)).toEqual(["water"]);
    expect(ids(check.unmet[0].needers)).toEqual(["a"]);
  });

  it("flags functions only one element provides as fragile", () => {
    const check = permacultureCheck([
      el({ id: "a", yields: ["water", "mulch"] }),
      el({ id: "b", yields: ["water", "shade"] }),
    ]);
    expect(check.fragile.map((f) => f.fn)).toEqual(["mulch", "shade"]); // water has two providers
  });

  it("separates undescribed elements from underused ones", () => {
    const blank = el({ id: "blank" });
    const thin = el({ id: "thin", yields: ["water"] }); // described but < 2 yields
    const check = permacultureCheck([blank, thin]);
    expect(ids(check.undescribed)).toEqual(["blank"]);
    expect(ids(check.underused)).toEqual(["thin"]);
  });
});

describe("connections between elements", () => {
  it("links a needer to a yielder in both directions", () => {
    const a = el({ id: "a", needs: ["water"], yields: ["shade"] });
    const b = el({ id: "b", yields: ["water"] });
    const c = el({ id: "c", needs: ["shade"] });
    const conns = connectionsOf(a, [a, b, c]);
    expect(conns).toContainEqual({ fn: "water", other: b, direction: "supplies" });
    expect(conns).toContainEqual({ fn: "shade", other: c, direction: "uses" });
  });

  it("anchors a point to itself and a polygon to its centroid", () => {
    expect(anchorOf(el({ point: [1, 2] }))).toEqual([1, 2]);
    const poly = {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      },
    } as unknown as DesignFeature;
    expect(anchorOf(poly)).toEqual([1, 1]);
  });

  it("draws one line per linked element, even across several shared functions", () => {
    const a = el({ id: "a", needs: ["water", "shade"], point: [0, 0] });
    const b = el({ id: "b", yields: ["water", "shade"], point: [10, 10] });
    const lines = connectionLines(a, [a, b]);
    expect(lines).toHaveLength(1);
    expect(lines[0].geometry.coordinates).toEqual([
      [0, 0],
      [10, 10],
    ]);
  });
});

describe("typical functions of palette entries", () => {
  const type = (id: number, name: string, defaults: Record<string, unknown>): ElementType =>
    ({
      id,
      key: name.toLowerCase().replace(" ", "_"),
      name,
      default_properties: defaults,
    }) as unknown as ElementType;
  const tree = type(1, "Tree", { needs: ["water"], yields: ["shade", "windbreak"] });
  const tank = type(2, "Water tank", { needs: [], yields: ["water"] });
  const zone = type(3, "Zone", {});
  const types = [tree, tank, zone];
  const withType = (id: number | null, opts: ElOpts = {}): DesignFeature => ({
    ...el(opts),
    element_type_id: id,
  });

  it("starts a new element with its entry's needs and yields", () => {
    expect(typicalFunctions(tree)).toEqual({ needs: ["water"], yields: ["shade", "windbreak"] });
    expect(typicalFunctions(zone)).toEqual({});
    expect(typicalFunctions(undefined)).toEqual({});
  });

  it("links a placed tree to a placed water tank with no manual steps", () => {
    const placed = (entry: ElementType, id: string) => ({
      ...el({ id }),
      properties: { name: entry.name, ...typicalFunctions(entry) },
    });
    const a = placed(tree, "tree");
    const b = placed(tank, "tank");

    expect(connectionsOf(a, [a, b]).map((c) => [c.fn, c.other.id, c.direction])).toEqual([
      ["water", "tank", "supplies"],
    ]);
    expect(permacultureCheck([a, b]).unmet).toEqual([]);
    expect(connectionLines(a, [a, b])).toHaveLength(1);
  });

  it("fills in what an older element lacks, by type id or by its name", () => {
    const byId = withType(1, { name: "My mango" });
    expect(functionsOf(withTypicalFunctions(byId, types), "needs")).toEqual(["water"]);

    const byName = withType(null, { name: "Water Tank" });
    expect(functionsOf(withTypicalFunctions(byName, types), "yields")).toEqual(["water"]);
  });

  it("never overwrites needs or yields the user chose", () => {
    const chosen = withType(1, { needs: ["shade"], yields: [] });
    const filled = withTypicalFunctions(chosen, types);
    expect(functionsOf(filled, "needs")).toEqual(["shade"]);
    expect(functionsOf(filled, "yields")).toEqual(["shade", "windbreak"]);
  });

  it("returns the same element when there is nothing to add", () => {
    const done = withType(1, { needs: ["water"], yields: ["food"] });
    expect(withTypicalFunctions(done, types)).toBe(done);
    const unknown = withType(null, { name: "Unknown thing" });
    expect(withTypicalFunctions(unknown, types)).toBe(unknown);
  });
});
