import type { Page } from "@playwright/test";
import area from "@turf/area";

import { makePlan, makeSite, register, step } from "./helpers";
import { expect, test } from "./map-fixture";

test.skip(!process.env.E2E, "set E2E=1 with the stack running to enable");

// Elements are placed to scale: one click drops the footprint at its real size, and the exact
// numbers are one field away on the selected element.

interface Saved {
  geometry: GeoJSON.Polygon;
  properties: { name: string; footprint: Record<string, number | string> };
}

async function saveAndRead(page: Page, planId: string): Promise<Saved[]> {
  await page.getByRole("button", { name: "Save design" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  const response = await page.request.get(`/api/v1/plans/${planId}/features`);
  return (await response.json()).features;
}

test("one click drops a to-scale footprint; the exact size is editable", async ({ page }) => {
  test.setTimeout(120_000);
  await register(page, "footprint");
  const site = await makeSite(page, "Scale plot");
  const planId = await makePlan(page, site.id, "To scale");
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

  // A garden bed is a 1.2 x 4 m rectangle, with a rotation to turn it.
  await page.getByLabel("Element palette").selectOption({ label: "Garden bed" });
  await click(0.6, 0.5);
  await expect(page.getByLabel("Width (m)")).toHaveValue("1.2");
  await expect(page.getByLabel("Length (m)")).toHaveValue("4");
  await expect(page.getByLabel("Rotation (°)")).toHaveValue("0");

  // The rotate buttons turn it, and the rotation field follows (clockwise for "right").
  await page.getByRole("button", { name: "Rotate right 15°" }).click();
  await expect(page.getByLabel("Rotation (°)")).toHaveValue("15");

  // Dragging moves the whole shape and keeps its size.
  const centreOf = async () => {
    const features = (await saveAndRead(page, planId)).filter(
      (f) => f.properties.name === "Garden bed",
    );
    const ring = features[0]!.geometry.coordinates[0]!;
    return [
      (Math.min(...ring.map((p) => p[0]!)) + Math.max(...ring.map((p) => p[0]!))) / 2,
      (Math.min(...ring.map((p) => p[1]!)) + Math.max(...ring.map((p) => p[1]!))) / 2,
    ];
  };
  const before = await centreOf();
  const [fromX, fromY] = [box.x + box.width * 0.6, box.y + box.height * 0.5];
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(fromX + 40, fromY + 20, { steps: 8 });
  await page.mouse.up();
  const after = await centreOf();
  expect(after[0]!).toBeGreaterThan(before[0]!); // east
  expect(after[1]!).toBeLessThan(before[1]!); // south
  await expect(page.getByLabel("Width (m)")).toHaveValue("1.2");
  await expect(page.getByLabel("Rotation (°)")).toHaveValue("15");

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
