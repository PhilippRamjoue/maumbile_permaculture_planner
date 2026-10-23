import type { Polygon, Position } from "geojson";
import { TerraDraw, TerraDrawExtend, type TerraDrawMouseEvent } from "terra-draw";
import { describe, expect, it } from "vitest";

import type { DesignFeature, PlanLayer } from "../../entities/planning";
import { sectorFeature, sectorWedge } from "./sectors";
import { FakeMap, type FakePoint } from "../../shared/testing/fakeMaplibre";
import {
  SNAP_REACH_PX,
  createEditorModes,
  isOnCorner,
  pickBox,
  pickFeature,
  roundGeometry,
  snapTargets,
  snapToTargets,
  verticesOf,
} from "./editorModes";
import type { EditorDocument } from "./store";

const layer = (id: string, visible = true): PlanLayer =>
  ({ id, name: id, visible, sort_order: 0 }) as PlanLayer;
const feature = (id: string, layer_id: string, geometry: DesignFeature["geometry"]) =>
  ({
    type: "Feature",
    id,
    layer_id,
    feature_type: "zone",
    element_type_id: null,
    geometry,
    properties: {},
  }) as DesignFeature;

const square = (x: number, y: number, size = 0.001): Polygon => ({
  type: "Polygon",
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});

describe("snapTargets", () => {
  const document: EditorDocument = {
    layers: [layer("a"), layer("hidden", false)],
    features: [
      feature("one", "a", square(36.8, -1.2)),
      feature("two", "a", { type: "Point", coordinates: [36.9, -1.3] }),
      feature("ghost", "hidden", square(37, -1.4)),
    ],
  };

  it("offers the corners of visible features and the site boundary", () => {
    const boundary = square(36.7, -1.1);
    const targets = snapTargets(document, null, boundary);
    expect(targets).toContainEqual([36.8, -1.2]);
    expect(targets).toContainEqual([36.9, -1.3]);
    expect(targets).toContainEqual([36.7, -1.1]);
    expect(targets).not.toContainEqual([37, -1.4]);
  });

  it("leaves out the feature being edited, so a corner cannot snap back onto itself", () => {
    expect(snapTargets(document, "one")).not.toContainEqual([36.8, -1.2]);
    expect(snapTargets(document, "one")).toContainEqual([36.9, -1.3]);
  });

  it("knows the vertices of each geometry type", () => {
    expect(verticesOf({ type: "Point", coordinates: [1, 2] })).toEqual([[1, 2]]);
    expect(
      verticesOf({
        type: "LineString",
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      }),
    ).toHaveLength(2);
    expect(verticesOf(square(0, 0))).toHaveLength(5);
  });
});

describe("picking", () => {
  it("prefers a marker or path over the zone under it, whatever the layer order", () => {
    expect(
      pickFeature([
        { id: "zone", geometryType: "Polygon" },
        { id: "path", geometryType: "LineString" },
        { id: "tree", geometryType: "Point" },
      ]),
    ).toBe("tree");
    expect(
      pickFeature([
        { id: "zone", geometryType: "Polygon" },
        { id: "path", geometryType: "LineString" },
      ]),
    ).toBe("path");
  });

  it("takes the topmost of equals, and nothing for nothing", () => {
    expect(
      pickFeature([
        { id: "top", geometryType: "Polygon" },
        { id: "below", geometryType: "Polygon" },
      ]),
    ).toBe("top");
    expect(pickFeature([])).toBeUndefined();
  });

  it("searches a few pixels around the click, so a thin path can be hit", () => {
    const [[x0, y0], [x1, y1]] = pickBox({ x: 100, y: 50 });
    expect(x1 - x0).toBeGreaterThanOrEqual(10);
    expect(y1 - y0).toBeGreaterThanOrEqual(10);
    expect((x0 + x1) / 2).toBe(100);
    expect((y0 + y1) / 2).toBe(50);
  });

  it("recognises a click on a corner of the feature being edited", () => {
    const project = ([x, y]: Position) => ({ x: x * 10, y: y * 10 });
    const corners: Position[] = [
      [10, 10],
      [30, 10],
    ];
    expect(isOnCorner({ x: 105, y: 108 }, corners, project)).toBe(true);
    expect(isOnCorner({ x: 200, y: 100 }, corners, project)).toBe(false);
  });
});

/**
 * Terra Draw's real draw and select modes, driven through a test adapter that projects with a real
 * Web-Mercator camera (the fake map's). Events are fed straight to the mode callbacks, as the
 * browser adapter would after converting a pointer event to a pixel and coordinate.
 */
class CameraAdapter extends TerraDrawExtend.TerraDrawBaseAdapter {
  readonly camera = new FakeMap({ center: [36.8, -1.2], zoom: 17 });

  constructor() {
    super({ coordinatePrecision: 8 });
  }
  getMapEventElement() {
    return document.createElement("div");
  }
  project(lng: number, lat: number) {
    return this.camera.project([lng, lat]);
  }
  unproject(x: number, y: number) {
    return this.camera.unproject({ x, y });
  }
  setCursor() {}
  getLngLatFromEvent() {
    return null;
  }
  setDraggability() {}
  setDoubleClickToZoom() {}
  render() {}
  clear() {}

  event(pixel: FakePoint): TerraDrawMouseEvent {
    const { lng, lat } = this.camera.unproject(pixel);
    return {
      lng,
      lat,
      containerX: pixel.x,
      containerY: pixel.y,
      button: "left",
      heldKeys: [],
      isContextMenu: false,
    };
  }
  private get callbacks() {
    return this._currentModeCallbacks!;
  }
  move(pixel: FakePoint) {
    this.callbacks.onMouseMove(this.event(pixel));
  }
  click(pixel: FakePoint) {
    this.move(pixel);
    this.callbacks.onClick(this.event(pixel));
  }
  /** Press at `from`, drag to `to`, release. */
  drag(from: FakePoint, to: FakePoint) {
    this.move(from);
    this.callbacks.onDragStart(this.event(from), () => {});
    this.callbacks.onDrag(this.event(to), () => {});
    this.callbacks.onDragEnd(this.event(to), () => {});
  }
}

function editor(targets: Position[] = []) {
  const adapter = new CameraAdapter();
  const draw = new TerraDraw({ adapter, modes: createEditorModes(() => targets) });
  draw.start();
  return { adapter, draw };
}

/** The pixel of a coordinate under the adapter's current camera. */
const px = (adapter: CameraAdapter, [lng, lat]: Position) => adapter.camera.project([lng, lat]);

describe("snapToTargets", () => {
  const adapter = new CameraAdapter();
  const context = {
    project: (lng: number, lat: number) => adapter.project(lng, lat),
    unproject: (x: number, y: number) => adapter.unproject(x, y),
    getCurrentGeometrySnapshot: () => null,
  };
  const target: Position = [36.8005, -1.2005];
  const snap = snapToTargets(() => [target]);
  const at = (x: number, y: number) => adapter.event({ x, y });

  it("snaps onto a target within reach and returns its exact coordinates", () => {
    const { x, y } = px(adapter, target);
    expect(snap(at(x + 6, y - 5), context)).toEqual(target);
  });

  it("leaves a click outside reach alone", () => {
    const { x, y } = px(adapter, target);
    expect(snap(at(x + SNAP_REACH_PX + 3, y), context)).toBeUndefined();
  });

  it("measures reach on screen: zoomed out, targets 5 m apart in reality both feel close", () => {
    adapter.camera.jumpTo({ zoom: 10 });
    const { x, y } = px(adapter, target);
    expect(snap(at(x + 6, y), context)).toEqual(target);
    adapter.camera.jumpTo({ zoom: 17 });
  });
});

describe("editor modes in Terra Draw", () => {
  function drawZone(adapter: CameraAdapter, draw: TerraDraw, corners: FakePoint[]) {
    draw.setMode("polygon");
    corners.forEach((corner) => adapter.click(corner));
    adapter.click(corners[corners.length - 1]); // clicking the last corner again finishes
    return draw.getSnapshot().find((f) => f.geometry.type === "Polygon")!;
  }

  it("snaps a drawn corner onto another feature's corner", () => {
    const target: Position = [36.8002, -1.2003];
    const { adapter, draw } = editor([target]);
    const at = px(adapter, target);

    const zone = drawZone(adapter, draw, [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: at.x + 5, y: at.y - 4 }, // a few pixels off the target corner
    ]);

    const ring = (zone.geometry as Polygon).coordinates[0];
    expect(ring).toContainEqual(target);
  });

  it("does not snap a corner placed outside snap reach", () => {
    const target: Position = [36.8002, -1.2003];
    const { adapter, draw } = editor([target]);
    const at = px(adapter, target);

    const zone = drawZone(adapter, draw, [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: at.x + 40, y: at.y },
    ]);

    const ring = (zone.geometry as Polygon).coordinates[0];
    expect(ring).not.toContainEqual(target);
  });

  /** A selected 200 px square in the middle of the map, ready to edit. */
  function selectedSquare(targets: Position[] = []) {
    const { adapter, draw } = editor(targets);
    const corners = [
      { x: 300, y: 200 },
      { x: 500, y: 200 },
      { x: 500, y: 400 },
      { x: 300, y: 400 },
    ].map((p) => {
      const { lng, lat } = adapter.camera.unproject(p);
      return [Number(lng.toFixed(8)), Number(lat.toFixed(8))] as Position; // Terra Draw's precision
    });
    const results = draw.addFeatures([
      {
        type: "Feature",
        id: "11111111-1111-4111-8111-111111111111",
        geometry: { type: "Polygon", coordinates: [[...corners, corners[0]]] },
        properties: { mode: "polygon" },
      },
    ]);
    expect(results[0]).toMatchObject({ valid: true });
    draw.setMode("select");
    draw.selectFeature("11111111-1111-4111-8111-111111111111");
    return { adapter, draw, corners, id: "11111111-1111-4111-8111-111111111111" };
  }

  const ringOf = (draw: TerraDraw, id: string) =>
    (draw.getSnapshotFeature(id)!.geometry as Polygon).coordinates[0];

  it("drags a vertex by exactly the distance the pointer moved", () => {
    const { adapter, draw, id } = selectedSquare();
    const finished: string[] = [];
    draw.on("finish", (_id, context) => finished.push(context.action));

    adapter.drag({ x: 500, y: 200 }, { x: 560, y: 150 });

    const moved = ringOf(draw, id)[1];
    const wanted = adapter.camera.unproject({ x: 560, y: 150 });
    expect(moved[0]).toBeCloseTo(wanted.lng, 7);
    expect(moved[1]).toBeCloseTo(wanted.lat, 7);
    expect(finished).toEqual(["dragCoordinate"]);
  });

  it("grabs only a vertex it is actually near, not one 30 px away", () => {
    // Terra Draw's own default reach is 40 px, which grabs a corner from well outside the plot.
    const { adapter, draw, id } = selectedSquare();
    const before = ringOf(draw, id);

    adapter.drag({ x: 522, y: 178 }, { x: 600, y: 100 }); // 31 px off the corner at (500, 200)
    expect(ringOf(draw, id)).toEqual(before);

    adapter.drag({ x: 510, y: 190 }, { x: 560, y: 150 }); // 14 px off it: close enough
    expect(ringOf(draw, id)[1]).not.toEqual(before[1]);
    expect(ringOf(draw, id)[0]).toEqual(before[0]);
    expect(ringOf(draw, id)[2]).toEqual(before[2]);
  });

  it("drags precisely at every zoom", () => {
    for (const zoom of [8, 14, 17, 20, 22]) {
      const { adapter, draw, corners, id } = selectedSquare();
      adapter.camera.jumpTo({ center: corners[1] as [number, number], zoom });
      const start = px(adapter, corners[1]);
      const to = { x: start.x + 37, y: start.y + 23 };

      adapter.drag(start, to);

      const moved = ringOf(draw, id)[1];
      const back = px(adapter, moved);
      expect(Math.hypot(back.x - to.x, back.y - to.y)).toBeLessThan(0.05);
    }
  });

  it("snaps a dragged vertex onto another feature's corner, exactly", () => {
    const target: Position = [36.8004, -1.2004];
    const { adapter, draw, id } = selectedSquare([target]);
    const at = px(adapter, target);

    adapter.drag({ x: 500, y: 200 }, { x: at.x + 6, y: at.y + 4 });

    expect(ringOf(draw, id)[1]).toEqual(target);
  });

  it("leaves a dragged vertex unsnapped beyond snap reach", () => {
    const target: Position = [36.8004, -1.2004];
    const { adapter, draw, id } = selectedSquare([target]);
    const at = px(adapter, target);

    adapter.drag({ x: 500, y: 200 }, { x: at.x + 30, y: at.y });

    expect(ringOf(draw, id)[1]).not.toEqual(target);
  });

  it("deletes a vertex through the editor's coordinate-deletion flag", () => {
    const { draw, id } = selectedSquare();
    expect(ringOf(draw, id)).toHaveLength(5);
    // Terra Draw deletes a coordinate on right-click; the flag is what the editor configures.
    const mode = createEditorModes(() => [])[4] as unknown as {
      flags: { polygon: { feature: { coordinates: { deletable: boolean; snappable: unknown } } } };
    };
    expect(mode.flags.polygon.feature.coordinates.deletable).toBe(true);
    expect(mode.flags.polygon.feature.coordinates.snappable).toBeTruthy();
  });
});

describe("selecting a sector in Terra Draw", () => {
  // The site centroid has far more decimals than the editor stores.
  const centroid: [number, number] = [36.588374728697275, -3.326970021640812];
  const id = "22222222-2222-4222-8222-222222222222";
  const add = (draw: TerraDraw, geometry: Polygon) =>
    draw.addFeatures([{ type: "Feature", id, geometry, properties: { mode: "polygon" } }])[0];

  const editorDraw = () => editor().draw;

  it("accepts a sun wedge drawn from the site centroid", () => {
    const sun = sectorFeature(
      { kind: "sun", from: 102.4, to: 257.6, origin: centroid, radiusM: 60 },
      id,
      "layer",
    );
    expect(add(editorDraw(), sun.geometry as Polygon)).toMatchObject({ valid: true });
  });

  it("accepts an older, unrounded wedge once it is rounded for the editor", () => {
    const unrounded = sectorWedge(centroid, 102.4, 257.6, 60);
    unrounded.coordinates[0][0] = centroid; // as saved before the tip was rounded
    unrounded.coordinates[0][unrounded.coordinates[0].length - 1] = centroid;

    expect(add(editorDraw(), unrounded)).toMatchObject({ valid: false });
    expect(add(editorDraw(), roundGeometry(unrounded))).toMatchObject({ valid: true });
  });
});
