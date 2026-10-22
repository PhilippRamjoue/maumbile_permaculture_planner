import { expect, test } from "./map-fixture";

test.skip(!process.env.E2E, "set E2E=1 with the stack running to enable");

test("draw, place, drag, measure, save and reload a design", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `editor-${Date.now()}@example.org`;
  const password = "e2e-editor-password-123";
  expect(
    (await page.request.post("/api/v1/auth/register", { data: { email, password } })).ok(),
  ).toBe(true);
  expect((await page.request.post("/api/v1/auth/login", { data: { email, password } })).ok()).toBe(
    true,
  );
  const response = await page.request.post("/api/v1/sites", {
    data: {
      name: "Editor plot",
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
  const site = await response.json();
  await page.goto(`/sites/${site.id}`);
  await page.getByRole("link", { name: "Design plans" }).click();
  await page.getByLabel("Plan name").fill("Food forest design");
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { name: "Food forest design" })).toBeVisible();
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
  const canvas = page.getByTestId("map-view").locator("canvas.maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  const click = async (x: number, y: number) =>
    canvas.click({ position: { x: box.width * x, y: box.height * y } });
  const planId = page.url().split("/").at(-1)!;
  const featuresUrl = `/api/v1/plans/${planId}/features`;

  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  await click(0.2, 0.35);
  await click(0.43, 0.35);
  await click(0.43, 0.65);
  await click(0.2, 0.65);
  await click(0.2, 0.35);
  await expect(page.getByLabel("Feature name")).toHaveValue("zone");
  await page.getByLabel("Feature name").fill("Kitchen zone");
  await page.getByLabel("Zone number").selectOption("1");
  await page.getByRole("button", { name: "Confirm measurement" }).click();
  await expect(page.getByText("Confirmed by server")).toBeVisible();

  await page.getByLabel("Element palette").selectOption({ label: "House" });
  await click(0.55, 0.35);
  await click(0.67, 0.48);
  await expect(page.getByLabel("Feature name")).toHaveValue("House");
  await page.getByLabel("Feature name").fill("Main house");
  await page.getByRole("button", { name: "Save design" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  const first = (await (await page.request.get(featuresUrl)).json()).features;
  const houseBefore = first.find(
    (f: { properties: { name: string } }) => f.properties.name === "Main house",
  );
  expect(first).toHaveLength(2);

  await page.mouse.move(box.x + box.width * 0.61, box.y + box.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.73, box.y + box.height * 0.55, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Rotate right 15°", exact: true }).click();
  await page.getByRole("button", { name: "Draw path", exact: true }).click();
  await click(0.45, 0.7);
  await click(0.6, 0.72);
  await click(0.78, 0.7);
  await canvas.press("Enter");
  await expect(page.getByLabel("Feature name")).toHaveValue("path");
  await page.getByLabel("Feature name").fill("Access path");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Save design" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  const saved = (await (await page.request.get(featuresUrl)).json()).features;
  expect(saved).toHaveLength(3);
  const houseAfter = saved.find(
    (f: { properties: { name: string } }) => f.properties.name === "Main house",
  );
  expect(houseAfter.geometry).not.toEqual(houseBefore.geometry);
  expect(
    saved.find((f: { feature_type: string }) => f.feature_type === "path").length_m,
  ).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Kitchen zone", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Main house", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Access path", exact: true })).toBeVisible();
  expect((await (await page.request.get(featuresUrl)).json()).features).toEqual(saved);
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
  await expect(async () => {
    await click(0.73, 0.55);
    await expect(page.getByLabel("Feature name")).toHaveValue("Main house", { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: "test-results/design-editor.png", fullPage: true });

  // A measurement is transient. Delete a persisted feature and verify it stays deleted.
  await page.getByRole("button", { name: "Measure distance", exact: true }).click();
  await click(0.2, 0.8);
  await click(0.4, 0.8);
  await canvas.press("Enter");
  await expect(page.getByRole("heading", { name: "Features (3)" })).toBeVisible();
  await page.getByRole("button", { name: "Access path", exact: true }).click();
  await page.getByRole("button", { name: "Delete feature", exact: true }).click();
  await page.getByRole("button", { name: "Save design" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Features (2)" })).toBeVisible();
  expect((await (await page.request.get(featuresUrl)).json()).features).toHaveLength(2);
});

test("keeps drafts after save failure, warns before leaving, and persists layer changes", async ({
  page,
}) => {
  const email = `editor-retry-${Date.now()}@example.org`;
  const password = "e2e-editor-password-123";
  await page.request.post("/api/v1/auth/register", { data: { email, password } });
  await page.request.post("/api/v1/auth/login", { data: { email, password } });
  const site = await (
    await page.request.post("/api/v1/sites", {
      data: {
        name: "Retry plot",
        country_code: "KE",
        coordinates: [
          [36.8, -1.2],
          [36.801, -1.2],
          [36.801, -1.201],
          [36.8, -1.201],
        ],
      },
    })
  ).json();
  const plan = await (
    await page.request.post(`/api/v1/sites/${site.id}/plans`, { data: { name: "Retry design" } })
  ).json();
  const layer = plan.layers.find((l: { name: string }) => l.name === "Elements");
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
  await page.getByRole("button", { name: "Tree", exact: true }).click();
  await page.getByLabel("Feature name").fill("Mango");
  await page.getByRole("link", { name: "← Plans", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Unsaved design" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Feature name")).toHaveValue("Mango");
  await page.getByRole("button", { name: "Raise Elements", exact: true }).click();
  await page.getByRole("checkbox", { name: "Zones", exact: true }).uncheck();
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
  await expect(page.getByRole("button", { name: "Mango", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Zones", exact: true })).not.toBeChecked();
  const updated = await (await page.request.get(`/api/v1/plans/${plan.id}`)).json();
  expect(updated.layers.find((l: { id: string }) => l.id === layer.id).sort_order).toBe(
    layer.sort_order + 1,
  );
});
