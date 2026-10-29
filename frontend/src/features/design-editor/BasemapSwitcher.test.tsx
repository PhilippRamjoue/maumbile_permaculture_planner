import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImageryProviders } from "../../entities/imagery";
import { BasemapSwitcher } from "./BasemapSwitcher";

const providers: ImageryProviders = {
  default_key: "esri_world_imagery",
  providers: [
    { key: "esri_world_imagery", label: "Esri World Imagery (sharpest)", attribution: "", max_zoom: 19 },
    { key: "osm_standard", label: "OpenStreetMap (streets & roads)", attribution: "", max_zoom: 19 },
    { key: "sentinel2_cloudless", label: "Sentinel-2 cloudless (10 m, 2016)", attribution: "", max_zoom: 13 },
  ],
};

type Props = Parameters<typeof BasemapSwitcher>[0];

async function open(props: Partial<Props> = {}) {
  render(<BasemapSwitcher providers={providers} selected={null} onSelect={vi.fn()} {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Basemap" }));
}

describe("BasemapSwitcher", () => {
  beforeEach(() => localStorage.clear());

  it("lists every covering basemap and starts on the default, with no warning on Esri", async () => {
    await open();
    const group = screen.getByRole("radiogroup", { name: "Basemap" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /Esri World Imagery/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /OpenStreetMap/ })).toBeInTheDocument();
    expect(screen.queryByText(/blurs when you zoom in/)).toBeNull();
  });

  it("reports a pick and warns while a low-res layer is active", async () => {
    const onSelect = vi.fn();
    await open({ selected: "sentinel2_cloudless", onSelect });
    expect(screen.getByRole("radio", { name: /Sentinel-2/ })).toBeChecked();
    expect(screen.getByText(/blurs when you zoom in/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Esri World Imagery/ }));
    expect(onSelect).toHaveBeenCalledWith("esri_world_imagery");
  });

  it("hides itself when only one source (or none) covers the site", () => {
    render(
      <BasemapSwitcher
        providers={{ ...providers, providers: providers.providers.slice(0, 1) }}
        selected={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Basemap" })).toBeNull();
  });
});
