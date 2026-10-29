import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MapToolsControl } from "./MapToolsControl";
import type { Tool } from "./useEditorMap";

const show = (tool: Tool = "select", disabled = false, compass = false) => {
  const choose = vi.fn();
  const onGridChange = vi.fn();
  const onCompassChange = vi.fn();
  const view = render(
    <MapToolsControl
      tool={tool}
      choose={choose}
      disabled={disabled}
      grid={false}
      gridStep={5}
      onGridChange={onGridChange}
      compass={compass}
      onCompassChange={onCompassChange}
    />,
  );
  return { choose, onGridChange, onCompassChange, ...view };
};

describe("MapToolsControl", () => {
  it("is one small button until asked, then offers distance and area", async () => {
    show();
    expect(screen.queryByRole("button", { name: "Measure distance" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Measure" }));

    expect(screen.getByRole("button", { name: "Measure distance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Measure area" })).toBeInTheDocument();
  });

  it("starts a measuring tool, and a second click on the same tool puts it down", async () => {
    const { choose, rerender } = show();
    await userEvent.click(screen.getByRole("button", { name: "Measure" }));
    await userEvent.click(screen.getByRole("button", { name: "Measure area" }));
    expect(choose).toHaveBeenLastCalledWith("measure-area");

    rerender(
      <MapToolsControl
        tool="measure-area"
        choose={choose}
        disabled={false}
        grid={false}
        gridStep={5}
        onGridChange={vi.fn()}
        compass={false}
        onCompassChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Measure area" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Measure area" }));
    expect(choose).toHaveBeenLastCalledWith("select");
  });

  it("offers the distance grid, off until asked for", async () => {
    const { onGridChange } = show();
    await userEvent.click(screen.getByRole("button", { name: "Measure" }));
    const grid = screen.getByRole("button", { name: "Grid" });
    expect(grid).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(grid);
    expect(onGridChange).toHaveBeenCalledWith(true);
  });

  it("names the grid spacing while it is on, and switches it off again", async () => {
    const onGridChange = vi.fn();
    render(
      <MapToolsControl
        tool="select"
        choose={vi.fn()}
        disabled={false}
        grid
        gridStep={5}
        onGridChange={onGridChange}
        compass={false}
        onCompassChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Measure" }));
    const grid = screen.getByRole("button", { name: "Grid · 5 m" });
    expect(grid).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(grid);
    expect(onGridChange).toHaveBeenCalledWith(false);
  });

  it("offers the compass, off until asked for, and switches it off again", async () => {
    const { onCompassChange, rerender } = show();
    expect(screen.queryByRole("button", { name: "Compass" })).not.toBeInTheDocument(); // folded
    await userEvent.click(screen.getByRole("button", { name: "Measure" }));
    const compass = screen.getByRole("button", { name: "Compass" });
    expect(compass).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(compass);
    expect(onCompassChange).toHaveBeenLastCalledWith(true);

    rerender(
      <MapToolsControl
        tool="select"
        choose={vi.fn()}
        disabled={false}
        grid={false}
        gridStep={5}
        onGridChange={vi.fn()}
        compass
        onCompassChange={onCompassChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Compass" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Compass" }));
    expect(onCompassChange).toHaveBeenLastCalledWith(false);
  });

  it("shows that a measuring tool is active even when folded", () => {
    show("measure-line");
    expect(screen.getByRole("button", { name: "Measure" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is off while the map is not ready or a save runs", () => {
    show("select", true);
    expect(screen.getByRole("button", { name: "Measure" })).toBeDisabled();
  });
});
