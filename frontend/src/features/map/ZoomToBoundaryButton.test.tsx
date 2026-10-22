import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import { FAKE_MAP_SIZE, FakeMap } from "../../shared/testing/fakeMaplibre";
import { ZoomToBoundaryButton } from "./ZoomToBoundaryButton";

const bounds: [number, number, number, number] = [36.8, -1.201, 36.801, -1.2];

describe("ZoomToBoundaryButton", () => {
  it("frames the boundary with the whole of it on screen", async () => {
    const map = new FakeMap({ center: [30, 5], zoom: 3 });
    render(<ZoomToBoundaryButton map={map as unknown as MapLibreMap} bounds={bounds} />);

    await userEvent.click(screen.getByRole("button", { name: "Zoom to boundary" }));

    expect(map.fits).toHaveLength(1);
    expect(map.fits[0].bounds).toEqual(bounds);
    for (const corner of [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ] as [number, number][]) {
      const at = map.project(corner);
      expect(at.x).toBeGreaterThan(0);
      expect(at.x).toBeLessThan(FAKE_MAP_SIZE.width);
      expect(at.y).toBeGreaterThan(0);
      expect(at.y).toBeLessThan(FAKE_MAP_SIZE.height);
    }
  });

  it("is disabled until there is a map and a boundary", () => {
    const map = new FakeMap({}) as unknown as MapLibreMap;
    const { rerender } = render(<ZoomToBoundaryButton map={null} bounds={bounds} />);
    expect(screen.getByRole("button")).toBeDisabled();

    rerender(<ZoomToBoundaryButton map={map} bounds={null} />);
    expect(screen.getByRole("button")).toBeDisabled();

    rerender(<ZoomToBoundaryButton map={map} bounds={bounds} />);
    expect(screen.getByRole("button")).toBeEnabled();
  });
});
