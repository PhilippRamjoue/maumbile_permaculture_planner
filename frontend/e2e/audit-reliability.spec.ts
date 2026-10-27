import { expect, test } from "./map-fixture";
import { forceGuided, makePlan, makeSite, register } from "./helpers";

test.skip(!process.env.E2E, "set E2E=1 with the stack running to enable");

test("a stale browser tab cannot overwrite the other tab's saved design", async ({ page }) => {
  test.setTimeout(90_000);
  await register(page, "stale-tab");
  const site = await makeSite(page, "Concurrency plot");
  const id = await makePlan(page, site.id, "Two tabs");
  const plan = await (await page.request.get(`/api/v1/plans/${id}`)).json();
  const layer = plan.layers.find((item: { name: string }) => item.name === "Elements");
  await page.request.post(`/api/v1/plans/${id}/features:batch`, {
    data: {
      features: [
        {
          id: crypto.randomUUID(),
          layer_id: layer.id,
          feature_type: "element",
          properties: { name: "Original tree" },
          geometry: { type: "Point", coordinates: [36.8005, -1.2005] },
        },
      ],
    },
  });
  const url = `/sites/${site.id}/design/${id}`;
  await page.goto(url);
  const other = await page.context().newPage();
  await other.route(/\/imagery\/\d+\/\d+\/\d+\.png/, (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOIaTX/DwAEcQIYUrdqpQAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
  await other.goto(new URL(url, page.url()).href);
  for (const current of [page, other])
    await expect(current.getByRole("button", { name: "Original tree", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Original tree", exact: true }).click();
  await page.getByLabel("Feature name").fill("Saved in first tab");
  await page.getByRole("heading", { name: "Two tabs", exact: true }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.getByRole("link", { name: "← Plans", exact: true }).click();
  await page.getByRole("link", { name: "Two tabs", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved in first tab", exact: true })).toBeVisible();
  await other.getByRole("button", { name: "Original tree", exact: true }).click();
  await other.getByLabel("Feature name").fill("Stale tab's edit");
  await other.getByRole("heading", { name: "Two tabs", exact: true }).click();
  await expect(other.getByRole("alert").filter({ hasText: "Could not save:" })).toContainText(
    "changed in another tab",
  );
  await expect(other.getByRole("button", { name: "Download unsaved draft" })).toBeVisible();
  const saved = await (await page.request.get(`/api/v1/plans/${id}/features`)).json();
  expect(saved.features[0].properties.name).toBe("Saved in first tab");
  await other.close({ runBeforeUnload: false });
});

test("map tile requests renew an expired access session", async ({ page, context }) => {
  test.setTimeout(60_000);
  await register(page, "tile-renewal");
  const site = await makeSite(page, "Session plot");
  await page.goto(`/sites/${site.id}`);
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
  await page.waitForLoadState("networkidle");
  await context.clearCookies({ name: "access_token" });
  const seen = new Set<string>();
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOIaTX/DwAEcQIYUrdqpQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.route(/\/imagery\/\d+\/\d+\/\d+\.png/, async (route) => {
    if (!seen.has(route.request().url())) {
      seen.add(route.request().url());
      await route.fulfill({
        status: 401,
        contentType: "application/problem+json",
        body: JSON.stringify({ title: "Not authenticated" }),
      });
    } else await route.fulfill({ contentType: "image/png", body: pixel });
  });
  const renewed = page.waitForResponse(
    (response) => response.url().endsWith("/auth/refresh") && response.status() === 200,
  );
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await renewed;
  expect(seen.size).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Retry map" })).toHaveCount(0);
  expect((await context.cookies()).some((cookie) => cookie.name === "access_token")).toBe(true);
});

test("nginx returns a real 404 for missing JS and caches hashed assets", async ({ page }) => {
  const missing = await page.request.get("/assets/audit-missing-file.js");
  expect(missing.status()).toBe(404);
  const root = await page.request.get("/");
  expect(root.headers()["cache-control"]).toBe("no-cache");
  const asset = /src="([^"]+\.js)"/.exec(await root.text())![1];
  const response = await page.request.get(asset);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("immutable");
});

test("invalid borders never report saved, while valid border changes autosave", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await register(page, "border-save");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const site = await makeSite(page, "Border plot");
  const id = await makePlan(page, site.id, "Border design");
  await forceGuided(page);
  await page.goto(`/sites/${site.id}/design/${id}?focus=boundary`);
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-map-ready", "true");
  const canvas = page.getByTestId("map-view").locator("canvas.maplibregl-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const x = (lng: number) => (lng + 180) / 360;
  const y = (lat: number) =>
    (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
  const dx = x(site.bbox[2]) - x(site.bbox[0]);
  const dy = y(site.bbox[1]) - y(site.bbox[3]);
  const world =
    512 *
    2 **
      Math.min(
        18,
        Math.log2((box.width - 96) / (512 * dx)),
        Math.log2((box.height - 96) / (512 * dy)),
      );
  const corner = {
    x: box.x + (box.width - dx * world) / 2,
    y: box.y + (box.height - dy * world) / 2,
  };
  const opposite = {
    x: box.x + (box.width + dx * world) / 2,
    y: box.y + (box.height + dy * world) / 2,
  };
  const drag = async (to: { x: number; y: number }) => {
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
  };
  await drag(opposite);
  await expect(
    page.getByRole("status").filter({ hasText: "Not saved — fix the border" }),
  ).toBeVisible();
  await expect(page.getByText("All changes saved")).toHaveCount(0);
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await drag({ x: corner.x - 20, y: corner.y - 20 });
  await expect
    .poll(
      async () => (await (await page.request.get(`/api/v1/sites/${site.id}`)).json()).boundary,
      { timeout: 15_000 },
    )
    .not.toEqual(site.boundary);
  await expect(page.getByText("All changes saved")).toBeVisible();
});
