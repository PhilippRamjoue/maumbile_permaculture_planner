import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { LegendEntry } from "./legend";
import { MapLegend } from "./MapLegend";

const entries: LegendEntry[] = [
  { key: "zone:1", label: "Zone 1", color: "#f59e0b", shape: "polygon", group: "Zones", count: 1 },
  { key: "e:1", label: "Pond", color: "#1e88e5", shape: "polygon", group: "Elements", count: 2 },
];

describe("MapLegend", () => {
  beforeEach(() => localStorage.clear());

  it("is closed until asked, then names what is on the map", async () => {
    const user = userEvent.setup();
    render(<MapLegend entries={entries} />);
    expect(screen.queryByRole("region", { name: "Map legend" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Legend" }));
    const legend = screen.getByRole("region", { name: "Map legend" });
    expect(legend).toHaveTextContent("Zone 1");
    expect(legend).toHaveTextContent("Pond");
    await user.click(screen.getByRole("button", { name: "Legend" }));
    expect(screen.queryByRole("region", { name: "Map legend" })).toBeNull();
  });

  it("remembers that it was left open, and says so when nothing is drawn", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MapLegend entries={[]} />);
    await user.click(screen.getByRole("button", { name: "Legend" }));
    expect(screen.getByText(/Nothing drawn yet/)).toBeInTheDocument();
    unmount();
    render(<MapLegend entries={entries} />);
    expect(screen.getByRole("region", { name: "Map legend" })).toBeInTheDocument();
  });
});
