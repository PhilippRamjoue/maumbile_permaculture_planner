import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// The full suite runs many jsdom workers at once; the default 1 s wait is too tight under load.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
