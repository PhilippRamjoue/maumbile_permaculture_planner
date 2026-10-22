import { beforeEach, describe, expect, it } from "vitest";

import { analyseRows, useSetupStore } from "./store";

const store = () => useSetupStore.getState();
const cells = () => store().rows.map((r) => `${r.lat},${r.lng}`);

describe("site setup store: history", () => {
  beforeEach(() => store().reset());

  it("undoes and redoes additions", () => {
    store().addPoints([[36.8, -1.2]]);
    store().addPoints([[36.9, -1.3]]);

    store().undo();
    expect(cells()).toEqual(["-1.2,36.8"]);
    store().redo();
    expect(cells()).toEqual(["-1.2,36.8", "-1.3,36.9"]);
  });

  it("drops the redo branch when something new is done", () => {
    store().addPoints([[36.8, -1.2]]);
    store().addPoints([[36.9, -1.3]]);
    store().undo();
    store().addPoints([[37, -1.4]]);

    store().redo();
    expect(cells()).toEqual(["-1.2,36.8", "-1.4,37"]);
  });

  it("folds every move of one drag into a single step, and a new drag into a new one", () => {
    store().addPoints([[36.8, -1.2]]);
    const id = store().rows[0].id;
    store().movePoint(id, [36.81, -1.21], "drag-1");
    store().movePoint(id, [36.82, -1.22], "drag-1");
    store().movePoint(id, [36.83, -1.23], "drag-1");
    store().movePoint(id, [36.9, -1.9], "drag-2");

    store().undo();
    expect(cells()).toEqual(["-1.23,36.83"]);
    store().undo();
    expect(cells()).toEqual(["-1.2,36.8"]);
  });

  it("folds typing in one cell into a single step", () => {
    store().addEmptyRow();
    const id = store().rows[0].id;
    for (const text of ["-", "-1", "-1.", "-1.2"]) store().updateRow(id, "lat", text);

    store().undo();
    expect(store().rows[0].lat).toBe("");
    expect(store().rows).toHaveLength(1);
  });

  it("does not fold typing into an earlier session after something else happened", () => {
    store().addEmptyRow();
    const id = store().rows[0].id;
    store().updateRow(id, "lat", "-1");
    store().addPoints([[36.8, -1.2]]);
    store().updateRow(id, "lat", "-1.5");

    store().undo();
    expect(store().rows[0].lat).toBe("-1");
  });

  it("can undo a deletion and a clear", () => {
    store().addPoints([[36.8, -1.2]]);
    store().addPoints([[36.9, -1.3]]);
    store().select(store().rows[0].id);
    store().deleteSelected();
    expect(cells()).toEqual(["-1.3,36.9"]);
    store().clearRows();

    store().undo();
    expect(cells()).toEqual(["-1.3,36.9"]);
    store().undo();
    expect(cells()).toEqual(["-1.2,36.8", "-1.3,36.9"]);
  });

  it("does nothing when there is nothing to undo or redo", () => {
    store().undo();
    store().redo();
    expect(store().rows).toEqual([]);
  });

  it("starts fresh after reset", () => {
    store().addPoints([[36.8, -1.2]]);
    store().reset();
    expect(store().past).toEqual([]);
    expect(store().future).toEqual([]);
  });
});

describe("site setup store: selection", () => {
  beforeEach(() => store().reset());

  it("selects only corners that exist", () => {
    store().addPoints([[36.8, -1.2]]);
    store().select(9999);
    expect(store().selectedRowId).toBeNull();
    store().select(store().rows[0].id);
    expect(store().selectedRowId).toBe(store().rows[0].id);
  });

  it("clears the selection when its corner goes away, by undo or remove", () => {
    store().addPoints([[36.8, -1.2]]);
    store().select(store().rows[0].id);
    store().undo();
    expect(store().selectedRowId).toBeNull();

    store().redo();
    store().select(store().rows[0].id);
    store().removeRow(store().rows[0].id);
    expect(store().selectedRowId).toBeNull();
  });

  it("keeps the selection through a drag of that corner", () => {
    store().addPoints([[36.8, -1.2]]);
    const id = store().rows[0].id;
    store().select(id);
    store().movePoint(id, [36.81, -1.21], "drag-1");
    expect(store().selectedRowId).toBe(id);
  });

  it("deleteSelected without a selection changes nothing", () => {
    store().addPoints([[36.8, -1.2]]);
    store().deleteSelected();
    expect(store().rows).toHaveLength(1);
    expect(store().past).toHaveLength(1);
  });
});

describe("analyseRows", () => {
  beforeEach(() => store().reset());

  it("reports which row each point came from, skipping rows that do not parse", () => {
    store().addPoints([[36.8, -1.2]]);
    store().addEmptyRow();
    store().addPoints([[36.9, -1.3]]);
    const ids = store().rows.map((r) => r.id);

    const analysis = analyseRows(store().rows);

    expect(analysis.points).toHaveLength(2);
    expect(analysis.pointRowIds).toEqual([ids[0], ids[2]]);
  });
});
