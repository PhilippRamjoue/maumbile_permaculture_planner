import { expect, test } from "./map-fixture";
import { forceGuided, makePlan, makeSite, register, step } from "./helpers";

test.skip(!process.env.E2E, "set E2E=1 with the stack running to enable");

test("drawing reveals a renamed destination layer and saves into its stable role", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await register(page, "layer-role");
  const site = await makeSite(page, "Layer role plot");
  const planId = await makePlan(page, site.id, "Stable layers");
  const plan = await (await page.request.get(`/api/v1/plans/${planId}`)).json();
  const zone = plan.layers.find((layer: { role: string }) => layer.role === "zone");
  expect(
    (
      await page.request.patch(`/api/v1/layers/${zone.id}`, {
        data: { name: "Kitchen garden", visible: false },
      })
    ).ok(),
  ).toBe(true);
  await forceGuided(page);
  await page.goto(`/sites/${site.id}/design/${planId}`);
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
  await step(page, "Zones").click();
  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  const canvas = page.getByTestId("map-view").locator("canvas.maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  for (const [x, y] of [
    [0.2, 0.35],
    [0.43, 0.35],
    [0.43, 0.65],
    [0.2, 0.65],
    [0.2, 0.35],
  ]) {
    await canvas.click({ position: { x: box.width * x, y: box.height * y } });
  }
  await expect(page.getByLabel("Feature name")).toHaveValue("zone");
  await page.getByRole("heading", { name: "Stable layers", exact: true }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  const saved = await (await page.request.get(`/api/v1/plans/${planId}/design`)).json();
  expect(saved.features.features[0].layer_id).toBe(zone.id);
  expect(saved.plan.layers.find((layer: { id: string }) => layer.id === zone.id).visible).toBe(
    true,
  );
});

test("a reconnect refresh failure preserves an actual unsaved editor draft", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await register(page, "draft-refresh");
  const site = await makeSite(page, "Reconnect plot");
  const planId = await makePlan(page, site.id, "Reconnect draft");
  const plan = await (await page.request.get(`/api/v1/plans/${planId}`)).json();
  const layer = plan.layers.find((item: { role: string }) => item.role === "element");
  await page.request.post(`/api/v1/plans/${planId}/features:batch`, {
    data: {
      features: [
        {
          id: crypto.randomUUID(),
          layer_id: layer.id,
          feature_type: "element",
          geometry: { type: "Point", coordinates: [36.8005, -1.2005] },
          properties: { name: "Original tree" },
        },
      ],
    },
  });
  await page.goto(`/sites/${site.id}/design/${planId}`);
  await page.getByRole("button", { name: "Original tree", exact: true }).click();
  // Keep writes pending locally so a successful autosave cannot mask draft disposal.
  await page.route(`**/plans/${planId}/design`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({ title: "Temporary outage" }),
    }),
  );
  await page.getByLabel("Feature name").fill("Unsaved tree");
  await context.setOffline(true);
  // Make cached reads stale without waiting for real time or changing animation timers.
  await page.clock.setSystemTime(Date.now() + 60_000);
  await context.setOffline(false);
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not refresh the design" }),
  ).toBeVisible();
  await expect(page.getByLabel("Feature name")).toHaveValue("Unsaved tree");
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
});
