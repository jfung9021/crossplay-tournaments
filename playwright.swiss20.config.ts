import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { assertLocalEnvironment } from "./tests/support/local-environment";

assertLocalEnvironment();
const evidence = process.env.CROSSPLAY_EVIDENCE_DIR;
if (!evidence) throw new Error("Run with npm run test:e2e:swiss20 so isolated targets are provisioned first.");
export default defineConfig({
  testDir: "./tests/e2e/swiss20",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 900_000,
  expect: { timeout: 12_000 },
  outputDir: resolve(evidence, "browser-output"),
  reporter: [["list"], ["html", { outputFolder: resolve(evidence, "playwright-report"), open: "never" }], ["json", { outputFile: resolve(evidence, "results.json") }]],
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL, ...devices["Desktop Chrome"], trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium" }],
});
