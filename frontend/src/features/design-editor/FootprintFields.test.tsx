import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DesignFeature } from "../../entities/planning";
import { FeatureProperties } from "./FeatureProperties";
import { FootprintFields } from "./FootprintFields";
import {
  centerOf,
  footprintOf,
  footprintPolygon,
  withoutFootprint,
  type Footprint,
} from "./footprint";
import { measureGeometry } from "./measure";

const CENTER: [number, number] = [35.74, -3.37];

const feature = (footprint: Footprint | null): DesignFeature => ({
  type: "Feature",
  id: "f1",
  layer_id: "l1",
  feature_type: "element",
  element_type_id: 1,
  geometry: footprint
    ? footprintPolygon(CENTER, footprint)
    : {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [0, 0],
          ],
        ],
      },
  properties: footprint ? { name: "Thing", footprint } : { name: "Thing" },
});

function setup(selected: DesignFeature) {
  const onChange = vi.fn<(feature: DesignFeature) => void>();
  render(<FootprintFields selected={selected} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

const lastChange = (onChange: { mock: { calls: DesignFeature[][] } }) =>
  onChange.mock.calls.at(-1)![0]!;

describe("FootprintFields", () => {
  it("shows only a diameter for a round footprint", () => {
    setup(feature({ shape: "round", diameter_m: 2 }));
    expect(screen.getByLabelText("Diameter (m)")).toHaveValue("2");
    expect(screen.queryByLabelText("Width (m)")).toBeNull();
    expect(screen.queryByLabelText("Rotation (°)")).toBeNull();
  });

  it("shows width, length and rotation for a rectangle", () => {
    setup(feature({ shape: "rect", width_m: 1.2, length_m: 4, rotation_deg: 30 }));
    expect(screen.getByLabelText("Width (m)")).toHaveValue("1.2");
    expect(screen.getByLabelText("Length (m)")).toHaveValue("4");
    expect(screen.getByLabelText("Rotation (°)")).toHaveValue("30");
    expect(screen.queryByLabelText("Diameter (m)")).toBeNull();
  });

  it("shows nothing for a shape without a footprint", () => {
    const { container } = render(
      <FootprintFields selected={feature(null)} onChange={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reads out shape, exact size and area, so a 5 m tank is not a surprise", () => {
    setup(feature({ shape: "round", diameter_m: 5 }));
    expect(screen.getByText("Ø 5 m · circle · 19.5 m²")).toBeInTheDocument();
  });

  it("switches a circle to a rectangle of the same size around the same centre", async () => {
    const { onChange, user } = setup(feature({ shape: "round", diameter_m: 5 }));
    expect(screen.getByRole("button", { name: "Round" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Rectangle" }));

    const saved = lastChange(onChange);
    expect(footprintOf(saved)).toEqual({
      shape: "rect",
      width_m: 5,
      length_m: 5,
      rotation_deg: 0,
    });
    const polygon = saved.geometry as GeoJSON.Polygon;
    expect(measureGeometry(polygon).area_m2).toBeCloseTo(25, 0);
    expect(centerOf(polygon)[1]).toBeCloseTo(CENTER[1], 6);
  });

  it("switches a rectangle to a circle of its longer side, and ignores the shape already chosen", async () => {
    const { onChange, user } = setup(
      feature({ shape: "rect", width_m: 3, length_m: 8, rotation_deg: 0 }),
    );
    await user.click(screen.getByRole("button", { name: "Rectangle" }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Round" }));
    expect(footprintOf(lastChange(onChange))).toEqual({ shape: "round", diameter_m: 8 });
  });

  it("redraws a circle at the typed diameter around the same centre", async () => {
    const { onChange, user } = setup(feature({ shape: "round", diameter_m: 2 }));
    const field = screen.getByLabelText("Diameter (m)");
    await user.clear(field);
    await user.type(field, "6,5"); // a comma works as the decimal mark

    const saved = lastChange(onChange);
    expect(footprintOf(saved)).toEqual({ shape: "round", diameter_m: 6.5 });
    const polygon = saved.geometry as GeoJSON.Polygon;
    expect(measureGeometry(polygon).area_m2).toBeCloseTo(Math.PI * 3.25 ** 2, 0);
    expect(centerOf(polygon)[0]).toBeCloseTo(CENTER[0], 6);
    expect(centerOf(polygon)[1]).toBeCloseTo(CENTER[1], 6);
  });

  it("redraws a rectangle for each of width, length and rotation", async () => {
    const { onChange, user } = setup(
      feature({ shape: "rect", width_m: 1.2, length_m: 4, rotation_deg: 0 }),
    );
    for (const [label, value] of [
      ["Width (m)", "10"],
      ["Length (m)", "5"],
      ["Rotation (°)", "375"],
    ] as const) {
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
    }
    // Each edit starts from the saved feature, so the last one only carries its own change.
    expect(footprintOf(lastChange(onChange))).toMatchObject({ rotation_deg: 15 });
    const widthEdit = onChange.mock.calls.find(
      ([f]) => (footprintOf(f) as { width_m: number }).width_m === 10,
    )![0];
    expect(measureGeometry(widthEdit.geometry).area_m2).toBeCloseTo(10 * 4, 0);
  });

  it("refuses sizes that are not positive or are absurdly large, and says why", async () => {
    const { onChange, user } = setup(feature({ shape: "round", diameter_m: 2 }));
    const field = screen.getByLabelText("Diameter (m)");
    await user.clear(field);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a number");

    // Pasted in one go, so no half-typed number is a valid size on the way.
    for (const text of ["0", "-3", "5000"]) {
      await user.clear(field);
      await user.click(field);
      await user.paste(text);
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/between/);
    expect(field).toHaveAttribute("aria-invalid", "true");

    // Leaving the field puts the saved size back.
    await user.tab();
    expect(field).toHaveValue("2");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("FeatureProperties", () => {
  it("offers the exact size on a selected footprint, and rotate still turns it", () => {
    render(
      <FeatureProperties
        selected={feature({ shape: "round", diameter_m: 2 })}
        layers={[]}
        onChange={() => undefined}
        onDelete={() => undefined}
        onRotate={() => undefined}
      />,
    );
    expect(screen.getByLabelText("Diameter (m)")).toBeInTheDocument();
  });

  const propertiesFor = (selected: DesignFeature) => {
    const onChange = vi.fn<(feature: DesignFeature) => void>();
    render(
      <FeatureProperties
        selected={selected}
        layers={[]}
        onChange={onChange}
        onDelete={() => undefined}
        onRotate={() => undefined}
      />,
    );
    return { onChange, user: userEvent.setup() };
  };

  it("lets a footprint element be reshaped freely, which drops its footprint", async () => {
    const { onChange, user } = propertiesFor(
      feature({ shape: "rect", width_m: 8, length_m: 6, rotation_deg: 0 }),
    );
    expect(screen.queryByRole("button", { name: "Back to rectangle" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reshape freely" }));
    const saved = lastChange(onChange);
    expect(footprintOf(saved)).toBeNull();
    expect("footprint" in saved.properties).toBe(false);
    expect(saved.geometry).toEqual(
      feature({ shape: "rect", width_m: 8, length_m: 6, rotation_deg: 0 }).geometry,
    );
  });

  it("hides the exact size of a custom shape, keeps rotate, and can square it up again", async () => {
    const custom = withoutFootprint(
      feature({ shape: "rect", width_m: 8, length_m: 6, rotation_deg: 0 }),
    );
    const { onChange, user } = propertiesFor(custom);
    expect(screen.queryByText("Exact size")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reshape freely" })).toBeNull();
    expect(screen.getByRole("button", { name: "Rotate left 15°" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to rectangle" }));
    const fp = footprintOf(lastChange(onChange));
    expect(fp).toMatchObject({ shape: "rect" });
    expect((fp as { width_m: number }).width_m).toBeCloseTo(8, 1);
  });

  it("offers a width in metres for a path, and saves it", async () => {
    const path: DesignFeature = {
      ...feature(null),
      feature_type: "path",
      geometry: {
        type: "LineString",
        coordinates: [
          [35, -3],
          [35.001, -3],
        ],
      },
      properties: { name: "Path", width_m: 1 },
    };
    const { onChange, user } = propertiesFor(path);
    expect(screen.queryByText("Exact size")).toBeNull();
    const field = screen.getByLabelText("Width (m)");
    expect(field).toHaveValue("1");
    await user.clear(field);
    await user.type(field, "4");
    expect(lastChange(onChange).properties.width_m).toBe(4);
    await user.clear(field);
    await user.paste("900");
    expect(screen.getByRole("alert")).toHaveTextContent(/between/);
    expect(lastChange(onChange).properties.width_m).toBe(4);
  });

  it("shows no width for an element that is not a path", () => {
    propertiesFor(feature({ shape: "round", diameter_m: 2 }));
    expect(screen.queryByLabelText("Width (m)")).toBeNull();
  });
});
