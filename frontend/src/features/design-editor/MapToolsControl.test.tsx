import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MapToolsControl } from "./MapToolsControl";
import type { Tool } from "./useEditorMap";

const show = (tool: Tool = "select", disabled = false) => {
  const choose = vi.fn();
  const view = render(<MapToolsControl tool={tool} choose={choose} disabled={disabled} />);
  return { choose, ...view };
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

    rerender(<MapToolsControl tool="measure-area" choose={choose} disabled={false} />);
    expect(screen.getByRole("button", { name: "Measure area" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Measure area" }));
    expect(choose).toHaveBeenLastCalledWith("select");
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
