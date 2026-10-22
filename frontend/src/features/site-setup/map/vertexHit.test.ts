import { describe, expect, it } from "vitest";

import type { LngLat } from "../geometry";
import { isComfortablyFramed } from "./framing";
import { nearestVertex, type BoundaryVertex } from "./vertexHit";

/** 1 degree = 1000 px, origin at (0, 0): enough to reason about pixels directly. */
const project = ([lng, lat]: LngLat) => ({ x: lng * 1000, y: -lat * 1000 });

const vertices: BoundaryVertex[] = [
  { id: 1, point: [0, 0] },
  { id: 2, point: [0.01, 0] }, // 10 px to the right of vertex 1
  { id: 3, point: [0.5, 0.5] }, // at pixel (500, -500)
];

describe("nearestVertex", () => {
  it("finds the corner within reach and nothing outside it", () => {
    expect(nearestVertex({ x: 500, y: -500 }, vertices, project, 12)?.id).toBe(3);
    expect(nearestVertex({ x: 508, y: -495 }, vertices, project, 12)?.id).toBe(3);
    expect(nearestVertex({ x: 520, y: -500 }, vertices, project, 12)).toBeNull();
  });

  it("picks the closest of several in reach", () => {
    expect(nearestVertex({ x: 2, y: 0 }, vertices, project, 12)?.id).toBe(1);
    expect(nearestVertex({ x: 8, y: 0 }, vertices, project, 12)?.id).toBe(2);
  });

  it("prefers the later corner on an exact tie", () => {
    expect(nearestVertex({ x: 5, y: 0 }, vertices, project, 12)?.id).toBe(2);
  });

  it("can ignore the corner being dragged", () => {
    expect(nearestVertex({ x: 0, y: 0 }, vertices, project, 12, 1)?.id).toBe(2);
    expect(nearestVertex({ x: 0, y: 0 }, [vertices[0]], project, 12, 1)).toBeNull();
  });

  it("measures reach in pixels, so what counts as 'on a corner' follows the zoom", () => {
    const zoomedOut = ([lng, lat]: LngLat) => ({ x: lng * 10, y: -lat * 10 });
    // The same spot on the ground, 20 m from the corner: out of reach zoomed in, on it zoomed out.
    const spot: LngLat = [0.02, 0];
    expect(nearestVertex(project(spot), [vertices[0]], project, 12)).toBeNull();
    expect(nearestVertex(zoomedOut(spot), [vertices[0]], zoomedOut, 12)?.id).toBe(1);
  });
});

describe("isComfortablyFramed", () => {
  const size = { width: 800, height: 600 };
  const inView = (x: number, y: number): LngLat => [x / 1000, -y / 1000];

  it("accepts a boundary that is on screen and a usable size", () => {
    expect(isComfortablyFramed([inView(100, 100), inView(400, 350)], project, size)).toBe(true);
  });

  it("rejects a speck", () => {
    expect(isComfortablyFramed([inView(100, 100), inView(110, 110)], project, size)).toBe(false);
  });

  it("rejects a boundary that leaves the view", () => {
    expect(isComfortablyFramed([inView(100, 100), inView(900, 300)], project, size)).toBe(false);
    expect(isComfortablyFramed([inView(-10, 100), inView(400, 300)], project, size)).toBe(false);
  });

  it("has nothing to reframe without points", () => {
    expect(isComfortablyFramed([], project, size)).toBe(true);
  });
});
