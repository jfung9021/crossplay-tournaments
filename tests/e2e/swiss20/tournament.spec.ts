import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@playwright/test";
import type { Fixture } from "../../support/swiss-reference";
import { finishFullEvent, runFullEvent } from "../../support/swiss20-browser";

test("20 players complete six realistic Swiss rounds through independent player sessions", async ({ page, browser }, testInfo) => {
  const fixture = JSON.parse(readFileSync(resolve("tests/fixtures/swiss20/mixed-results-v1.json"), "utf8")) as Fixture;
  const event = await runFullEvent(page, browser, fixture, testInfo);
  await finishFullEvent(page, fixture, event);
});
