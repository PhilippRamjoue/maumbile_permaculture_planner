import { test as base, expect } from "@playwright/test";

// Exercise the real app and API without depending on third-party tile uptime. The backend's
// upstream proxy is covered separately by its PostGIS integration/provider tests.
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOIaTX/DwAEcQIYUrdqpQAAAABJRU5ErkJggg==",
  "base64",
);

export const test = base.extend({
  page: async ({ page }, use) => {
    if (!process.env.E2E_LIVE_TILES) {
      await page.route(/\/imagery\/\d+\/\d+\/\d+\.png/, (route) =>
        route.fulfill({ contentType: "image/png", body: pixel }),
      );
      await page.route("https://tile.openstreetmap.org/**", (route) =>
        route.fulfill({ contentType: "image/png", body: pixel }),
      );
    }
    await use(page);
  },
});

export { expect };
