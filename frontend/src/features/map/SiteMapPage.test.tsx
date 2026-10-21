import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeMap } from "../../shared/testing/fakeMaplibre";
import { imageryMeta, site, user } from "../../shared/testing/fixtures";
import { mockApi, problem } from "../../shared/testing/mockApi";
import { renderApp } from "../../shared/testing/renderApp";

vi.mock(
  "maplibre-gl",
  async () => (await import("../../shared/testing/fakeMaplibre")).fakeMaplibreModule,
);

const route = `/sites/${site.id}`;

function baseHandlers(meta: object = imageryMeta) {
  return {
    "GET /auth/me": { json: user },
    [`GET /sites/${site.id}`]: { json: site },
    [`GET /sites/${site.id}/imagery/meta`]: { json: meta },
  };
}

describe("SiteMapPage", () => {
  beforeEach(() => FakeMap.reset());

  it("frames the map on the site and adds the imagery proxy as a raster source", async () => {
    mockApi(baseHandlers());
    renderApp(route);

    expect(await screen.findByRole("heading", { name: "Kiambu shamba" })).toBeInTheDocument();
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    const map = FakeMap.instances[0];

    expect(map.options.bounds).toEqual(site.bbox);
    await waitFor(() => expect(map.sources.has("imagery")).toBe(true));
    expect(map.sources.get("imagery")).toMatchObject({
      type: "raster",
      tiles: [`http://localhost:3000/api/v1/sites/${site.id}/imagery/{z}/{x}/{y}.png`],
    });
    expect(map.layers.has("site-boundary-line")).toBe(true);
  });

  it("always shows the provider's attribution and a link to the credits page", async () => {
    mockApi(baseHandlers());
    renderApp(route);

    const attribution = await screen.findByRole("contentinfo", { name: "Map attribution" });
    await waitFor(() => expect(attribution).toHaveTextContent(imageryMeta.attribution));
    expect(
      within(attribution).getByRole("link", { name: /data sources & credits/i }),
    ).toHaveAttribute("href", `/sites/${site.id}/credits`);
  });

  it("keeps the credits link visible even if the imagery meta fails", async () => {
    mockApi({
      ...baseHandlers(),
      [`GET /sites/${site.id}/imagery/meta`]: problem(502, "Imagery provider error"),
    });
    renderApp(route);

    const attribution = await screen.findByRole("contentinfo", { name: "Map attribution" });
    await waitFor(() => expect(attribution).toHaveTextContent("Imagery credits unavailable"));
    expect(attribution).toHaveTextContent("Data sources & credits");
  });

  it("explains when imagery is unavailable and does not add the raster layer", async () => {
    mockApi(baseHandlers({ ...imageryMeta, available: false }));
    renderApp(route);

    expect(await screen.findByText(/imagery is not available/i)).toBeInTheDocument();
    await waitFor(() => expect(FakeMap.instances[0]?.layers.has("site-boundary-line")).toBe(true));
    expect(FakeMap.instances[0].sources.has("imagery")).toBe(false);
  });

  it("hides the boundary from the layer panel toggle", async () => {
    mockApi(baseHandlers());
    renderApp(route);

    const toggle = await screen.findByRole("checkbox", { name: "Site boundary" });
    await waitFor(() => expect(FakeMap.instances[0]?.layers.has("site-boundary-line")).toBe(true));

    await userEvent.click(toggle);

    await waitFor(() =>
      expect(FakeMap.instances[0].layers.get("site-boundary-line")?.layout.visibility).toBe("none"),
    );
  });

  it("shows a friendly message for a site that does not exist", async () => {
    mockApi({
      "GET /auth/me": { json: user },
      [`GET /sites/${site.id}`]: problem(404, "Site not found"),
      [`GET /sites/${site.id}/imagery/meta`]: problem(404, "Site not found"),
    });
    renderApp(route);

    expect(await screen.findByRole("alert")).toHaveTextContent("This site was not found.");
    expect(FakeMap.instances).toHaveLength(0);
  });

  it("removes the map when leaving the page", async () => {
    mockApi({
      ...baseHandlers(),
      "GET /sites": { json: { items: [site], total: 1, limit: 100, offset: 0 } },
    });
    const { router } = renderApp(route);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));

    await router.navigate("/");

    await waitFor(() => expect(FakeMap.instances[0].removed).toBe(true));
  });
});
