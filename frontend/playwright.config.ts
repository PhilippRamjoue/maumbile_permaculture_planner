import { defineConfig } from "@playwright/test";

/**
 * Best-effort e2e: needs the full stack running (backend + db + `npm run dev`, or the compose
 * stack) and `E2E=1`. Browsers are installed separately: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // CI runs on software GL (swiftshader): map rendering and Terra Draw interactions settle slowly and
  // occasionally miss a frame, so retry there. Locally (real GPU) tests are deterministic.
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
});
