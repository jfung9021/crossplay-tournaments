import { expect, test, type Browser, type BrowserContext, type Page, type Request } from "@playwright/test";
import type { TournamentDisplay } from "../../../src/domain/display";
import { baseURL, command, createSimpleTournament, evidencePath, login, openMatchFromCard, publishNext, snapshot, writeEvidence } from "../../support/swiss20-browser";

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const names = Array.from({ length: 16 }, (_, i) => `Player ${String(i + 1).padStart(2, "0")}`);
const tile = (tv: Page, matchId: string) => tv.locator(`[data-display-match="${matchId}"]`);

async function setup(admin: Page, browser: Browser, count: number, limit: number) {
  await login(admin);
  const id = await createSimpleTournament(admin, `TV live ${count} controllers`, names.slice(0, count * 2).join("\n"), 1, 2, 10, limit);
  const current = await publishNext(admin, id, 1);
  const matches = current.rounds[0].matches;
  const storageState = await admin.context().storageState();
  const contexts: BrowserContext[] = [];
  const phones = await Promise.all(matches.map(async (match, index) => {
    const context = await browser.newContext({ baseURL, storageState, viewport: { width: 390, height: 844 } });
    contexts.push(context);
    const phone = await context.newPage();
    // Real advancing clocks with intentionally wrong device wall time.
    await phone.clock.install({ time: new Date(Date.now() + (index % 2 ? -1 : 1) * 3_600_000) });
    await openMatchFromCard(phone, id, match.id);
    return phone;
  }));
  const tvContext = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 } });
  contexts.push(tvContext);
  const tv = await tvContext.newPage();
  await tv.clock.install({ time: new Date(Date.now() - 4 * 3_600_000) });
  await tv.goto(`/t/${id}/display`);
  await expect(tv.locator("[data-display-match]")).toHaveCount(count);
  return { id, matches, phones, tv, tvContext, close: () => Promise.all(contexts.map(context => context.close())) };
}

test("TV-LIVE: real controller actions, pending/edit/final scores and connection recovery", async ({ page, browser }) => {
  const run = await setup(page, browser, 1, 60);
  const { id, matches: [match], phones: [phone], tv, tvContext } = run;
  const card = tile(tv, match.id);
  const timings: Record<string, number> = {};
  async function action(label: string, act: () => Promise<unknown>, check: () => Promise<unknown>, budget = 3000) {
    const started = Date.now(); await act(); await check();
    timings[label] = Date.now() - started;
    expect(timings[label], label).toBeLessThanOrEqual(budget);
  }
  const read = async () => (await page.request.get(`/api/tournaments/${id}/display`)).json() as Promise<TournamentDisplay>;
  try {
    await action("start", () => phone.getByRole("button", { name: "Start Timer", exact: true }).click(), () => expect(card).toContainText("Playing", { timeout: 3000 }));
    const active = await phone.locator('[data-active="true"]').getAttribute("data-side");
    await action("switch", () => phone.locator(`[data-side="${active}"]`).click(), () => expect(card.locator(`[data-display-clock="${3 - Number(active)}"] [aria-label="Running"]`)).toBeVisible({ timeout: 3000 }));
    await action("pause", () => phone.getByRole("button", { name: "Pause", exact: true }).click(), () => expect(card).toContainText("Paused", { timeout: 3000 }));
    const paused = await card.locator("[data-display-clock]").allTextContents();
    await sleep(1500);
    expect(await card.locator("[data-display-clock]").allTextContents()).toEqual(paused);
    await action("resume", () => phone.getByRole("button", { name: "Resume", exact: true }).click(), () => expect(card).toContainText("Playing", { timeout: 3000 }));

    // The TV remains connected while its controller is offline.
    await phone.context().setOffline(true);
    await expect(card).toContainText("Clock stale", { timeout: 7500 });
    const stale = await card.locator("[data-display-clock]").allTextContents();
    await sleep(1500);
    expect(await card.locator("[data-display-clock]").allTextContents()).toEqual(stale);
    await phone.context().setOffline(false);
    await expect(card).toContainText("Playing", { timeout: 5000 });
    await tvContext.setOffline(true);
    await expect(card).toContainText("Clock stale", { timeout: 4500 });
    await tvContext.setOffline(false);
    await expect(card).toContainText("Playing", { timeout: 5000 });

    // A hidden TV must obtain a fresh synchronization before resuming projection.
    await tv.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await expect(card).toContainText("Clock stale");
    await sleep(1000);
    await tv.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await expect(card).toContainText("Playing", { timeout: 5000 });
    await action("end", () => phone.getByRole("button", { name: "End game", exact: true }).click(), () => expect(card).toContainText("Reporting", { timeout: 3000 }));
    const scores = phone.locator('input[aria-label$="game score"]');
    await scores.nth(0).fill("401"); await scores.nth(1).fill("399");
    await action("submit", () => phone.getByRole("button", { name: "Review scores", exact: true }).click(), async () => { await expect(card).toContainText("Awaiting confirmation", { timeout: 2000 }); await expect(card).toContainText("401"); }, 2000);
    const pending = await read();
    expect(pending.round?.finalMatches).toBe(0);
    expect(pending.latestResult).toBeNull();
    expect(pending.standings.every(row => row.matchPoints === 0)).toBe(true);
    await tv.screenshot({ path: evidencePath("tv-live-pending.png") });
    await phone.getByRole("button", { name: "Edit scores", exact: true }).click();
    await scores.nth(0).fill("405");
    await action("edit", () => phone.getByRole("button", { name: "Review scores", exact: true }).click(), () => expect(card).toContainText("405", { timeout: 2000 }), 2000);
    await phone.getByRole("button", { name: /: agree$/ }).first().click();
    await expect(phone.getByRole("button", { name: /: agree$/ })).toHaveCount(1);
    await action("final", () => phone.getByRole("button", { name: /: agree$/ }).click(), () => expect(card).toContainText("Final", { timeout: 2000 }), 2000);
    expect((await read()).round?.finalMatches).toBe(1);
    await expect(card.locator("[data-display-clock]")).toHaveCount(0);
    const saved = await snapshot(page.request, id);
    const revision = saved.rounds[0].matches[0].revision;
    const response = await command(page.request, id, "finalize_result", { matchId: match.id, expectedRevision: revision, kind: "played", raw1: 410, raw2: 399, overtime1: 0, overtime2: 0, reason: "TV correction acceptance" });
    expect(response.ok(), await response.text()).toBe(true);
    await expect(card).toContainText("410", { timeout: 2000 });
    await expect(card).not.toContainText("Awaiting confirmation");
    await tv.screenshot({ path: evidencePath("tv-live-final.png") });
    writeEvidence("tv-live-workflow.json", { status: "PASS", timings, pendingExcludedFromStandings: true, offlinePhone: true, offlineTv: true, hiddenReturn: true, correctedFinal: true });
  } finally { await run.close(); }
});

function seconds(text: string) {
  const value = text.match(/(\d+):(\d+)/);
  if (!value) throw new Error(`Missing clock digits: ${text}`);
  return (Number(value[1]) * 60 + Number(value[2])) * (/OT|overtime/.test(text) ? -1 : 1);
}

test("TV-LIVE: ten real minutes with eight controllers, clock offsets and variable latency", async ({ page, browser }) => {
  const run = await setup(page, browser, 8, 60);
  const { phones, tv, matches } = run;
  const latencies: number[] = [], failures: number[] = [], samples: unknown[] = [];
  let requests = 0, maxInFlight = 0;
  const pending = new Set<Request>();
  const perEndpoint = new Map<string, number>();
  let endpointBacklog = 0;
  const observes = (request: Request) => /\/display(?:-checkpoint)?$/.test(new URL(request.url()).pathname);
  for (const browserPage of [...phones, tv]) {
    let requestNumber = 0;
    await browserPage.route(/\/display(?:-checkpoint)?$/, async route => { await sleep([0, 35, 90, 150][requestNumber++ % 4]); await route.continue(); });
    browserPage.on("request", request => {
      if (!observes(request)) return;
      requests++; pending.add(request); maxInFlight = Math.max(maxInFlight, pending.size);
      const key = request.url(); const count = (perEndpoint.get(key) ?? 0) + 1;
      perEndpoint.set(key, count); endpointBacklog = Math.max(endpointBacklog, count);
    });
    browserPage.on("requestfinished", request => {
      if (!pending.delete(request)) return;
      latencies.push(request.timing().responseEnd);
      perEndpoint.set(request.url(), (perEndpoint.get(request.url()) ?? 1) - 1);
    });
    browserPage.on("requestfailed", request => {
      if (!pending.delete(request)) return;
      failures.push(0); perEndpoint.set(request.url(), (perEndpoint.get(request.url()) ?? 1) - 1);
    });
    browserPage.on("response", response => { if (observes(response.request()) && response.status() !== 200) failures.push(response.status()); });
  }
  try {
    await Promise.all(phones.map(phone => phone.getByRole("button", { name: "Start Timer", exact: true }).click()));
    await expect(tv.locator("[data-display-match]").getByText("Playing", { exact: true })).toHaveCount(8);
    const initialGeometry = await tv.locator("[data-display-match]").evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
    const started = Date.now();
    let maximumDifference = 0;
    for (let index = 0; Date.now() - started < 600_000; index++) {
      const measuredAt = Date.now();
      const [phoneValues, tvValues] = await Promise.all([
        Promise.all(phones.map(phone => phone.locator("[data-side]").evaluateAll(elements => Object.fromEntries(elements.map(el => [el.getAttribute("data-side"), el.querySelector(".sr-only")!.textContent!]))))),
        tv.locator("[data-display-match]").evaluateAll(elements => Object.fromEntries(elements.map(el => [el.getAttribute("data-display-match"), [...el.querySelectorAll("[data-display-clock]")].map(value => value.getAttribute("aria-label")!)]))),
      ]);
      const differences = matches.map((match, matchIndex) => [1, 2].map(side => Math.abs(seconds(phoneValues[matchIndex][side]) - seconds(tvValues[match.id][side - 1]))));
      maximumDifference = Math.max(maximumDifference, ...differences.flat());
      samples.push({ elapsedMs: measuredAt - started, captureMs: Date.now() - measuredAt, differences });
      expect(maximumDifference, `Clock comparison at ${Math.round((Date.now() - started) / 1000)} seconds`).toBeLessThanOrEqual(1);
      await expect(tv.getByText("Clock stale", { exact: true })).toHaveCount(0);
      if (index % 15 === 0) console.log(`[tv-live] ${Math.round((Date.now() - started) / 1000)}s: max clock difference ${maximumDifference}s; ${requests} timing requests`);
      await sleep(2000);
    }
    expect(await tv.locator("[data-display-match]").evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }))).toEqual(initialGeometry);
    await tv.screenshot({ path: evidencePath("tv-live-ten-minutes.png") });
    const sorted = [...latencies].sort((a, b) => a - b);
    const metrics = { durationMs: Date.now() - started, controllers: 8, requests, completed: latencies.length, failures, maxInFlight, endpointBacklog, maximumDifference, latencyMs: { p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], p99: sorted[Math.floor(sorted.length * .99)], max: sorted.at(-1) }, samples };
    writeEvidence("tv-live-ten-minutes.json", metrics);
    expect(failures).toEqual([]);
    expect(endpointBacklog).toBe(1);
    expect(requests).toBeGreaterThan(2800);
    expect(metrics.latencyMs.p99).toBeLessThanOrEqual(300);
  } finally { await run.close(); }
});
