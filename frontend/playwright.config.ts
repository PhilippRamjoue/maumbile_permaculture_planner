import { defineConfig } from "@playwright/test";

/**
 * Best-effort e2e: needs the full stack running (backend + db + `npm run dev`, or the compose
 * stack) and `E2E=1`. Browsers are installed separately: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },
});
