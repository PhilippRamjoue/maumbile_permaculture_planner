import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { sectorFeature, type SectorKind } from "../sectors";
import { createFocusView } from "./view";
import { SectorOverview } from "./SectorOverview";

const origin: [number, number] = [36.8, -1.2];
const make = (id: string, kind: SectorKind, from: number, to: number) =>
  sectorFeature({ kind, from, to, origin, radiusM: 50 }, id, "layer");
const sectors = [
  make("a", "sun", 101, 259),
  make("b", "wind", 100, 45),
  make("c", "wind", 200, 250),
];

function setup(hidden: SectorKind[] = []) {
  const handlers = { onPick: vi.fn(), onDelete: vi.fn(), onToggleKind: vi.fn() };
  render(
    <SectorOverview
      sectors={sectors}
      selectedId="b"
      hiddenKinds={new Set(hidden)}
      disabled={false}
      {...handlers}
    />,
  );
  return { ...handlers, user: userEvent.setup() };
}

describe("SectorOverview", () => {
  it("lists every sector, including several of one kind, with its bearings", () => {
    setup();
    const list = within(screen.getByRole("list"));
    expect(list.getAllByRole("listitem")).toHaveLength(3);
    expect(list.getByText(/Sun · 101° → 259°/)).toBeInTheDocument();
    expect(list.getByText(/Wind · 100° → 45° \(305° wide\)/)).toBeInTheDocument();
    expect(list.getByText(/Wind · 200° → 250°/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Wind 100°–45°/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("offers one show/hide switch per kind that exists, with counts", async () => {
    const { user, onToggleKind } = setup(["wind"]);
    expect(screen.getByRole("checkbox", { name: /Sun \(1\)/ })).toBeChecked();
    const wind = screen.getByRole("checkbox", { name: /Wind \(2\)/ });
    expect(wind).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Fire/ })).not.toBeInTheDocument();

    await user.click(wind);
    expect(onToggleKind).toHaveBeenCalledWith("wind", true);
  });

  it("selects and deletes a single sector", async () => {
    const { user, onPick, onDelete } = setup();
    await user.click(screen.getByRole("button", { name: /^Wind 200°–250°/ }));
    expect(onPick).toHaveBeenCalledWith("c");

    await user.click(screen.getByRole("button", { name: "Delete Sun 101°–259°" }));
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("invites the first sector when there are none", () => {
    render(
      <SectorOverview
        sectors={[]}
        selectedId={null}
        hiddenKinds={new Set()}
        disabled={false}
        onPick={vi.fn()}
        onDelete={vi.fn()}
        onToggleKind={vi.fn()}
      />,
    );
    expect(screen.getByText(/No sectors yet/)).toBeInTheDocument();
  });
});

describe("focus view with hidden sector kinds", () => {
  it("hides sectors of a switched-off kind in every focus, and only those", () => {
    for (const focus of ["sectors", "elements"] as const) {
      const view = createFocusView(focus, new Set(), [], 1, new Set<SectorKind>(["wind"]));
      expect(view.isShown(sectors[0])).toBe(true);
      expect(view.isShown(sectors[1])).toBe(false);
      expect(view.isShown(sectors[2])).toBe(false);
    }
  });

  it("changes its key when the hidden kinds change, so the map redraws", () => {
    const shown = createFocusView("sectors", new Set(), [], 1, new Set());
    const hidden = createFocusView("sectors", new Set(), [], 1, new Set<SectorKind>(["sun"]));
    expect(shown.key).not.toBe(hidden.key);
  });
});
