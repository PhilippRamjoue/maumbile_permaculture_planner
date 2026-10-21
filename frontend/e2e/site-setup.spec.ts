import { expect, test } from "@playwright/test";

// WP8 acceptance: pick a country, enter 4 corners, see the boundary, create, and arrive on the site
// map with imagery resolved for that country and its attribution visible.
// Needs the real stack (backend + db + WP4's imagery endpoints); opt in with E2E=1.
test.skip(!process.env.E2E, "set E2E=1 with the stack running to enable");

const password = "e2e-password-123";

test("choose country → enter 4 corners → boundary preview → create → site map with attribution", async ({
  page,
}) => {
  const email = `e2e-setup-${Date.now()}@example.org`;
  expect(
    (await page.request.post("/api/v1/auth/register", { data: { email, password } })).ok(),
  ).toBe(true);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page
    .getByRole("link", { name: /new site|create your first site/i })
    .first()
    .click();

  // Step 1 — country
  await page.getByLabel("Country").selectOption("KE");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 — four corners, pasted, with a live preview
  await page
    .getByLabel("Paste coordinates")
    .fill(
      ["-1.2000, 36.8000", "-1.2000, 36.8010", "-1.2010, 36.8010", "-1.2010, 36.8000"].join("\n"),
    );
  await page.getByRole("button", { name: "Add pasted points" }).click();
  await expect(page.getByTestId("boundary-status")).toContainText(/boundary looks good/i);
  await expect(page.getByLabel("Point 4 latitude")).toHaveValue("-1.201");

  await page.getByLabel("Site name").fill("E2E setup shamba");
  await page.getByRole("button", { name: "Create site" }).click();

  // Arrive on the new site's map: imagery tiles load and the provider credit is visible.
  await expect(page).toHaveURL(/\/sites\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "E2E setup shamba" })).toBeVisible();
  const tile = await page.waitForResponse((r) => /\/imagery\/\d+\/\d+\/\d+\.png/.test(r.url()));
  expect(tile.ok()).toBe(true);
  await expect(page.getByRole("contentinfo", { name: "Map attribution" })).toContainText(/\S{4,}/);
});
