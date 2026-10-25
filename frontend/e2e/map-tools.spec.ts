import { makePlan, makeSite, register, step } from "./helpers";
import { expect, test } from "./map-fixture";

test.skip(!process.env.E2E, "set E2E=1 with the stack running to enable");

// Measuring and the distance grid are optional map tools, available in every focus; neither is
// saved with the design.

test("the map's Measure control measures a distance live, and the grid toggles with its spacing", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await register(page, "maptools");
  const site = await makeSite(page, "Tools plot");
  const planId = await makePlan(page, site.id, "Measuring");
  await page.goto(`/sites/${site.id}/design/${planId}?focus=zones`);
  await expect(step(page, "Zones")).toHaveAttribute("aria-current", "step");

  // Folded until asked for.
  await expect(page.getByRole("button", { name: "Measure distance" })).toHaveCount(0);
  await page.getByRole("button", { name: "Measure", exact: true }).click();
  await page.getByRole("button", { name: "Measure distance" }).click();
  await expect(page.getByRole("button", { name: "Measure distance" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const canvas = page.locator(".map-view canvas").first();
  const box = (await canvas.boundingBox())!;
  const at = (fx: number, fy: number) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
  });
  await page.mouse.click(at(0.4, 0.5).x, at(0.4, 0.5).y);
  await page.mouse.move(at(0.6, 0.5).x, at(0.6, 0.5).y, { steps: 5 });
  await expect(page.locator(".editor-map-hint")).toHaveText(/\d[\d.,]* (m|km) — not saved/);

  // The grid is off by default; switching it on names its spacing.
  const grid = page.getByRole("button", { name: /^Grid/ });
  await expect(grid).toHaveAttribute("aria-pressed", "false");
  await grid.click();
  await expect(page.getByRole("button", { name: /^Grid · \d+ m$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: process.env.E2E_SHOT ?? "test-results/map-tools.png" });

  await page.getByRole("button", { name: /^Grid/ }).click();
  await expect(page.getByRole("button", { name: "Grid", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Measuring never becomes a feature: the design is still unchanged.
  await expect(page.getByRole("button", { name: "Save design" })).toBeDisabled();
});
