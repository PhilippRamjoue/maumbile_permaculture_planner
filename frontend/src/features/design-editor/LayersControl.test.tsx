import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { LayersControl } from "./LayersControl";
import { createEditorStore } from "./store";

const layers = [
  { id: "l1", name: "Elements", visible: true, sort_order: 1 },
  { id: "l2", name: "Sectors", visible: true, sort_order: 2 },
];

async function open() {
  const store = createEditorStore({ features: [], layers: layers as never });
  render(<LayersControl state={store.getState()} disabled={false} />);
  await userEvent.click(screen.getByRole("button", { name: "Layers" }));
  return store;
}

describe("LayersControl", () => {
  beforeEach(() => localStorage.clear());

  it("lists the layers with visibility toggles, and no basemap or draw-into knobs", async () => {
    await open();
    expect(screen.getByRole("checkbox", { name: /Elements/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Sectors/ })).toBeChecked();
    // The basemap moved to its own switcher; shapes auto-file into their kind's layer.
    expect(screen.queryByLabelText(/Satellite source/)).toBeNull();
    expect(screen.queryByLabelText(/New shapes go into/)).toBeNull();
  });

  it("hides a layer when its toggle is cleared", async () => {
    const store = await open();
    await userEvent.click(screen.getByRole("checkbox", { name: /Elements/ }));
    expect(store.getState().document.layers.find((l) => l.name === "Elements")?.visible).toBe(
      false,
    );
  });
});
