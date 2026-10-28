import type { Page } from "@playwright/test";
import area from "@turf/area";

import { forceGuided, makePlan, makeSite, register, step } from "./helpers";
import { expect, test } from "./map-fixture";

test.skip(!process.env.E2E, "set E2E=1 with the stack running to enable");

// Elements are placed to scale: one click drops the footprint at its real size, and the exact
// numbers are one field away on the selected element.

interface Saved {
  geometry: GeoJSON.Polygon;
  properties: { name: string; footprint: Record<string, number | string> };
}

async function saveAndRead(page: Page, planId: string): Promise<Saved[]> {
  // Autosave may already have persisted the change, which disables the button; clicking a disabled
  // button would wait forever (Playwright has no action timeout). Click only when there is something
  // to save, then confirm the saved state either way.
  const save = page.getByRole("button", { name: "Save design" });
  if (await save.isEnabled()) await save.click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  const response = await page.request.get(`/api/v1/plans/${planId}/features`);
  return (await response.json()).features;
}

test("one click drops a to-scale footprint; the exact size is editable", async ({ page }) => {
  test.setTimeout(120_000);
  await register(page, "footprint");
  const site = await makeSite(page, "Scale plot");
  const planId = await makePlan(page, site.id, "To scale");
  await forceGuided(page);
  await page.goto(`/sites/${site.id}/design/${planId}?focus=elements`);
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
  await expect(step(page, "Elements")).toHaveAttribute("aria-current", "step");

  const canvas = page.locator(".map-view canvas").first();
  const box = (await canvas.boundingBox())!;
  const click = (x: number, y: number) =>
    canvas.click({ position: { x: box.width * x, y: box.height * y } });

  // A water tank is a 2 m circle after one click.
  await page.getByLabel("Element palette").selectOption({ label: "Water tank" });
  await click(0.3, 0.4);
  await expect(page.getByLabel("Feature name")).toHaveValue("Water tank");
  await expect(page.getByLabel("Diameter (m)")).toHaveValue("2");

  // Placing selects the new element (edit mode); the breadcrumb goes back to the list to add another.
  await page.getByRole("button", { name: /All elements/ }).click();
  // A garden bed is a 1.2 x 4 m rectangle, with a rotation to turn it.
  await page.getByLabel("Element palette").selectOption({ label: "Garden bed" });
  await click(0.6, 0.5);
  await expect(page.getByLabel("Width (m)")).toHaveValue("1.2");
  await expect(page.getByLabel("Length (m)")).toHaveValue("4");
  await expect(page.getByLabel("Rotation (°)")).toHaveValue("0");

  // The rotate buttons turn it, and the rotation field follows (clockwise for "right").
  await page.getByRole("button", { name: "Rotate right 15°" }).click();
  await expect(page.getByLabel("Rotation (°)")).toHaveValue("15");

  // (Dragging to move the whole shape is Terra Draw's own behaviour; it is not asserted here. A save
  // between before/after measurements clears and asynchronously re-adds the editing feature, which
  // raced the drag on slow CI and gave zero movement. The footprint sizing and editing below is what
  // this spec is for.)

  // The exact size is one field away: a 12 x 3 m bed turned a quarter.
  await page.getByLabel("Width (m)").fill("12");
  await page.getByLabel("Length (m)").fill("3");
  await page.getByLabel("Rotation (°)").fill("90");
  await page.getByLabel("Width (m)").fill("0");
  await expect(page.getByRole("alert")).toContainText("between");
  await page.getByLabel("Width (m)").fill("12");
  await page.waitForTimeout(500);
  await page.screenshot({ path: process.env.E2E_SHOT ?? "test-results/element-footprint.png" });

  const saved = await saveAndRead(page, planId);
  const tank = saved.find((f) => f.properties.name === "Water tank")!;
  const bed = saved.find((f) => f.properties.name === "Garden bed")!;
  expect(tank.geometry.type).toBe("Polygon");
  expect(tank.properties.footprint).toEqual({ shape: "round", diameter_m: 2 });
  expect(area(tank.geometry)).toBeGreaterThan(Math.PI * 0.95);
  expect(area(tank.geometry)).toBeLessThan(Math.PI * 1.05);
  expect(bed.properties.footprint).toMatchObject({ shape: "rect", width_m: 12, length_m: 3 });
  expect(area(bed.geometry)).toBeGreaterThan(36 * 0.98);
  expect(area(bed.geometry)).toBeLessThan(36 * 1.02);

  // It survives a reload with its size.
  await page.reload();
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
  await step(page, "Elements").click();
  await page.getByRole("button", { name: "Water tank", exact: true }).click();
  await expect(page.getByLabel("Diameter (m)")).toHaveValue("2");
});
