import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { assertLocalEnvironment } from "./tests/support/local-environment";

assertLocalEnvironment();
const evidence = process.env.CROSSPLAY_EVIDENCE_DIR;
if (!evidence) throw new Error("Run npm run test:e2e:clock to provision isolated targets.");
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["clock/**/*.spec.ts", "tournaments.spec.ts"],
  fullyParallel: false, workers: 1, retries: 0, timeout: 900_000,
  expect: { timeout: 15_000 },
  outputDir: resolve(evidence, "browser-output"),
  reporter: [["list"], ["json", { outputFile: resolve(evidence, "results.json") }]],
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL, ...devices["Desktop Chrome"], actionTimeout: 15_000, navigationTimeout: 30_000, trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "chromium", testIgnore: "**/portrait-ui.spec.ts" },
    { name: "webkit-tables", testMatch: "**/table-device-ui.spec.ts", use: { browserName: "webkit", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    ...(["chromium", "webkit"] as const).flatMap(browserName => [
      { name: `${browserName}-phone`, testMatch: "**/portrait-ui.spec.ts", use: { browserName, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
      { name: `${browserName}-tablet`, testMatch: "**/portrait-ui.spec.ts", use: { browserName, viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    ]),
  ],
});
