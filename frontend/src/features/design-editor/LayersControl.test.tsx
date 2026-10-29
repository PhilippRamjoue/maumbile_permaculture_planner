import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImageryProviders } from "../../entities/imagery";
import { LayersControl } from "./LayersControl";
import { createEditorStore } from "./store";

const providers: ImageryProviders = {
  default_key: "esri_world_imagery",
  providers: [
    {
      key: "esri_world_imagery",
      label: "Esri World Imagery (sharpest)",
      attribution: "",
      max_zoom: 19,
    },
    {
      key: "sentinel2_cloudless",
      label: "Sentinel-2 cloudless (10 m, 2016)",
      attribution: "",
      max_zoom: 13,
    },
  ],
};

const layers = [{ id: "l1", name: "Elements", visible: true, sort_order: 1 }];

async function open(imagery?: Parameters<typeof LayersControl>[0]["imagery"]) {
  const state = createEditorStore({ features: [], layers: layers as never }).getState();
  render(
    <LayersControl
      state={state}
      disabled={false}
      activeLayer="l1"
      setActiveLayer={() => undefined}
      imagery={imagery}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Layers" }));
}

describe("LayersControl satellite source", () => {
  beforeEach(() => localStorage.clear());

  it("offers the sources covering the site, starting on the default", async () => {
    await open({ providers, selected: null, onSelect: vi.fn() });
    const select = screen.getByLabelText(/Satellite source/);
    expect(select).toHaveValue("esri_world_imagery");
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      "Esri World Imagery (sharpest)",
      "Sentinel-2 cloudless (10 m, 2016)",
    ]);
    expect(screen.getByText(/measurements stay exactly where they are/)).toBeInTheDocument();
  });

  it("reports the picked source, and shows the one in use", async () => {
    const onSelect = vi.fn();
    await open({ providers, selected: "sentinel2_cloudless", onSelect });
    const select = screen.getByLabelText(/Satellite source/);
    expect(select).toHaveValue("sentinel2_cloudless");
    await userEvent.selectOptions(select, "esri_world_imagery");
    expect(onSelect).toHaveBeenCalledWith("esri_world_imagery");
  });

  it("has no choice to offer when only one source covers the site, or before they are known", async () => {
    await open({
      providers: { ...providers, providers: providers.providers.slice(0, 1) },
      selected: null,
      onSelect: vi.fn(),
    });
    expect(screen.queryByLabelText(/Satellite source/)).toBeNull();
  });

  it("is quiet without any imagery wiring", async () => {
    await open(undefined);
    expect(screen.queryByLabelText(/Satellite source/)).toBeNull();
    expect(screen.getByLabelText("New shapes go into")).toBeInTheDocument();
  });
});
