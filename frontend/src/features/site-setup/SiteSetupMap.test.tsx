import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_MAP_SIZE, FakeMap, type FakePoint } from "../../shared/testing/fakeMaplibre";
import { imageryMeta, site, user } from "../../shared/testing/fixtures";
import { mockApi } from "../../shared/testing/mockApi";
import { renderApp } from "../../shared/testing/renderApp";
import { parseNumber, type LngLat } from "./geometry";

vi.mock(
  "maplibre-gl",
  async () => (await import("../../shared/testing/fakeMaplibre")).fakeMaplibreModule,
);

const emptyList = { json: { items: [], total: 0, limit: 100, offset: 0 } };

function handlers() {
  return {
    "GET /auth/me": { json: { ...user, country_code: null } },
    "GET /sites": emptyList,
    [`GET /sites/${site.id}`]: { json: site },
    [`GET /sites/${site.id}/imagery/meta`]: { json: imageryMeta },
  };
}

const NAIROBI: [number, number] = [36.8219, -1.2921];
/** Pixel offsets of the four corners of a square, 200 px apart, around the map centre. */
const SQUARE: FakePoint[] = [
  { x: 300, y: 200 },
  { x: 500, y: 200 },
  { x: 500, y: 400 },
  { x: 300, y: 400 },
];

/** Opens step 2 and returns the setup map, centred on Nairobi at a working zoom. */
async function openSetupMap(zoom = 17): Promise<FakeMap> {
  mockApi(handlers());
  renderApp("/sites/new");
  await userEvent.selectOptions(await screen.findByLabelText("Country"), "KE");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: /step 2 of 2/i });
  await waitFor(() => {
    expect(FakeMap.instances.at(-1)?.canvas.style.cursor).toBe("crosshair");
  });
  const map = FakeMap.instances.at(-1)!;
  act(() => map.jumpTo({ center: NAIROBI, zoom }));
  return map;
}

const click = (map: FakeMap, point: FakePoint) => act(() => void map.trigger("click", { point }));

/** A full press-move-release of the pointer, as MapLibre reports it. */
function drag(map: FakeMap, from: FakePoint, to: FakePoint, steps = 4) {
  let down!: ReturnType<FakeMap["trigger"]>;
  act(() => {
    down = map.trigger("mousedown", { point: from });
    for (let i = 1; i <= steps; i++) {
      map.trigger("mousemove", {
        point: {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        },
      });
    }
  });
  return {
    down,
    release: () => act(() => void map.trigger("mouseup", { point: to })),
  };
}

function dragAndRelease(map: FakeMap, from: FakePoint, to: FakePoint) {
  const { down, release } = drag(map, from, to);
  release();
  return down;
}

/** Click the square's four corners; returns their (stored) coordinates. */
function drawSquare(map: FakeMap) {
  SQUARE.forEach((point) => click(map, point));
  return rowValues();
}

/** What the table currently holds, parsed. */
function rowValues(): LngLat[] {
  const rows = screen.queryAllByLabelText(/^Point \d+ latitude$/).length;
  return Array.from({ length: rows }, (_, i) => [
    parseNumber((screen.getByLabelText(`Point ${i + 1} longitude`) as HTMLInputElement).value)!,
    parseNumber((screen.getByLabelText(`Point ${i + 1} latitude`) as HTMLInputElement).value)!,
  ]);
}

interface PreviewFeature {
  geometry: { coordinates: LngLat };
  properties: { kind: string; index: number; selected: boolean; hover: boolean; snap: boolean };
}
function previewVertices(map: FakeMap): PreviewFeature[] {
  const source = map.sources.get("draft-boundary") as { data: { features: PreviewFeature[] } };
  return source?.data.features.filter((f) => f.properties.kind === "vertex") ?? [];
}

/** The map's preview must always be exactly the table's data — whatever was clicked or zoomed. */
function expectPreviewMatchesTable(map: FakeMap) {
  expect(previewVertices(map).map((f) => f.geometry.coordinates)).toEqual(rowValues());
}

describe("site setup map: precision", () => {
  beforeEach(() => FakeMap.reset());

  it.each([2, 6, 10, 14, 17, 19, 21, 22])(
    "puts a clicked corner exactly under the pointer at zoom %i",
    async (zoom) => {
      const map = await openSetupMap(zoom);
      const clicked = { x: 437.3, y: 211.7 };

      click(map, clicked);

      const [stored] = rowValues();
      const back = map.project(stored);
      // Well under a hundredth of a pixel, even at the deepest zoom.
      expect(Math.hypot(back.x - clicked.x, back.y - clicked.y)).toBeLessThan(0.05);
      await waitFor(() => expectPreviewMatchesTable(map));
    },
  );

  it("wraps a click made past the antimeridian back into a valid longitude", async () => {
    const map = await openSetupMap(4);
    act(() => map.jumpTo({ center: [179.5, 0], zoom: 4 }));

    // 100 px right of centre is well past 180°, which MapLibre reports unwrapped.
    click(map, { x: FAKE_MAP_SIZE.width / 2 + 100, y: FAKE_MAP_SIZE.height / 2 });

    const [[lng]] = rowValues();
    expect(lng).toBeGreaterThanOrEqual(-180);
    expect(lng).toBeLessThanOrEqual(180);
    expect(lng).toBeLessThan(-170);
    expect(screen.queryByText(/longitude must be between/i)).not.toBeInTheDocument();
  });

  it("never re-frames the map for a click or a drag of its own", async () => {
    const map = await openSetupMap();
    drawSquare(map);
    dragAndRelease(map, SQUARE[1], { x: 540, y: 150 });

    expect(map.fits).toHaveLength(0);
    expect(map.getZoom()).toBe(17);
  });
});

describe("site setup map: dragging a corner", () => {
  beforeEach(() => FakeMap.reset());

  it("moves the corner by exactly the distance the pointer moved, without jumping", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);
    // Grab the corner 3 px off its centre; the corner must keep that offset.
    const from = { x: SQUARE[1].x + 3, y: SQUARE[1].y + 2 };
    const to = { x: from.x + 61, y: from.y - 47 };

    dragAndRelease(map, from, to);

    const after = rowValues();
    const wanted = map.unproject({ x: SQUARE[1].x + 61, y: SQUARE[1].y - 47 });
    expect(after[1][0]).toBeCloseTo(wanted.lng, 8);
    expect(after[1][1]).toBeCloseTo(wanted.lat, 8);
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual(before[2]);
    expect(after[3]).toEqual(before[3]);
    expect(map.fits).toHaveLength(0);
    await waitFor(() => expectPreviewMatchesTable(map));
  });

  it("takes over the pointer so the map does not pan, and gives it back afterwards", async () => {
    const map = await openSetupMap();
    drawSquare(map);

    const { down, release } = drag(map, SQUARE[2], { x: 560, y: 420 });
    expect(down.defaultPrevented).toBe(true);
    expect(map.dragPan.enabled).toBe(false);
    expect(map.canvas.style.cursor).toBe("grabbing");

    release();
    expect(map.dragPan.enabled).toBe(true);
    expect(map.canvas.style.cursor).not.toBe("grabbing");
  });

  it("leaves a press on empty map alone, so the map still pans", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);

    const down = dragAndRelease(map, { x: 100, y: 100 }, { x: 150, y: 140 });

    expect(down.defaultPrevented).toBe(false);
    expect(rowValues()).toEqual(before);
  });

  it("ignores a shaky click, which is not a drag", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);

    dragAndRelease(map, SQUARE[0], { x: SQUARE[0].x + 2, y: SQUARE[0].y + 1 });

    expect(rowValues()).toEqual(before);
  });

  it("does not drop a new corner when the drag ends", async () => {
    const map = await openSetupMap();
    drawSquare(map);

    dragAndRelease(map, SQUARE[0], { x: 330, y: 250 });
    click(map, { x: 330, y: 250 }); // the click MapLibre fires when the button comes up

    expect(rowValues()).toHaveLength(4);
  });

  it("is a single undo step, and redo puts it back", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);
    dragAndRelease(map, SQUARE[3], { x: 250, y: 470 });
    const moved = rowValues();
    expect(moved[3]).not.toEqual(before[3]);

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(rowValues()).toEqual(before);

    await userEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(rowValues()).toEqual(moved);
  });

  it("turns the ring red when a drag makes it cross itself, and green again on undo", async () => {
    const map = await openSetupMap();
    drawSquare(map);

    dragAndRelease(map, SQUARE[3], { x: 600, y: 300 });
    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/crosses itself/i);

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/boundary looks good/i);
  });

  it("keeps working on touch screens with a larger reach", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);

    // 18 px off the corner: outside a mouse's reach, inside a finger's.
    const from = { x: SQUARE[0].x + 18, y: SQUARE[0].y };
    let down!: ReturnType<FakeMap["trigger"]>;
    act(() => {
      down = map.trigger("touchstart", { point: from });
      map.trigger("touchmove", { point: { x: from.x + 30, y: from.y + 30 } });
      map.trigger("touchend", { point: { x: from.x + 30, y: from.y + 30 } });
    });

    expect(down.defaultPrevented).toBe(true);
    expect(rowValues()[0]).not.toEqual(before[0]);
  });
});

describe("site setup map: selecting and deleting corners", () => {
  beforeEach(() => FakeMap.reset());

  it("selects a corner by clicking it, instead of adding one on top of it", async () => {
    const map = await openSetupMap();
    drawSquare(map);

    click(map, { x: SQUARE[2].x + 4, y: SQUARE[2].y - 3 });

    expect(rowValues()).toHaveLength(4);
    await waitFor(() =>
      expect(previewVertices(map).map((f) => f.properties.selected)).toEqual([
        false,
        false,
        true,
        false,
      ]),
    );
    expect(screen.getByLabelText("Point 3 latitude").closest("tr")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("deletes the selected corner with the Delete key, and undo brings it back", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);
    click(map, SQUARE[1]);

    await userEvent.keyboard("{Delete}");

    expect(rowValues()).toEqual([before[0], before[2], before[3]]);
    await waitFor(() => expectPreviewMatchesTable(map));
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(rowValues()).toEqual(before);
  });

  it("deletes the selected corner with its button, which needs a selection", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);
    const remove = screen.getByRole("button", { name: "Delete selected corner" });
    expect(remove).toBeDisabled();

    click(map, SQUARE[0]);
    expect(remove).toBeEnabled();
    await userEvent.click(remove);

    expect(rowValues()).toEqual(before.slice(1));
    expect(remove).toBeDisabled();
  });

  it("deselects with Escape or by adding a corner elsewhere", async () => {
    const map = await openSetupMap();
    drawSquare(map);
    click(map, SQUARE[1]);
    const remove = screen.getByRole("button", { name: "Delete selected corner" });
    expect(remove).toBeEnabled();

    await userEvent.keyboard("{Escape}");
    expect(remove).toBeDisabled();

    click(map, SQUARE[1]);
    click(map, { x: 150, y: 500 });
    expect(rowValues()).toHaveLength(5);
    expect(remove).toBeDisabled();
  });

  it("selects the corner whose table row is being edited, and leaves Delete to the text field", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);

    await userEvent.click(screen.getByLabelText("Point 2 latitude"));
    await waitFor(() => expect(previewVertices(map)[1].properties.selected).toBe(true));

    // Backspace in a text field edits the text; it must not delete the corner.
    await userEvent.keyboard("{Backspace}");
    expect(screen.getAllByLabelText(/^Point \d+ latitude$/)).toHaveLength(4);
    expect(rowValues()[0]).toEqual(before[0]);
  });

  it("highlights the corner under the pointer and shows a grab cursor", async () => {
    const map = await openSetupMap();
    drawSquare(map);

    act(() => void map.trigger("mousemove", { point: { x: SQUARE[2].x + 5, y: SQUARE[2].y } }));
    await waitFor(() => expect(previewVertices(map)[2].properties.hover).toBe(true));
    expect(map.canvas.style.cursor).toBe("grab");

    act(() => void map.trigger("mousemove", { point: { x: 100, y: 100 } }));
    await waitFor(() => expect(previewVertices(map).some((f) => f.properties.hover)).toBe(false));
    expect(map.canvas.style.cursor).toBe("crosshair");
  });
});

describe("site setup map: snapping", () => {
  beforeEach(() => FakeMap.reset());

  it("snaps a dragged corner onto a nearby corner exactly, and says so while dragging", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);

    // 8 px short of corner 1.
    const { release } = drag(map, SQUARE[2], { x: SQUARE[0].x + 6, y: SQUARE[0].y + 5 });
    await waitFor(() => expect(previewVertices(map)[0].properties.snap).toBe(true));
    release();

    expect(rowValues()[2]).toEqual(before[0]); // identical, not merely close
    await waitFor(() => expect(previewVertices(map).some((f) => f.properties.snap)).toBe(false));
  });

  it("does not snap from further away than the snap distance", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);

    dragAndRelease(map, SQUARE[2], { x: SQUARE[0].x + 20, y: SQUARE[0].y });

    expect(rowValues()[2]).not.toEqual(before[0]);
    expect(rowValues()[2][1]).toBeCloseTo(before[0][1], 5);
  });

  it("closes the ring when the last corner is snapped onto the first", async () => {
    const map = await openSetupMap();
    drawSquare(map);

    dragAndRelease(map, SQUARE[3], { x: SQUARE[0].x + 3, y: SQUARE[0].y + 3 });

    // Corner 4 on top of corner 1 is the closing vertex, not a duplicate to fix.
    const values = rowValues();
    expect(values[3]).toEqual(values[0]);
    expect(screen.getByTestId("boundary-status")).not.toHaveTextContent(/identical/i);
  });
});

describe("site setup map: zoom stability", () => {
  beforeEach(() => FakeMap.reset());

  it("keeps the preview identical to the data through every zoom change", async () => {
    const map = await openSetupMap();
    const drawn = drawSquare(map);

    for (const zoom of [3, 9, 15, 20, 22, 17]) {
      act(() => map.jumpTo({ zoom }));
      expect(rowValues()).toEqual(drawn);
      await waitFor(() => expectPreviewMatchesTable(map));
    }
  });

  it("still hits, selects and drags a corner after zooming out and back in", async () => {
    const map = await openSetupMap();
    const before = drawSquare(map);

    // Zoomed out the whole square is a few pixels wide: pointing at the corner selects it.
    act(() => map.jumpTo({ zoom: 12 }));
    click(map, map.project(before[1]));
    expect(rowValues()).toHaveLength(4);
    await waitFor(() => expect(previewVertices(map)[1].properties.selected).toBe(true));

    // Back in, the same corner is draggable where it now is.
    act(() => map.jumpTo({ center: before[1], zoom: 20 }));
    const at = map.project(before[1]);
    dragAndRelease(map, at, { x: at.x + 40, y: at.y + 25 });

    const wanted = map.unproject({ x: at.x + 40, y: at.y + 25 });
    expect(rowValues()[1][0]).toBeCloseTo(wanted.lng, 8);
    expect(rowValues()[1][1]).toBeCloseTo(wanted.lat, 8);
    await waitFor(() => expectPreviewMatchesTable(map));
  });

  it("measures reach in pixels: the same near-miss adds a corner once zoomed in", async () => {
    const map = await openSetupMap(12);
    click(map, { x: 300, y: 200 });
    const second = { x: 310, y: 200 }; // 10 px away: on the corner at this zoom

    click(map, second);
    expect(rowValues()).toHaveLength(1);

    act(() => map.jumpTo({ zoom: 20 })); // the first corner is now far from where we click
    click(map, second);
    expect(rowValues()).toHaveLength(2);
    await waitFor(() => expectPreviewMatchesTable(map));
  });

  it("survives a mixed session of clicks, drags, zooms and undo without drifting", async () => {
    const map = await openSetupMap();
    drawSquare(map);

    act(() => map.jumpTo({ center: rowValues()[0], zoom: 19 }));
    const first = map.project(rowValues()[0]);
    dragAndRelease(map, first, { x: first.x + 33, y: first.y + 21 });
    const afterDrag = rowValues();

    act(() => map.jumpTo({ zoom: 8 }));
    act(() => map.jumpTo({ zoom: 17 }));
    expect(rowValues()).toEqual(afterDrag);
    await waitFor(() => expectPreviewMatchesTable(map));

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    act(() => map.jumpTo({ zoom: 22 }));
    await userEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(rowValues()).toEqual(afterDrag);
    await waitFor(() => expectPreviewMatchesTable(map));
  });
});

describe("site setup map: framing", () => {
  beforeEach(() => FakeMap.reset());

  it("zooms to the boundary on request, with every corner on screen", async () => {
    const map = await openSetupMap();
    drawSquare(map);
    act(() => map.jumpTo({ center: [30, 5], zoom: 4 })); // the land is far out of view
    const zoomButton = screen.getByRole("button", { name: "Zoom to boundary" });

    await userEvent.click(zoomButton);

    expect(map.fits).toHaveLength(1);
    for (const corner of rowValues()) {
      const at = map.project(corner);
      expect(at.x).toBeGreaterThan(0);
      expect(at.x).toBeLessThan(FAKE_MAP_SIZE.width);
      expect(at.y).toBeGreaterThan(0);
      expect(at.y).toBeLessThan(FAKE_MAP_SIZE.height);
    }
  });

  it("has nothing to zoom to before the first corner", async () => {
    await openSetupMap();
    expect(screen.getByRole("button", { name: "Zoom to boundary" })).toBeDisabled();
  });

  it("does not move a map that already shows the boundary well when a corner is undone", async () => {
    const map = await openSetupMap();
    drawSquare(map);

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(map.fits).toHaveLength(0);
  });

  it("brings an undone boundary back into view when it is off screen", async () => {
    const map = await openSetupMap();
    drawSquare(map);
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    act(() => map.jumpTo({ center: [30, 5], zoom: 6 }));

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(map.fits).toHaveLength(1));
  });
});

describe("site setup map: undo and redo", () => {
  beforeEach(() => FakeMap.reset());

  it("steps back through clicks, deletions and clear, with the keyboard too", async () => {
    const map = await openSetupMap();
    const drawn = drawSquare(map);
    click(map, SQUARE[0]);
    await userEvent.keyboard("{Delete}");
    expect(rowValues()).toHaveLength(3);

    await userEvent.keyboard("{Control>}z{/Control}");
    expect(rowValues()).toEqual(drawn);
    await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(rowValues()).toHaveLength(3);
    await userEvent.keyboard("{Control>}y{/Control}"); // nothing left to redo
    expect(rowValues()).toHaveLength(3);

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(rowValues()).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(rowValues()).toHaveLength(3);
  });

  it("starts empty: nothing to undo or redo", async () => {
    await openSetupMap();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });
});
