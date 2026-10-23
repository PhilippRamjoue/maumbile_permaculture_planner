import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { siteKeys } from "../../entities/siteQueries";
import { FakeMap } from "../../shared/testing/fakeMaplibre";
import { imageryMeta, site, user } from "../../shared/testing/fixtures";
import { mockApi, problem, type MockHandler } from "../../shared/testing/mockApi";
import { renderApp } from "../../shared/testing/renderApp";
import { IMAGERY_MAX_ZOOM, MAX_FIT_ZOOM } from "../map/layers/zoomLimits";

vi.mock(
  "maplibre-gl",
  async () => (await import("../../shared/testing/fakeMaplibre")).fakeMaplibreModule,
);

const emptyList = { json: { items: [], total: 0, limit: 100, offset: 0 } };

function handlers(extra: Record<string, MockHandler> = {}) {
  return {
    "GET /auth/me": { json: { ...user, country_code: null } },
    "GET /sites": emptyList,
    [`GET /sites/${site.id}`]: { json: site },
    [`GET /sites/${site.id}/imagery/meta`]: { json: imageryMeta },
    ...extra,
  };
}

/** Walks step 1: picks Kenya and continues. Returns once step 2 is on screen. */
async function chooseKenya() {
  await userEvent.selectOptions(await screen.findByLabelText("Country"), "KE");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: /step 2 of 2/i });
}

/** The setup map, once it has loaded and the click handler is attached. */
async function setupMap(): Promise<FakeMap> {
  await waitFor(() => {
    expect(FakeMap.instances.at(-1)?.canvas.style.cursor).toBe("crosshair");
  });
  return FakeMap.instances.at(-1)!;
}

/**
 * Click a coordinate the way a user would: zoomed in on their land. At country zoom a whole
 * compound is a few pixels wide, so neighbouring clicks would (rightly) select the corner they hit.
 */
function clickMap(map: FakeMap, lng: number, lat: number) {
  act(() => {
    if (map.getZoom() < 15) map.jumpTo({ center: [lng, lat], zoom: 17 });
    map.trigger("click", { lngLat: { lng, lat } });
  });
}

const corners = [
  [36.8, -1.2],
  [36.801, -1.2],
  [36.801, -1.201],
  [36.8, -1.201],
] as const;

describe("site setup flow", () => {
  beforeEach(() => FakeMap.reset());

  it("is reachable from the dashboard's New site button", async () => {
    mockApi(handlers());
    renderApp("/");

    await userEvent.click(await screen.findByRole("link", { name: "New site" }));

    expect(await screen.findByRole("heading", { name: "New site" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /step 1 of 2/i })).toBeInTheDocument();
  });

  it("requires a country before continuing, with East Africa listed first", async () => {
    mockApi(handlers());
    renderApp("/sites/new");

    const select = await screen.findByLabelText("Country");
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    const featured = within(screen.getByRole("group", { name: "East Africa" }));
    expect(featured.getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(
      expect.arrayContaining(["KE", "TZ", "UG"]),
    );
    expect(within(select).getAllByRole("option").length).toBeGreaterThan(200);

    await userEvent.selectOptions(select, "TZ");
    expect(continueButton).toBeEnabled();
  });

  it("starts from the user's own country", async () => {
    mockApi(handlers({ "GET /auth/me": { json: { ...user, country_code: "ke" } } }));
    renderApp("/sites/new");

    expect(await screen.findByLabelText("Country")).toHaveValue("KE");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("suggests the country from a pasted coordinate, to be confirmed", async () => {
    mockApi(handlers());
    renderApp("/sites/new");

    await userEvent.type(await screen.findByLabelText(/paste one coordinate/i), "-1.2921, 36.8219");
    expect(await screen.findByText(/looks like kenya/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Country")).toHaveValue("");

    await userEvent.click(screen.getByRole("button", { name: "Use Kenya" }));
    expect(screen.getByLabelText("Country")).toHaveValue("KE");
  });

  it("opens the map near a coordinate given in step 1, not at country zoom", async () => {
    mockApi(handlers());
    renderApp("/sites/new");
    await userEvent.type(await screen.findByLabelText(/paste one coordinate/i), "-3.3, 36.7");
    await userEvent.selectOptions(screen.getByLabelText("Country"), "TZ");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: /step 2 of 2/i });

    const map = await setupMap();
    expect(map.getZoom()).toBeGreaterThanOrEqual(15);
    expect(map.getZoom()).toBeLessThanOrEqual(MAX_FIT_ZOOM);
    expect(map.getCenter().lng).toBeCloseTo(36.7, 3);
    expect(map.getCenter().lat).toBeCloseTo(-3.3, 3);
  });

  it("over-zooms the setup basemap instead of requesting tiles past Esri's coverage", async () => {
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();

    const map = await setupMap();
    await waitFor(() => expect(map.sources.has("setup-basemap")).toBe(true));
    expect(map.sources.get("setup-basemap")).toMatchObject({ maxzoom: IMAGERY_MAX_ZOOM });
  });

  it("frames the map on the chosen country and adds a point per map click", async () => {
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();

    const map = await setupMap();
    expect(map.options.bounds).toEqual([33.9, -4.7, 41.9, 5.5]);
    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/add the corners/i);

    clickMap(map, 36.8, -1.2);
    clickMap(map, 36.801, -1.2);

    expect(screen.getByLabelText("Point 1 latitude")).toHaveValue("-1.2");
    expect(screen.getByLabelText("Point 2 longitude")).toHaveValue("36.801");
    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/1 more needed/i);
    await waitFor(() => expect(map.layers.has("draft-boundary-vertices")).toBe(true));
    expect(map.layers.has("setup-basemap")).toBe(true);
  });

  it("re-frames the map on the boundary when corners are typed into the table", async () => {
    // Regression: typed corners used to leave the map at country zoom, where a compound-sized
    // boundary is a sub-pixel speck — "the drawing of the borders was not visible".
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();
    const map = await setupMap();
    expect(map.fits).toHaveLength(0); // country framing is the `bounds` option, not a fitBounds call

    for (let i = 0; i < corners.length; i++) {
      await userEvent.click(screen.getByRole("button", { name: "Add a row" }));
    }
    for (let i = 0; i < corners.length; i++) {
      const n = i + 1;
      await userEvent.type(screen.getByLabelText(`Point ${n} latitude`), String(corners[i][1]));
      await userEvent.type(screen.getByLabelText(`Point ${n} longitude`), String(corners[i][0]));
    }

    await waitFor(() => expect(map.layers.has("draft-boundary-fill")).toBe(true));
    // The map ends framed tightly on the drawn boundary, so it is actually visible.
    expect(map.fits.at(-1)?.bounds).toEqual([36.8, -1.201, 36.801, -1.2]);
  });

  it("does not re-frame the map when corners are added by clicking", async () => {
    // Clicking adds a corner the user is already looking at, so the view must stay put.
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();
    const map = await setupMap();

    for (const [lng, lat] of corners) clickMap(map, lng, lat);

    await waitFor(() => expect(map.layers.has("draft-boundary-fill")).toBe(true));
    expect(map.fits).toHaveLength(0);
  });

  it("previews the boundary live and always credits the base map", async () => {
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();
    const map = await setupMap();

    for (const [lng, lat] of corners) clickMap(map, lng, lat);

    await waitFor(() => expect(map.layers.has("draft-boundary-fill")).toBe(true));
    const source = map.sources.get("draft-boundary") as {
      data: { features: { properties: { kind: string; state: string } }[] };
    };
    expect(source.data.features.filter((f) => f.properties.kind === "vertex")).toHaveLength(4);
    expect(source.data.features.every((f) => f.properties.state === "ok")).toBe(true);
    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/boundary looks good/i);
    expect(screen.getByRole("contentinfo", { name: "Map attribution" })).toHaveTextContent("Esri");
  });

  it("flags a self-crossing boundary on the map and blocks creating the site", async () => {
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();
    const map = await setupMap();

    // Corners 1-3-2-4: a bow-tie.
    for (const i of [0, 2, 1, 3]) clickMap(map, corners[i][0], corners[i][1]);
    await userEvent.type(screen.getByLabelText("Site name"), "Bow tie");

    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/crosses itself/i);
    expect(screen.getByRole("button", { name: "Create site" })).toBeDisabled();
    await waitFor(() => {
      const source = map.sources.get("draft-boundary") as {
        data: { features: { properties: { state: string } }[] };
      };
      expect(source.data.features.every((f) => f.properties.state === "invalid")).toBe(true);
    });
  });

  it("adds pasted coordinates, re-frames the map and reports unreadable lines", async () => {
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();
    const map = await setupMap();

    const box = screen.getByLabelText("Paste coordinates");
    await userEvent.click(box);
    await userEvent.paste("-1.2, 36.8\nnonsense");
    await userEvent.click(screen.getByRole("button", { name: "Add pasted points" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Line 2: expected two numbers.");
    expect(screen.queryByLabelText("Point 1 latitude")).not.toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.click(box);
    await userEvent.paste("-1.2, 36.8\n-1.2, 36.801\n-1.201, 36.801\n-1.201, 36.8");
    await userEvent.click(screen.getByRole("button", { name: "Add pasted points" }));

    expect(screen.getByLabelText("Point 4 longitude")).toHaveValue("36.8");
    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/boundary looks good/i);
    await waitFor(() => expect(map.fits).toHaveLength(1));
    expect(map.fits[0].bounds).toEqual([36.8, -1.201, 36.801, -1.2]);
  });

  it("lets the table be edited, with inline errors for bad numbers", async () => {
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();
    const map = await setupMap();
    for (const [lng, lat] of corners) clickMap(map, lng, lat);

    const lat = screen.getByLabelText("Point 3 latitude");
    await userEvent.clear(lat);
    await userEvent.type(lat, "abc");
    expect(screen.getByRole("alert")).toHaveTextContent(/point 3: enter both/i);
    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/fix the highlighted rows/i);

    await userEvent.clear(lat);
    await userEvent.type(lat, "-1.2015");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/boundary looks good/i);

    await userEvent.click(screen.getByRole("button", { name: "Remove point 4" }));
    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/boundary looks good/i);
    await userEvent.click(screen.getByRole("button", { name: "Remove point 3" }));
    expect(screen.getByTestId("boundary-status")).toHaveTextContent(/1 more needed/i);
  });

  it("offers to switch country when the first point is clearly elsewhere", async () => {
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();
    const map = await setupMap();

    clickMap(map, 30.06, -1.95); // Kigali

    expect(await screen.findByText(/looks like it is in rwanda, not kenya/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Switch to Rwanda" }));
    expect(screen.getByText("Rwanda")).toBeInTheDocument();
    expect(screen.queryByText(/not kenya/i)).not.toBeInTheDocument();
  });

  it("creates the site, refreshes the list and lands on the site's map", async () => {
    let body: unknown;
    mockApi(
      handlers({
        "POST /sites": (request) => {
          body = request.body;
          return { status: 201, json: site };
        },
      }),
    );
    const { router } = renderApp("/");

    await userEvent.click(await screen.findByRole("link", { name: "Create your first site" }));
    await chooseKenya();
    const map = await setupMap();
    for (const [lng, lat] of corners) clickMap(map, lng, lat);
    await userEvent.type(screen.getByLabelText("Site name"), "  Kiambu shamba ");
    await userEvent.click(screen.getByRole("button", { name: "Create site" }));

    expect(await screen.findByRole("heading", { name: "Kiambu shamba" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/sites/${site.id}`);
    expect(body).toEqual({
      name: "Kiambu shamba",
      country_code: "KE",
      coordinates: [
        [36.8, -1.2],
        [36.801, -1.2],
        [36.801, -1.201],
        [36.8, -1.201],
        [36.8, -1.2],
      ],
    });
  });

  it("marks the cached sites list stale and seeds the new site", async () => {
    mockApi(handlers({ "POST /sites": { status: 201, json: site } }));
    const { queryClient } = renderApp("/");
    await screen.findByText("You have no sites yet.");
    expect(queryClient.getQueryState(siteKeys.list())?.isInvalidated).toBe(false);

    await userEvent.click(screen.getByRole("link", { name: "New site" }));
    await chooseKenya();
    const map = await setupMap();
    for (const [lng, lat] of corners) clickMap(map, lng, lat);
    await userEvent.type(screen.getByLabelText("Site name"), "Kiambu shamba");
    await userEvent.click(screen.getByRole("button", { name: "Create site" }));
    await screen.findByRole("heading", { name: "Kiambu shamba" });

    expect(queryClient.getQueryState(siteKeys.list())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(siteKeys.detail(site.id))).toEqual(site);
  });

  it("needs a name before the site can be created", async () => {
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();
    const map = await setupMap();
    for (const [lng, lat] of corners) clickMap(map, lng, lat);

    expect(screen.getByRole("button", { name: "Create site" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Site name"), "x");
    expect(screen.getByRole("button", { name: "Create site" })).toBeEnabled();
  });

  it("shows the server's complaint and stays put when creation fails", async () => {
    mockApi(
      handlers({
        "POST /sites": problem(422, "Unprocessable Entity", {
          errors: [{ loc: ["body", "coordinates"], msg: "boundary crosses itself" }],
        }),
      }),
    );
    const { router } = renderApp("/sites/new");
    await chooseKenya();
    const map = await setupMap();
    for (const [lng, lat] of corners) clickMap(map, lng, lat);
    await userEvent.type(screen.getByLabelText("Site name"), "Kiambu shamba");
    await userEvent.click(screen.getByRole("button", { name: "Create site" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not create the site: coordinates: boundary crosses itself/i,
    );
    expect(router.state.location.pathname).toBe("/sites/new");
    expect(screen.getByRole("button", { name: "Create site" })).toBeEnabled();
  });

  it("keeps the entered points when going back to change the country", async () => {
    mockApi(handlers());
    renderApp("/sites/new");
    await chooseKenya();
    const map = await setupMap();
    clickMap(map, 36.8, -1.2);

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.selectOptions(await screen.findByLabelText("Country"), "TZ");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText("Point 1 latitude")).toHaveValue("-1.2");
    expect(screen.getAllByText("Tanzania").length).toBeGreaterThan(0);
  });
});
