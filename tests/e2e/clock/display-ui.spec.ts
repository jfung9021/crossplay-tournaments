import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { TournamentDisplay } from "../../../src/domain/display";
import { baseURL, command, createSimpleTournament, evidencePath, login, publishNext, snapshot } from "../../support/swiss20-browser";

const names = ["Alex Rowan", "Morgan Vale", "Casey Finch", "Jamie Reed", "Sam Rivera", "Robin Park", "Taylor Moss", "Jordan Lake", "Avery Stone", "Quinn West", "Charlie Gray", "Drew Bloom", "Parker Hill", "Skyler Lane", "Reese Woods", "Hayden Ross", "Finley Cole", "Sage Rivers"];

async function fit(page: Page, name: string, project: string) {
  await page.evaluate(() => document.fonts.ready);
  // Wait for ResizeObserver/font measurement to finish before asserting the
  // actual viewport. WebKit can paint the initial layout before the observer.
  await expect.poll(() => page.evaluate(() => {
    if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1) return false;
    return [...document.querySelectorAll<HTMLElement>("[data-tournament-display] article,[data-tournament-display] table,[data-tournament-display] footer")]
      .filter(el => el.offsetWidth && !el.closest('[aria-hidden="true"]')).every(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1);
  }), { timeout: 5_000, message: `${name}: measured layout fits` }).toBe(true);
  const bounds = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
    overflow: [...document.querySelectorAll<HTMLElement>("[data-tournament-display] article,[data-tournament-display] table,[data-tournament-display] footer")].filter(el => el.offsetWidth && !el.closest('[aria-hidden="true"]')).map(el => {
      const box = el.getBoundingClientRect();
      return { label: el.getAttribute("aria-label") ?? el.tagName, x: box.x, y: box.y, right: box.right, bottom: box.bottom, scrollWidth: el.scrollWidth, width: el.clientWidth, scrollHeight: el.scrollHeight, height: el.clientHeight };
    }),
  }));
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.documentHeight).toBeLessThanOrEqual(bounds.height + 1);
  for (const item of bounds.overflow) {
    expect(item.x, item.label).toBeGreaterThanOrEqual(0);
    expect(item.y, item.label).toBeGreaterThanOrEqual(0);
    expect(item.right, item.label).toBeLessThanOrEqual(bounds.width + 1);
    expect(item.bottom, item.label).toBeLessThanOrEqual(bounds.height + 1);
    expect(item.scrollWidth, item.label).toBeLessThanOrEqual(item.width + 1);
    expect(item.scrollHeight, item.label).toBeLessThanOrEqual(item.height + 1);
  }
  await page.screenshot({ path: evidencePath("display", project, `${name}.png`), animations: "disabled" });
}

test("DISPLAY: nine simultaneous tables, public privacy, published rounds and retained rankings", async ({ page, browser }, info) => {
  await login(page);
  const id = await createSimpleTournament(page, "Autumn Crossplay Open", names.join("\n"), 2);
  expect((await page.request.get(`/api/tournaments/${id}/display`)).status()).toBe(404);
  async function tables(action: string, payload: Record<string, unknown>) {
    const current = await snapshot(page.request, id);
    const response = await page.request.post(`/api/tournaments/${id}/tables`, { headers: { Origin: baseURL }, data: { command: action, payload, requestId: randomUUID(), expectedVersion: current.tables?.version ?? 0 } });
    expect(response.ok(), await response.text()).toBe(true);
  }
  await tables("configure_tables", { numbers: Array.from({ length: 9 }, (_, index) => index + 1) });
  for (let number = 1; number <= 9; number++) await tables("assign_device", { deviceId: randomUUID(), label: `PRIVATE_PHONE_${number}`, tableNumber: number });
  let current = await publishNext(page, id, 1);
  const read = async () => (await page.request.get(`/api/tournaments/${id}/display`)).json() as Promise<TournamentDisplay>;
  const first = await read();
  expect(first.clockStatusAvailable).toBe(true);
  expect(first.round?.totalMatches).toBe(9);
  expect(first.round?.matches.every(match => match.queueOrder === 1)).toBe(true);
  expect(first.standings).toHaveLength(18);
  const serialized = JSON.stringify(first);
  for (const privateField of ["PRIVATE_PHONE", "deviceId", "sessionHash", "audit", "disputeReason", "inputHash", "submittedBy"]) expect(serialized).not.toContain(privateField);
  await page.goto(`/t/${id}?browse=1`);
  await expect(page.locator(".match-topline").filter({ hasText: "Queue" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open TV display", exact: true })).toHaveAttribute("href", `/t/${current.tournament.slug}/display`);
  const context = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 } });
  const tv = await context.newPage();
  await tv.goto(`/t/${current.tournament.slug}/display`);
  await expect(tv.getByRole("article", { name: /^Table \d+$/ })).toHaveCount(9);
  await expect(tv.getByRole("table", { name: "Tournament standings", exact: true }).locator("tbody tr")).toHaveCount(18);
  expect(await tv.getByRole("table", { name: "Tournament standings", exact: true }).locator("tbody td").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(24);
  await expect(tv.locator(".site-header")).toBeHidden();
  const publicData = await (await context.request.get(`/api/tournaments/${id}/display`)).json() as TournamentDisplay;
  expect({ ...publicData, serverNowMs: 0 }).toEqual({ ...first, serverNowMs: 0 });
  await fit(tv, "01-nine-tables", info.project.name);
  const roundOne = current.rounds.find(round => round.number === 1)!;
  for (const [index, match] of roundOne.matches.entries()) {
    const response = await command(page.request, id, "finalize_result", { matchId: match.id, expectedRevision: match.revision, kind: "played", raw1: 400 + index, raw2: index === 1 ? 401 : 350, overtime1: 0, overtime2: 0, reason: "Display acceptance result" });
    expect(response.ok(), await response.text()).toBe(true);
    if (index === 0) {
      await expect(tv.getByRole("article", { name: `Table ${match.tableNumber}`, exact: true })).toContainText("400", { timeout: 10_000 });
      await fit(tv, "02-confirmed-result", info.project.name);
    }
  }
  await expect(tv.getByText(/waiting for the next round/i)).toBeVisible({ timeout: 10_000 });
  await fit(tv, "03-between-rounds", info.project.name);
  const withdrawn = roundOne.matches[0].player1Id;
  expect((await command(page.request, id, "withdraw_entrant", { entrantId: withdrawn })).ok()).toBe(true);
  expect((await command(page.request, id, "generate_round")).ok()).toBe(true);
  expect((await read()).round?.number).toBe(1);
  current = await snapshot(page.request, id);
  const draft = current.rounds.find(round => round.status === "draft")!;
  expect(draft.matches.every(match => match.player1Id !== withdrawn && match.player2Id !== withdrawn)).toBe(true);
  expect((await command(page.request, id, "publish_round", { roundId: draft.id })).ok()).toBe(true);
  await expect.poll(async () => tv.locator("[data-tournament-display]").innerText(), { timeout: 10_000 }).toMatch(/Round 2/);
  const second = await read();
  expect(second.round?.totalMatches).toBe(8);
  expect(second.round?.byes).toHaveLength(1);
  await expect(tv.getByRole("complementary", { name: "Byes" })).toContainText("1 point");
  expect(second.standings.find(row => row.entrantId === withdrawn)).toMatchObject({ active: false, matchPoints: 1 });
  await expect(tv.getByRole("table", { name: "Tournament standings", exact: true }).locator("tbody tr")).toHaveCount(18);
  await fit(tv, "04-departure-and-bye", info.project.name);
  current = await snapshot(page.request, id);
  for (const match of current.rounds.find(round => round.number === 2)!.matches.filter(match => match.player2Id)) {
    const response = await command(page.request, id, "finalize_result", { matchId: match.id, expectedRevision: match.revision, kind: "played", raw1: 390, raw2: 390, overtime1: 0, overtime2: 0, reason: "Display acceptance draw" });
    expect(response.ok(), await response.text()).toBe(true);
  }
  expect((await command(page.request, id, "finish_tournament")).ok()).toBe(true);
  await expect(tv.getByRole("heading", { name: "Final standings", exact: true })).toBeVisible({ timeout: 10_000 });
  await fit(tv, "05-final-standings", info.project.name);
  expect((await read()).standings.find(row => row.entrantId === withdrawn)?.matchPoints).toBe(1);
  expect((await snapshot(page.request, id)).rounds[0].matches).toHaveLength(9);
  expect((await command(page.request, id, "archive_tournament")).ok()).toBe(true);
  await expect(tv.getByText(/archived/i).first()).toBeVisible({ timeout: 10_000 });
  await fit(tv, "06-archived", info.project.name);
  expect((await command(page.request, id, "restore_tournament")).ok()).toBe(true);
  expect((await command(page.request, id, "reset_tournament", { confirmationName: current.tournament.name })).ok()).toBe(true);
  await expect(tv.getByText(/Tournament not yet available/i)).toBeVisible({ timeout: 10_000 });
  await expect(tv.getByText(names[0], { exact: true })).toHaveCount(0);
  await context.close();
});

function fixture(count = 18, longNames = false): TournamentDisplay {
  const standings = Array.from({ length: count }, (_, index) => ({ entrantId: `entrant-${index}`, name: longNames ? `${String(index).padStart(3, "0")} ${"Alexandria ".repeat(7)}`.trim().slice(0, 80) : names[index] ?? `Player ${index + 1}`, rank: index + 1, matchPoints: 0, difference: 0, wins: 0, draws: 0, losses: 0, played: 0, active: true }));
  return { revision: `fixture-${count}`, serverNowMs: Date.now(), clockStatusAvailable: true, tournament: { id: "display-fixture", slug: "display-fixture", name: "Autumn Crossplay Open", status: "active", roundCount: 5, currentRound: 1, runGeneration: 0 }, standings, latestResult: null,
    round: { number: 1, totalMatches: count / 2, finalMatches: 0, byes: [], matches: Array.from({ length: count / 2 }, (_, index) => ({ id: `match-${index}`, roundNumber: 1, tableNumber: index + 1, queueOrder: 1, player1: { id: standings[index * 2].entrantId, name: standings[index * 2].name }, player2: { id: standings[index * 2 + 1].entrantId, name: standings[index * 2 + 1].name }, kind: "played", status: "ready", result: null, completedAt: null })) } };
}

test("DISPLAY: public screen recovers from disconnect, private reset and new generation", async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  let data = fixture(), status = 200;
  const served: number[] = [];
  await page.route("**/api/tournaments/display-fixture/display", async route => { const responseStatus = status; served.push(responseStatus); await route.fulfill({ status: responseStatus, json: responseStatus === 200 ? { ...data, serverNowMs: Date.now() } : { error: "Unavailable" } }); });
  await page.goto("/t/display-fixture/display");
  await expect(page.getByRole("article", { name: /^Table \d+$/ })).toHaveCount(9);
  await page.clock.install();
  status = 503;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.clock.runFor(100);
  await expect.poll(() => served).toContain(503);
  await page.clock.fastForward(16_000);
  await expect(page.getByText(/Connection lost|last updated/i).first()).toBeVisible();
  await expect(page.getByRole("article", { name: /^Table \d+$/ })).toHaveCount(9);
  await fit(page, "07-connection-lost", info.project.name);
  status = 404;
  await page.getByRole("button", { name: "Retry now", exact: true }).click();
  await page.clock.runFor(100);
  await expect(page.getByText(/Tournament not yet available/i)).toBeVisible();
  await expect(page.getByRole("table", { name: "Tournament standings", exact: true })).toHaveCount(0);
  data = fixture(2); data.tournament.runGeneration = 1; data.tournament.name = "New event run"; status = 200;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("heading", { name: "New event run", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: /^Table \d+$/ })).toHaveCount(1);
  await fit(page, "08-reconnected-generation", info.project.name);
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error("Unsupported")); });
  await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
  await expect(page.getByText("Fullscreen is unavailable. The display still works in this window.")).toBeVisible();
  expect(served).toEqual(expect.arrayContaining([200, 503, 404]));
});

test("DISPLAY: large rosters, long names and smaller screens keep every page reachable", async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const data = fixture(256, true);
  await page.route("**/api/tournaments/display-fixture/display", route => route.fulfill({ json: data }));
  await page.goto("/t/display-fixture/display");
  await expect(page.getByRole("article", { name: "Table 1", exact: true })).toBeVisible();
  await fit(page, "09-large-long-roster", info.project.name);
  await page.getByRole("button", { name: "Pause tables rotation", exact: true }).click();
  await page.getByRole("button", { name: "Pause standings rotation", exact: true }).click();
  const tablePages = Number((await page.getByRole("navigation", { name: "Tables pages", exact: true }).innerText()).match(/\d+\s*\/\s*(\d+)/)![1]);
  const standingPages = Number((await page.getByRole("navigation", { name: "Standings pages", exact: true }).innerText()).match(/\d+\s*\/\s*(\d+)/)![1]);
  const tableNumbers = new Set<string>(), playerNames = new Set<string>();
  for (let index = 0; index < Math.max(tablePages, standingPages); index++) {
    if (index < tablePages) {
      for (const label of await page.getByRole("article", { name: /^Table \d+$/ }).evaluateAll(elements => elements.map(el => el.getAttribute("aria-label")!))) tableNumbers.add(label);
      await page.getByRole("button", { name: "Next tables page", exact: true }).click();
    }
    if (index < standingPages) {
      for (const name of await page.getByRole("table", { name: "Tournament standings", exact: true }).locator("tbody tr td:nth-child(2)").allTextContents()) playerNames.add(name);
      await page.getByRole("button", { name: "Next standings page", exact: true }).click();
    }
  }
  expect(tableNumbers.size).toBe(128);
  expect(playerNames.size).toBe(256);
  await page.setViewportSize({ width: 1366, height: 768 });
  await fit(page, "10-smaller-display", info.project.name);
});
