import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // During local dev, proxy API calls to the backend.
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    // The lazy-loaded map chunk is MapLibre (~800 kB); it is deliberately split from the main bundle.
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
