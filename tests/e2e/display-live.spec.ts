import { expect, test, type Page } from "@playwright/test";
import type { TournamentDisplay } from "../../src/domain/display";
import { mkdirSync, writeFileSync } from "node:fs";

const names = ["Alex Rowan", "Morgan Vale", "Casey Finch", "Jamie Reed", "Sam Rivera", "Robin Park", "Taylor Moss", "Jordan Lake", "Avery Stone", "Quinn West", "Charlie Gray", "Drew Bloom", "Parker Hill", "Skyler Lane", "Reese Woods", "Hayden Ross"];
function fixture(count = 16, long = false): TournamentDisplay {
  const standings = Array.from({ length: count }, (_, i) => ({ entrantId: `p${i}`, name: long ? `${i} ${"Alexandria ".repeat(6)}` : names[i] ?? `Player ${i + 1}`, rank: i + 1, matchPoints: 0, difference: 0, wins: 0, draws: 0, losses: 0, played: 0, active: true }));
  return { revision: "initial", serverNowMs: Date.now(), clockStatusAvailable: true, liveTimingAvailable: true,
    tournament: { id: "tv-fixture", slug: "tv-fixture", name: "Autumn Crossplay Open", status: "active", roundCount: 5, currentRound: 1, runGeneration: 0 }, standings, latestResult: null,
    round: { number: 1, totalMatches: count / 2, finalMatches: 0, byes: [], matches: Array.from({ length: count / 2 }, (_, i) => ({ id: `m${i}`, roundNumber: 1, tableNumber: i + 1, queueOrder: 1, player1: { id: standings[i * 2].entrantId, name: standings[i * 2].name }, player2: { id: standings[i * 2 + 1].entrantId, name: standings[i * 2 + 1].name }, kind: "played", status: "playing", result: null, completedAt: null })) }, clocks: {} };
}
async function fit(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => {
    if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1) return [{ element: "document", width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }];
    return [...document.querySelectorAll<HTMLElement>('article,table,footer')].filter(el => el.offsetWidth && !el.closest('[aria-hidden="true"]')).flatMap(el => {
      const box = el.getBoundingClientRect(); return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 && box.bottom <= innerHeight + 1 && box.right <= innerWidth + 1 ? [] : [{ element: el.tagName, label: el.getAttribute("aria-label"), width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight, bottom: box.bottom }];
    });
  })).toEqual([]);
}
test("sixteen rows fill the panel and scores transition without shifting cards", async ({ page }, info) => {
  const data = fixture(); let samples = true, error = false; const start = Date.now();
  await page.route("**/api/tournaments/tv-fixture/display", async route => {
    if (error) return route.fulfill({ status: 503, json: { error: "offline" } });
    if (samples) for (const match of data.round!.matches.filter(match => match.status === "playing")) data.clocks![match.id] = { status: "running", activeSide: 1, usedMs: [0, 0], epoch: 1, version: 1, sequence: 1,
      rules: { timeLimitSeconds: 1200, penaltyIntervalSeconds: 10, penaltyPoints: 2 }, sample: { usedMs: [Date.now() - start, 0], sampledAtMs: Date.now(), uncertaintyMs: 20 } };
    await route.fulfill({ json: { ...data, serverNowMs: Date.now() } });
  });
  await page.goto("/t/tv-fixture/display");
  const cards = page.getByRole("article"), rows = page.getByRole("table").locator("tbody tr");
  await expect(cards).toHaveCount(8); await expect(rows).toHaveCount(16); await fit(page);
  await expect.poll(() => rows.last().evaluate(el => Math.abs(el.getBoundingClientRect().bottom - el.closest("table")!.parentElement!.getBoundingClientRect().bottom))).toBeLessThanOrEqual(2);
  const positions = await cards.evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
  expect(new Set(positions.map(p => p[0])).size).toBe(2); expect(new Set(positions.map(p => p[1])).size).toBe(4);
  await page.screenshot({ path: `.local/evidence/tv-live/${info.project.name}-running.png` });
  if (info.project.name === "chromium") {
    const session = await page.context().newCDPSession(page);
    await session.send("Profiler.enable"); await session.send("Profiler.start");
    await page.evaluate(() => {
      const metrics = { longTasks: [] as number[], shifts: [] as number[] };
      (window as unknown as { tvMetrics: typeof metrics }).tvMetrics = metrics;
      new PerformanceObserver(list => metrics.longTasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: "longtask" });
      new PerformanceObserver(list => metrics.shifts.push(...list.getEntries().map(entry => (entry as PerformanceEntry & { value: number }).value))).observe({ type: "layout-shift" });
    });
    await page.waitForTimeout(5000);
    const metrics = await page.evaluate(() => (window as unknown as { tvMetrics: { longTasks: number[]; shifts: number[] } }).tvMetrics);
    const profile = await session.send("Profiler.stop"); await session.detach();
    mkdirSync(".local/evidence/tv-live", { recursive: true });
    writeFileSync(".local/evidence/tv-live/steady-ticking.json", JSON.stringify(metrics, null, 2));
    writeFileSync(".local/evidence/tv-live/steady-ticking.cpuprofile", JSON.stringify(profile.profile));
    expect(metrics.shifts.reduce((sum, shift) => sum + shift, 0)).toBe(0);
  }
  const first = cards.first(); const initialTime = await first.locator('[data-display-clock="1"]').innerText();
  await expect.poll(() => first.locator('[data-display-clock="1"]').innerText()).not.toBe(initialTime);
  data.round!.matches[0].status = "awaiting_confirmation"; data.round!.matches[0].provisional = { adjusted1: 410, adjusted2: 385, revision: 1 }; delete data.clocks!.m0; data.revision = "pending";
  await expect(first).toContainText("Awaiting confirmation", { timeout: 2000 }); await expect(first).toContainText("410");
  await expect(rows.first()).toContainText("0");
  await fit(page); expect(await cards.evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }))).toEqual(positions);
  await page.screenshot({ path: `.local/evidence/tv-live/${info.project.name}-pending.png` });
  data.round!.matches[0].provisional = { adjusted1: 411, adjusted2: 385, revision: 2 }; data.revision = "edited";
  await expect(first).toContainText("411", { timeout: 2000 });
  data.round!.matches[0].status = "final"; data.round!.matches[0].result = { adjusted1: 411, adjusted2: 385, points1: 2, points2: 0 }; data.round!.finalMatches = 1; data.standings[0].matchPoints = 1; data.revision = "final";
  await expect(first).toContainText("Final", { timeout: 2000 }); await expect(first).not.toContainText("Awaiting"); await fit(page);
  await page.screenshot({ path: `.local/evidence/tv-live/${info.project.name}-final.png` });
  samples = false;
  await expect(cards.nth(1)).toContainText("Clock stale", { timeout: 8000 });
  const frozen = await cards.nth(1).locator('[data-display-clock="1"]').innerText();
  await page.waitForTimeout(1100); expect(await cards.nth(1).locator('[data-display-clock="1"]').innerText()).toBe(frozen);
  samples = true; await expect(cards.nth(1)).toContainText("Playing");
  error = true; await expect(page.getByText("Reconnecting", { exact: true })).toBeVisible(); await expect(cards.nth(1)).toContainText("Clock stale");
  await page.screenshot({ path: `.local/evidence/tv-live/${info.project.name}-stale.png` });
});

test("long names and larger rosters paginate; final standings fill the body", async ({ page }, info) => {
  let data = fixture(32, true);
  await page.route("**/api/tournaments/tv-fixture/display", route => route.fulfill({ json: { ...data, serverNowMs: Date.now() } }));
  await page.goto("/t/tv-fixture/display"); await fit(page);
  await expect(page.getByRole("navigation", { name: "Standings pages" })).toBeVisible();
  await page.getByRole("button", { name: "Pause standings rotation" }).click();
  const seen = new Set<string>(); const pages = Number((await page.getByRole("navigation", { name: "Standings pages" }).innerText()).match(/\d+\s*\/\s*(\d+)/)![1]);
  for (let i = 0; i < pages; i++) { for (const name of await page.getByRole("table").locator("tbody td:nth-child(2)").allTextContents()) seen.add(name); await page.getByRole("button", { name: "Next standings page" }).click(); }
  expect(seen.size).toBe(32);
  await page.setViewportSize({ width: 1366, height: 768 }); await fit(page);
  await page.screenshot({ path: `.local/evidence/tv-live/${info.project.name}-small-long.png` });
  data = fixture(); data.tournament.status = "finished"; data.revision = "finished";
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.getByRole("heading", { name: "Final standings", exact: true })).toBeVisible(); await fit(page);
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(16);
});
