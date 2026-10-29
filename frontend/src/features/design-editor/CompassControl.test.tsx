import { act, render, screen } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import { CompassControl } from "./CompassControl";

/** Just enough of a map: a bearing, and the events that announce it changing. */
function fakeMap(bearing = 0) {
  const handlers = new Map<string, Set<() => void>>();
  const map = {
    bearing,
    getBearing() {
      return this.bearing;
    },
    on(event: string, handler: () => void) {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler));
    },
    off(event: string, handler: () => void) {
      handlers.get(event)?.delete(handler);
    },
  };
  const emit = (event: string) => handlers.get(event)?.forEach((handler) => handler());
  return { map: map as unknown as MapLibreMap & { bearing: number }, emit, handlers };
}

describe("CompassControl", () => {
  it("marks north, east, south and west, with north up on a map that is not turned", () => {
    const { map } = fakeMap();
    const { container } = render(<CompassControl map={map} />);
    expect(screen.getByRole("img", { name: "Compass: north is up" })).toBeInTheDocument();
    expect(Array.from(container.querySelectorAll("text")).map((t) => t.textContent)).toEqual([
      "N",
      "E",
      "S",
      "W",
    ]);
    expect(container.querySelector("g")).toHaveAttribute("transform", "rotate(0)");
  });

  it("turns against the map when it rotates, so N keeps pointing north", () => {
    const { map, emit } = fakeMap();
    const { container } = render(<CompassControl map={map} />);

    act(() => {
      map.bearing = 90;
      emit("rotate");
    });
    expect(screen.getByRole("img", { name: "Compass: north is 90° off up" })).toBeInTheDocument();
    expect(container.querySelector("g")).toHaveAttribute("transform", "rotate(-90)");

    // A move (a fly-to that also turns) is followed too.
    act(() => {
      map.bearing = -45;
      emit("move");
    });
    expect(screen.getByRole("img", { name: "Compass: north is 315° off up" })).toBeInTheDocument();
  });

  it("starts from the bearing the map already has, and stops listening when removed", () => {
    const { map, handlers } = fakeMap(30);
    const { unmount } = render(<CompassControl map={map} />);
    expect(screen.getByRole("img", { name: "Compass: north is 30° off up" })).toBeInTheDocument();
    expect(handlers.get("rotate")?.size).toBe(1);
    unmount();
    expect(handlers.get("rotate")?.size).toBe(0);
    expect(handlers.get("move")?.size).toBe(0);
  });

  it("draws north up before the map is ready", () => {
    render(<CompassControl map={null} />);
    expect(screen.getByRole("img", { name: "Compass: north is up" })).toBeInTheDocument();
  });
});
