import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { site, user } from "../../shared/testing/fixtures";
import { mockApi, problem, requestedRoutes } from "../../shared/testing/mockApi";
import { renderApp } from "../../shared/testing/renderApp";

describe("SitesDashboardPage", () => {
  it("loads older sites beyond the first page", async () => {
    mockApi({
      "GET /auth/me": { json: user },
      "GET /sites": ({ query }) => ({
        json: {
          items:
            query.get("offset") === "0" ? [site] : [{ ...site, id: "older", name: "Older garden" }],
          total: 2,
          offset: Number(query.get("offset")),
          limit: 1,
        },
      }),
    });
    renderApp("/");
    await userEvent.click(await screen.findByRole("button", { name: "Load more sites" }));
    expect(await screen.findByRole("heading", { name: "Older garden" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Load more sites" })).not.toBeInTheDocument();
  });

  it("renames a site through its settings", async () => {
    let name = site.name;
    mockApi({
      "GET /auth/me": { json: user },
      "GET /sites": () => ({
        json: { items: [{ ...site, name }], total: 1, offset: 0, limit: 100 },
      }),
      [`PATCH /sites/${site.id}`]: ({ body }) => {
        name = (body as { name: string }).name;
        return { json: { ...site, name } };
      },
    });
    renderApp("/");
    await userEvent.click(await screen.findByText("Site settings"));
    const input = await screen.findByLabelText("Site name");
    await userEvent.clear(input);
    await userEvent.type(input, "New garden name");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByRole("heading", { name: "New garden name" })).toBeVisible();
  });
  it("lists the user's sites with area and a link to open each", async () => {
    mockApi({
      "GET /auth/me": { json: user },
      "GET /sites": {
        json: {
          items: [
            site,
            { ...site, id: "2", name: "Arusha plot", area_m2: 800, country_code: "TZ" },
          ],
          total: 2,
          limit: 100,
          offset: 0,
        },
      },
    });
    renderApp("/");

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("heading", { name: "Kiambu shamba" })).toBeInTheDocument();
    expect(items[0]).toHaveTextContent("1.23 ha · KE");
    expect(items[1]).toHaveTextContent("800 m² · TZ");
    expect(screen.getByRole("link", { name: "Open Kiambu shamba" })).toHaveAttribute(
      "href",
      `/sites/${site.id}`,
    );
  });

  it("shows an empty state", async () => {
    mockApi({
      "GET /auth/me": { json: user },
      "GET /sites": { json: { items: [], total: 0, limit: 100, offset: 0 } },
    });
    renderApp("/");

    expect(await screen.findByText("You have no sites yet.")).toBeInTheDocument();
  });

  it("exports a site as a downloadable bundle", async () => {
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchMock = mockApi({
      "GET /auth/me": { json: user },
      "GET /sites": { json: { items: [site], total: 1, limit: 100, offset: 0 } },
      [`GET /sites/${site.id}/export/bundle`]: {
        json: { bundle_version: 1, site: { name: site.name }, plans: [] },
      },
    });
    renderApp("/");
    await userEvent.click(await screen.findByRole("button", { name: `Export ${site.name}` }));
    await waitFor(() =>
      expect(requestedRoutes(fetchMock)).toContain(`GET /sites/${site.id}/export/bundle`),
    );
    expect(URL.createObjectURL).toHaveBeenCalled(); // a download was handed to the browser
    click.mockRestore();
  });

  it("rejects an import file that is not valid JSON, without calling the API", async () => {
    const fetchMock = mockApi({
      "GET /auth/me": { json: user },
      "GET /sites": { json: { items: [site], total: 1, limit: 100, offset: 0 } },
    });
    renderApp("/");
    const input = await screen.findByLabelText("Site bundle file");
    await userEvent.upload(input, new File(["not json"], "bad.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not valid json/i);
    expect(requestedRoutes(fetchMock)).not.toContain("POST /sites/import");
  });

  it("reports a load failure and allows a retry", async () => {
    mockApi({
      "GET /auth/me": { json: user },
      "GET /sites": problem(500, "Internal Server Error"),
    });
    renderApp("/");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load your sites/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
