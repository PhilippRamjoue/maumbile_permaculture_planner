import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DesignFeature } from "../../../entities/planning";
import { measureGeometry } from "../measure";
import { MeasurementPanel } from "./MeasurementPanel";

const M_LAT = 111_132;
const M_LNG = 111_320 * Math.cos((1.2 * Math.PI) / 180);
const at = (x: number, y: number) => [36.8 + x / M_LNG, -1.2 + y / M_LAT];

const feature = (geometry: DesignFeature["geometry"]): DesignFeature => ({
  type: "Feature",
  id: "f1",
  layer_id: "l1",
  feature_type: "element",
  element_type_id: null,
  geometry,
  properties: {},
});

const bed = feature({
  type: "Polygon",
  coordinates: [[at(0, 0), at(4.2, 0), at(4.2, 1.2), at(0, 1.2), at(0, 0)]],
});
const path = feature({ type: "LineString", coordinates: [at(0, 0), at(23.4, 0)] });

const show = (selected: DesignFeature | undefined, onConfirm = vi.fn()) =>
  render(
    <MeasurementPanel
      measurement={selected ? measureGeometry(selected.geometry) : null}
      selected={selected}
      confirmed={false}
      confirming={false}
      confirmError={null}
      disabled={false}
      onConfirm={onConfirm}
    />,
  );

describe("MeasurementPanel", () => {
  it("says how big a selected bed is, without a tool", () => {
    show(bed);
    expect(screen.getByRole("heading", { name: "Size" })).toBeInTheDocument();
    expect(screen.getByText("4.2 × 1.2 m")).toBeInTheDocument();
    expect(screen.getByText("5 m²")).toBeInTheDocument();
    expect(screen.getByText(/all the way round/)).toBeInTheDocument();
  });

  it("gives the length of a selected path", () => {
    show(path);
    expect(screen.getByText("23.4 m long")).toBeInTheDocument();
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });

  it("offers the server check for a selected shape only", async () => {
    const onConfirm = vi.fn();
    const { rerender } = show(bed, onConfirm);
    await userEvent.click(screen.getByRole("button", { name: "Confirm measurement" }));
    expect(onConfirm).toHaveBeenCalled();

    rerender(
      <MeasurementPanel
        measurement={null}
        selected={undefined}
        confirmed={false}
        confirming={false}
        confirmError={null}
        disabled={false}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.queryByRole("button", { name: "Confirm measurement" })).not.toBeInTheDocument();
    expect(screen.getByText(/start measuring/i)).toBeInTheDocument();
  });

  it("reads a live distance as a length, not a perimeter", () => {
    render(
      <MeasurementPanel
        measurement={{ length_m: 36.3, area_m2: 0 }}
        selected={undefined}
        confirmed={false}
        confirming={false}
        confirmError={null}
        disabled={false}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("36.3 m long")).toBeInTheDocument();
    expect(screen.queryByText(/around/)).not.toBeInTheDocument();
  });
});
