import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

import pkg from "./package.json";

// The release build passes the tag version as VITE_APP_VERSION (via the image's APP_VERSION build
// arg); other builds fall back to package.json. Shown in the footer so the running version is visible.
const appVersion = process.env.VITE_APP_VERSION || pkg.version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  server: {
    port: 5173,
    // During local dev, proxy API calls to the backend.
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    // MapLibre is lazy-loaded separately; keep the budget visible as the library evolves.
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    css: false,
    // Playwright specs run under `npm run e2e`, not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
