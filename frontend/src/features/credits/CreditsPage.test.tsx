import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { esri, imageryMeta, sentinel, site, user } from "../../shared/testing/fixtures";
import { mockApi, problem } from "../../shared/testing/mockApi";
import { renderApp } from "../../shared/testing/renderApp";

describe("CreditsPage", () => {
  it("lists every source with its license and a terms link — without signing in", async () => {
    mockApi({
      "GET /auth/me": problem(401, "Not authenticated"),
      "POST /auth/refresh": problem(401, "no"),
      "GET /regions/attribution": { json: { sources: [esri, sentinel] } },
    });
    renderApp("/credits");

    const cards = await screen.findAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent(esri.attribution);
    expect(cards[0]).toHaveTextContent(esri.license);
    expect(cards[1]).toHaveTextContent("CC-BY-4.0");

    const link = within(cards[1]).getByRole("link");
    expect(link).toHaveAttribute("href", "https://s2maps.eu");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("completes a site's imagery credit from the regions endpoint when the meta lacks license/terms", async () => {
    const fetchMock = mockApi({
      "GET /auth/me": { json: user },
      [`GET /sites/${site.id}/imagery/meta`]: {
        json: { ...imageryMeta, license: null, terms_url: null },
      },
      "GET /regions/attribution": ({ query }) => ({
        json: { sources: query.get("keys") === esri.key ? [esri] : [] },
      }),
    });
    renderApp(`/sites/${site.id}/credits`);

    const card = await screen.findByRole("listitem");
    expect(card).toHaveTextContent(esri.license);
    expect(within(card).getByRole("link")).toHaveAttribute("href", esri.terms_url);
    const lookup = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/regions/attribution"),
    );
    expect(String(lookup![0])).toContain("keys=esri_world_imagery");
  });

  it("uses license and terms straight from the meta when it carries them", async () => {
    const fetchMock = mockApi({
      "GET /auth/me": { json: user },
      [`GET /sites/${site.id}/imagery/meta`]: {
        json: { ...imageryMeta, license: "CC-BY-4.0", terms_url: "https://example.org/terms" },
      },
    });
    renderApp(`/sites/${site.id}/credits`);

    const card = await screen.findByRole("listitem");
    expect(card).toHaveTextContent("CC-BY-4.0");
    expect(within(card).getByRole("link")).toHaveAttribute("href", "https://example.org/terms");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/regions/"))).toBe(false);
  });

  it("falls back to the meta's credit line if the regions lookup fails", async () => {
    mockApi({
      "GET /auth/me": { json: user },
      [`GET /sites/${site.id}/imagery/meta`]: {
        json: { ...imageryMeta, license: null, terms_url: null },
      },
      "GET /regions/attribution": problem(500, "boom"),
    });
    renderApp(`/sites/${site.id}/credits`);

    const card = await screen.findByRole("listitem");
    expect(card).toHaveTextContent(imageryMeta.attribution);
    expect(card).toHaveTextContent("Not specified");
  });

  it("reports an error when sources cannot be loaded", async () => {
    mockApi({
      "GET /auth/me": { json: user },
      "GET /regions/attribution": problem(500, "boom"),
    });
    renderApp("/credits");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("finishes loading when the backend reports no imagery coverage", async () => {
    mockApi({
      "GET /auth/me": { json: user },
      [`GET /sites/${site.id}/imagery/meta`]: {
        json: {
          ...imageryMeta,
          covered: false,
          provider_key: null,
          attribution: null,
          license: null,
          terms_url: null,
          max_zoom: null,
          cacheable: null,
          tile_url_template: null,
        },
      },
    });
    renderApp(`/sites/${site.id}/credits`);
    expect(await screen.findByText("No data sources are configured.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
