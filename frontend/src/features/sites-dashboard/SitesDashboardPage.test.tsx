import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { site, user } from "../../shared/testing/fixtures";
import { mockApi, problem } from "../../shared/testing/mockApi";
import { renderApp } from "../../shared/testing/renderApp";

describe("SitesDashboardPage", () => {
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
