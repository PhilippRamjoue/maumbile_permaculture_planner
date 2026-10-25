import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockApi, problem } from "../../shared/testing/mockApi";
import { renderApp } from "../../shared/testing/renderApp";

function signedOut() {
  mockApi({
    "GET /auth/me": problem(401, "Not authenticated"),
    "POST /auth/refresh": problem(401, "no"),
  });
}

describe("legal pages", () => {
  it("shows the terms without signing in, including the commercial-use responsibility", async () => {
    signedOut();
    renderApp("/terms");

    expect(await screen.findByRole("heading", { name: "Terms of use", level: 1 })).toBeVisible();
    expect(screen.getByText(/provided “as is”, without warranty/)).toBeVisible();
    expect(screen.getByText(/you are responsible for obtaining the licenses/)).toBeVisible();
  });

  it("shows the privacy notice without signing in", async () => {
    signedOut();
    renderApp("/privacy");

    expect(await screen.findByRole("heading", { name: "Privacy notice", level: 1 })).toBeVisible();
    expect(screen.getByText(/we do not track you/)).toBeVisible();
    expect(screen.getByText(/download any plan as GeoJSON/)).toBeVisible();
  });

  it("links to both from a footer on every page", async () => {
    signedOut();
    renderApp("/credits");

    const footer = await screen.findByRole("contentinfo", { name: "Legal" });
    const terms = within(footer).getByRole("link", { name: "Terms" });
    expect(terms).toHaveAttribute("href", "/terms");
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );

    await userEvent.click(terms);
    expect(await screen.findByRole("heading", { name: "Terms of use", level: 1 })).toBeVisible();
  });
});
