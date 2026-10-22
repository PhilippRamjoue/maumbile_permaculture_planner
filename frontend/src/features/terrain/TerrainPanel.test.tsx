import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeMap } from "../../shared/testing/fakeMaplibre";
import {
  imageryMeta,
  site,
  terrainEmpty,
  terrainReady,
  user as userFixture,
} from "../../shared/testing/fixtures";
import { mockApi, problem, requestedRoutes, type MockHandler } from "../../shared/testing/mockApi";
import { renderApp } from "../../shared/testing/renderApp";
import { TERRAIN_POLL_MS } from "../../entities/terrainQueries";
import { useMapLayerStore } from "../map/store";

vi.mock(
  "maplibre-gl",
  async () => (await import("../../shared/testing/fakeMaplibre")).fakeMaplibreModule,
);

const route = `/sites/${site.id}`;
const terrainPath = `/sites/${site.id}/terrain`;

function handlers(terrain: MockHandler, extra: Record<string, MockHandler> = {}) {
  return {
    "GET /auth/me": { json: userFixture },
    [`GET /sites/${site.id}`]: { json: site },
    [`GET /sites/${site.id}/imagery/meta`]: { json: imageryMeta },
    [`GET ${terrainPath}`]: terrain,
    ...extra,
  };
}

describe("terrain on the site map", () => {
  beforeEach(() => {
    FakeMap.reset();
    useMapLayerStore.getState().reset();
  });
  afterEach(() => vi.useRealTimers());

  it("offers to compute terrain that does not exist yet, then polls until it is ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let status: "not_requested" | "pending" | "ready" = "not_requested";
    const fetchMock = mockApi(
      handlers(() => ({ json: status === "ready" ? terrainReady : { ...terrainEmpty, status } }), {
        [`POST ${terrainPath}`]: () => {
          status = "pending";
          return { status: 202, json: { ...terrainEmpty, status: "pending" } };
        },
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp(route);

    await user.click(await screen.findByRole("button", { name: "Compute terrain" }));

    expect(await screen.findByText(/Computing terrain/)).toBeInTheDocument();
    expect(requestedRoutes(fetchMock)).toContain(`POST ${terrainPath}`);

    status = "ready";
    await vi.advanceTimersByTimeAsync(TERRAIN_POLL_MS + 100);

    expect(await screen.findByRole("list", { name: "Slope legend" })).toBeInTheDocument();
    await waitFor(() => expect(FakeMap.instances[0]?.sources.has("terrain-contours")).toBe(true));
  });

  it("draws contours (on) and slope (off) with a legend, credit and planning-aid notice", async () => {
    mockApi(handlers({ json: terrainReady }));
    const user = userEvent.setup();
    renderApp(route);

    const legend = await screen.findByRole("list", { name: "Slope legend" });
    expect(within(legend).getAllByRole("listitem")).toHaveLength(terrainReady.slope!.legend.length);
    expect(legend).toHaveTextContent("Flat");
    expect(legend).toHaveTextContent("> 5%");
    expect(screen.getByLabelText("Terrain")).toHaveTextContent(terrainReady.attribution!);
    expect(screen.getByLabelText("Terrain")).toHaveTextContent(/planning aid only/i);

    await waitFor(() => expect(FakeMap.instances[0]?.layers.has("terrain-slope-fill")).toBe(true));
    const map = FakeMap.instances[0];
    expect(map.layers.get("terrain-contours-line")?.layout.visibility).toBe("visible");
    expect(map.layers.get("terrain-slope-fill")?.layout.visibility).toBe("none");

    await user.click(screen.getByRole("checkbox", { name: "Slope" }));
    await waitFor(() =>
      expect(map.layers.get("terrain-slope-fill")?.layout.visibility).toBe("visible"),
    );
    await user.click(screen.getByRole("checkbox", { name: "Contour lines" }));
    await waitFor(() =>
      expect(map.layers.get("terrain-contours-line")?.layout.visibility).toBe("none"),
    );
  });

  it("keeps terrain toggles out of the generic layer panel", async () => {
    mockApi(handlers({ json: terrainReady }));
    renderApp(route);

    await screen.findByRole("list", { name: "Slope legend" });

    expect(screen.getAllByRole("checkbox", { name: "Slope" })).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Site boundary" })).toBeInTheDocument();
  });

  it("explains a failed run and lets the user retry", async () => {
    let calls = 0;
    mockApi(
      handlers(
        { json: { ...terrainEmpty, status: "failed", error: "No elevation data" } },
        {
          [`POST ${terrainPath}`]: () => {
            calls++;
            return { status: 202, json: { ...terrainEmpty, status: "pending" } };
          },
        },
      ),
    );
    const user = userEvent.setup();
    renderApp(route);

    expect(await screen.findByRole("alert")).toHaveTextContent("No elevation data");
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(calls).toBe(1));
  });

  it("surfaces why terrain cannot be requested", async () => {
    mockApi(
      handlers(
        { json: terrainEmpty },
        {
          [`POST ${terrainPath}`]: problem(404, "Not Found", {
            detail: "No elevation data available for this site",
          }),
        },
      ),
    );
    const user = userEvent.setup();
    renderApp(route);

    await user.click(await screen.findByRole("button", { name: "Compute terrain" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/No elevation data available/);
  });

  it("re-derives with a different contour interval", async () => {
    let body: unknown;
    mockApi(
      handlers(
        { json: terrainReady },
        {
          [`POST ${terrainPath}`]: (request) => {
            body = request.body;
            return { status: 202, json: { ...terrainEmpty, status: "pending" } };
          },
        },
      ),
    );
    const user = userEvent.setup();
    renderApp(route);

    await user.selectOptions(await screen.findByLabelText("Contour interval"), "10");
    await user.click(screen.getByRole("button", { name: "Update contours" }));

    await waitFor(() => expect(body).toEqual({ contour_interval_m: 10 }));
  });

  it("explains data flags such as a flat site", async () => {
    mockApi(
      handlers({
        json: { ...terrainReady, slope: { ...terrainReady.slope!, flags: ["flat"] } },
      }),
    );
    renderApp(route);

    expect(await screen.findByText(/almost flat/i)).toBeInTheDocument();
  });
});
