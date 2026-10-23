import { step, register, makeSite } from "./helpers";
import { expect, test } from "./map-fixture";

test.skip(!process.env.E2E, "set E2E=1 with the stack running to enable");

// The editor is a guided focus-mode shell: each mode (Boundary, Sectors & terrain, Zones,
// Elements, Functions) edits one family of features over one saved design. These specs drive it
// through that shell — switch focus, use the mode's own tools — and were rewritten for it.

test("draws a zone and places an element across focus modes, then saves and reloads", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await register(page, "editor");
  const site = await makeSite(page, "Editor plot");
  const plan = await (
    await page.request.post(`/api/v1/sites/${site.id}/plans`, { data: { name: "Food forest" } })
  ).json();
  const featuresUrl = `/api/v1/plans/${plan.id}/features`;

  await page.goto(`/sites/${site.id}/design/${plan.id}`);
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
  const canvas = page.getByTestId("map-view").locator("canvas.maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  const click = (x: number, y: number) =>
    canvas.click({ position: { x: box.width * x, y: box.height * y } });

  // Zones focus: choose the zone number, draw an area, name it.
  await step(page, "Zones").click();
  await page.getByLabel("Draw as zone").selectOption("1");
  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  await click(0.2, 0.35);
  await click(0.43, 0.35);
  await click(0.43, 0.65);
  await click(0.2, 0.65);
  await click(0.2, 0.35); // click the first corner again to finish
  await expect(page.getByLabel("Feature name")).toHaveValue("zone");
  await page.getByLabel("Feature name").fill("Kitchen zone");
  await expect(page.getByRole("heading", { name: "Zones (1)" })).toBeVisible();

  // Elements focus: pick from the palette and place it.
  await step(page, "Elements").click();
  await page.getByLabel("Element palette").selectOption({ label: "House" });
  await click(0.55, 0.35);
  await click(0.67, 0.48);
  await expect(page.getByLabel("Feature name")).toHaveValue("House");
  await page.getByLabel("Feature name").fill("Main house");
  await expect(page.getByRole("heading", { name: "Elements (1)" })).toBeVisible();

  await page.getByRole("button", { name: "Save design" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();

  const saved = (await (await page.request.get(featuresUrl)).json()).features;
  expect(saved).toHaveLength(2);
  expect(saved.map((f: { properties: { name: string } }) => f.properties.name).sort()).toEqual([
    "Kitchen zone",
    "Main house",
  ]);

  // The design is one saved thing, seen from every mode: it survives a reload.
  await page.reload();
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
  await step(page, "Zones").click();
  // The zone list labels zones as "<name> · zone <n>", so match the name as a substring.
  await expect(page.getByRole("button", { name: "Kitchen zone" })).toBeVisible();
  await step(page, "Elements").click();
  await expect(page.getByRole("button", { name: "Main house", exact: true })).toBeVisible();
});

test("keeps the draft after a save failure and warns before leaving", async ({ page }) => {
  test.setTimeout(90_000);
  await register(page, "editor-retry");
  const site = await makeSite(page, "Retry plot");
  const plan = await (
    await page.request.post(`/api/v1/sites/${site.id}/plans`, { data: { name: "Retry design" } })
  ).json();
  const layer = plan.layers.find((l: { name: string }) => l.name === "Elements");
  // Seed one element so there is something to edit on open.
  await page.request.post(`/api/v1/plans/${plan.id}/features:batch`, {
    data: {
      features: [
        {
          type: "Feature",
          id: crypto.randomUUID(),
          layer_id: layer.id,
          feature_type: "element",
          geometry: { type: "Point", coordinates: [36.8005, -1.2005] },
          properties: { name: "Tree" },
        },
      ],
    },
  });

  await page.goto(`/sites/${site.id}/design/${plan.id}`);
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
  await step(page, "Elements").click();
  await page.getByRole("button", { name: "Tree", exact: true }).click();
  await page.getByLabel("Feature name").fill("Mango");

  // Leaving with unsaved work warns first; "Keep editing" preserves the draft.
  await page.getByRole("link", { name: "← Plans", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Unsaved design" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Feature name")).toHaveValue("Mango");

  // A failed save keeps the draft in place; a retry succeeds.
  await page.route(
    /\/features:batch$/,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({ title: "Temporarily unavailable" }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Save design" }).click();
  await expect(page.getByRole("alert")).toContainText("Your draft is still here");
  await expect(page.getByLabel("Feature name")).toHaveValue("Mango");

  await page.getByRole("button", { name: "Save design" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();

  await page.reload();
  await step(page, "Elements").click();
  await expect(page.getByRole("button", { name: "Mango", exact: true })).toBeVisible();
});
