import type { Page } from "@playwright/test";

import { expect } from "./map-fixture";

/** The rail step button for a focus mode (scoped so it never matches the "Next: …" nudge). */
export const step = (page: Page, name: string) =>
  page.locator(".focus-rail__steps").getByRole("button", { name });

export async function register(page: Page, tag: string) {
  const email = `${tag}-${Date.now()}@example.org`;
  const password = "e2e-editor-password-123";
  expect(
    (await page.request.post("/api/v1/auth/register", { data: { email, password } })).ok(),
  ).toBe(true);
  expect((await page.request.post("/api/v1/auth/login", { data: { email, password } })).ok()).toBe(
    true,
  );
}

export async function makeSite(page: Page, name: string) {
  const response = await page.request.post("/api/v1/sites", {
    data: {
      name,
      country_code: "KE",
      coordinates: [
        [36.8, -1.2],
        [36.801, -1.2],
        [36.801, -1.201],
        [36.8, -1.201],
      ],
    },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

/** A new, empty plan on `siteId`; returns its id. */
export async function makePlan(page: Page, siteId: string, name: string) {
  const response = await page.request.post(`/api/v1/sites/${siteId}/plans`, { data: { name } });
  expect(response.ok()).toBe(true);
  return (await response.json()).id as string;
}
