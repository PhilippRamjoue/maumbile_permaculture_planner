import { expect, test } from "./map-fixture";

// WP7 acceptance: login → open site → imagery + attribution visible.
// Needs the real stack (and WP4's imagery endpoints); opt in with E2E=1.
test.skip(!process.env.E2E, "set E2E=1 with the stack running to enable");

const password = "e2e-password-123";

test("login → open site → imagery source and attribution are visible", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.org`;

  // The site-setup UI arrives in WP8, so seed the account and a site through the API. The page's
  // request context shares cookies with the browser context, so this also signs the user in.
  const api = page.request;
  expect((await api.post("/api/v1/auth/register", { data: { email, password } })).ok()).toBe(true);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "My sites" })).toBeVisible();

  const created = await api.post("/api/v1/sites", {
    data: {
      name: "E2E shamba",
      country_code: "KE",
      coordinates: [
        [36.8, -1.2],
        [36.801, -1.2],
        [36.801, -1.201],
        [36.8, -1.201],
      ],
    },
  });
  expect(created.ok()).toBe(true);

  await page.reload();
  const tileRequest = page.waitForResponse((r) => /\/imagery\/\d+\/\d+\/\d+\.png/.test(r.url()));
  await page.getByRole("link", { name: "Open E2E shamba" }).click();

  const attribution = page.getByRole("contentinfo", { name: "Map attribution" });
  await expect(attribution).toBeVisible();
  await expect(attribution).toContainText(/\S{4,}/);

  await expect((await tileRequest).ok()).toBe(true);

  await attribution.getByRole("link", { name: /data sources & credits/i }).click();
  await expect(page.getByRole("heading", { name: "Data sources & credits" })).toBeVisible();
  await expect(page.getByRole("link", { name: /view terms/i }).first()).toBeVisible();
});
