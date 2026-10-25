import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DesignFeature } from "../../entities/planning";
import { GLYPHS } from "../../entities/generated/icons";
import { renderableFeatures, createFocusView } from "./focus/view";
import { GlyphIcon } from "./GlyphIcon";
import { badgeName, glyphFor, inkOn, parseBadgeName, renderBadge } from "./icons";

describe("icons", () => {
  it("ships a glyph for every key and nothing else", () => {
    expect(Object.keys(GLYPHS).length).toBeGreaterThanOrEqual(15);
    expect(glyphFor("tree")).toBeDefined();
    expect(glyphFor("waves")).toBeUndefined();
    expect(glyphFor(null)).toBeUndefined();
  });

  it("round-trips map image names and rejects unknown ones", () => {
    expect(parseBadgeName(badgeName("tank", "#0d47a1"))).toEqual({ key: "tank", color: "#0d47a1" });
    expect(parseBadgeName("glyph|nope|#000000")).toBeNull();
    expect(parseBadgeName("something-else")).toBeNull();
  });

  it("picks ink that reads on the colour", () => {
    expect(inkOn("#ffeb3b")).toBe("#1c2a21");
    expect(inkOn("#0d47a1")).toBe("#ffffff");
    expect(inkOn("not a colour")).toBe("#ffffff");
  });

  it("makes no bitmap where there is no canvas, and none for unknown glyphs", () => {
    expect(renderBadge("nope", "#123456")).toBeNull();
    expect(() => renderBadge("tree", "#123456")).not.toThrow();
  });

  it("draws an inline SVG glyph, or nothing without an icon", () => {
    const { container, rerender } = render(<GlyphIcon icon="house" color="#a0522d" />);
    expect(container.querySelectorAll("svg path, svg circle").length).toBeGreaterThan(2);
    rerender(<GlyphIcon icon={null} color="#a0522d" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("marks features with their icon image name, and only those", () => {
    const feature = (id: string, color: string): DesignFeature =>
      ({
        id,
        feature_type: "element",
        element_type_id: id === "a" ? 1 : 2,
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: { color },
      }) as unknown as DesignFeature;
    const view = createFocusView("elements", new Set(), [], 1, new Set(), (f) =>
      f.element_type_id === 1 ? "tank" : null,
    );
    const [marked, plain] = renderableFeatures(
      [feature("a", "#0d47a1"), feature("b", "#7cb342")],
      view,
      null,
      null,
    );
    expect(marked!.properties._icon).toBe("glyph|tank|#0d47a1");
    expect(plain!.properties._icon).toBe("");
  });

  it("keeps the badge of a footprint the map is editing, but not its shape", () => {
    const footprint = {
      id: "f",
      feature_type: "element",
      element_type_id: 1,
      geometry: { type: "Polygon", coordinates: [[[0, 0]]] },
      properties: { color: "#0d47a1" },
    } as unknown as DesignFeature;
    const view = createFocusView("elements", new Set(), [], 1, new Set(), () => "tank");
    const [badge] = renderableFeatures([footprint], view, "f", "f");
    expect(badge!.properties._drawing).toBe(true);
    expect(badge!.properties._icon).toBe("glyph|tank|#0d47a1");
    // Without an icon, Terra Draw alone draws it.
    const bare = createFocusView("elements", new Set(), [], 1, new Set(), () => null);
    expect(renderableFeatures([footprint], bare, "f", "f")).toEqual([]);
  });
});
