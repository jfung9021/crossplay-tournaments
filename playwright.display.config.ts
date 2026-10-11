import { defineConfig } from "@playwright/test";

// Public display fixtures only; every display API read is intercepted by the tests.
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "display-live.spec.ts", workers: 1, retries: 0,
  timeout: 60_000, expect: { timeout: 8000 }, outputDir: ".local/evidence/tv-live/browser",
  use: { baseURL: "http://127.0.0.1:3002", viewport: { width: 1920, height: 1080 }, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
});
