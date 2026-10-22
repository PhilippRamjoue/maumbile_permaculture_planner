import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DesignFeature } from "../../entities/planning";
import { SectorHelper } from "./SectorHelper";
import { createEditorStore, savePayload } from "./store";

const origin: [number, number] = [36.82, -1.29];

function setup(layerId: string | undefined) {
  const onAdd = vi.fn<(feature: DesignFeature) => void>();
  render(
    <SectorHelper
      origin={origin}
      defaultRadiusM={200}
      layerId={layerId}
      disabled={false}
      onAdd={onAdd}
    />,
  );
  return { onAdd, user: userEvent.setup() };
}

async function enter(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

describe("SectorHelper", () => {
  it("adds a wind sector from two bearings", async () => {
    const { onAdd, user } = setup("sectors-layer");
    await enter(user, "From bearing (°)", "270");
    await enter(user, "To bearing (°)", "350");

    await user.click(screen.getByRole("button", { name: "Add sector" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const feature = onAdd.mock.calls[0][0];
    expect(feature).toMatchObject({
      feature_type: "sector",
      layer_id: "sectors-layer",
      geometry: { type: "Polygon" },
      properties: { sector_kind: "wind", bearing_from: 270, bearing_to: 350, radius_m: 200 },
    });
  });

  it("produces a feature the editor saves as a sector", async () => {
    const { onAdd, user } = setup("sectors-layer");
    await user.click(screen.getByRole("button", { name: "Add sector" }));
    const store = createEditorStore({ layers: [], features: [] });

    store.getState().upsert(onAdd.mock.calls[0][0]);

    const { features } = savePayload(store.getState().document, []);
    expect(features).toHaveLength(1);
    expect(features[0].feature_type).toBe("sector");
    expect(features[0].properties).toMatchObject({ sector_kind: "wind" });
  });

  it("refuses equal bearings", async () => {
    const { onAdd, user } = setup("sectors-layer");
    await enter(user, "From bearing (°)", "90");
    await enter(user, "To bearing (°)", "90");

    await user.click(screen.getByRole("button", { name: "Add sector" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/must differ/);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("is disabled without a visible Sectors layer", () => {
    setup(undefined);
    expect(screen.getByRole("button", { name: "Add sector" })).toBeDisabled();
    expect(screen.getByText(/Show the Sectors layer/)).toBeInTheDocument();
  });

  it("fills a sun sector from the sun path of a date at the site's latitude", async () => {
    const { onAdd, user } = setup("sectors-layer");
    await user.click(screen.getByText("Sun path for a date"));
    await user.click(screen.getByRole("button", { name: "21 June" }));

    expect(screen.getByRole("status")).toHaveTextContent(/rises at 66\.\d° and sets at 293\.\d°/);

    await user.click(screen.getByRole("button", { name: "Use this sun path" }));
    expect(screen.getByLabelText("Sector kind")).toHaveValue("sun");
    await user.click(screen.getByRole("button", { name: "Add sector" }));

    const { properties } = onAdd.mock.calls[0][0];
    // Nairobi is south of the declination in June: the sun's arc runs through north, sunset → sunrise.
    expect(properties.sector_kind).toBe("sun");
    expect(properties.bearing_from).toBeGreaterThan(280);
    expect(properties.bearing_to).toBeLessThan(80);
  });
});
