import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { MatchClockSnapshot } from "../../../src/client/match-clock-api";
import { assertStandings, calculateStandings, pairingEvidence, type Fixture, type ReferenceMatch } from "../../support/swiss-reference";
import { baseURL, origin, login, publishNext, snapshot, writeEvidence, evidencePath, createSimpleTournament } from "../../support/swiss20-browser";
import { restartLocalApp } from "../../support/local-environment";

async function clockRead(request: APIRequestContext, matchId: string): Promise<MatchClockSnapshot> {
  const response = await request.get(`${baseURL}/api/matches/${matchId}/clock`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function clockCommand(request: APIRequestContext, matchId: string, name: string, payload: Record<string, unknown> = {}, expectedClockVersion?: number) {
  return request.post(`${baseURL}/api/matches/${matchId}/clock`, { headers: { Origin: origin }, data: { command: name, payload, requestId: randomUUID(), expectedClockVersion } });
}
async function issue(request: APIRequestContext, matchId: string) {
  const response = await clockCommand(request, matchId, "issue_match_link");
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json() as { inviteUrl: string }).inviteUrl;
}
async function openMatch(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Start clock", exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
}
async function frozenPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const time = new Date();
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  return { context, page };
}
async function endAndReport(page: Page, raw1: number, raw2: number, names: [string, string]) {
  await page.getByRole("button", { name: "End game", exact: true }).click();
  await page.getByLabel(`${names[0]} game score`, { exact: true }).fill(String(raw1));
  await page.getByLabel(`${names[1]} game score`, { exact: true }).fill(String(raw2));
  await page.getByRole("button", { name: "Review scores", exact: true }).click();
  await page.getByRole("button", { name: `${names[0]}: agree`, exact: true }).click();
  await page.getByRole("button", { name: `${names[1]}: agree`, exact: true }).click();
  await expect(page.getByText("Match complete", { exact: true })).toBeVisible();
}

test("20 players complete six rounds through ten shared clocks with independent standings and starter evidence", async ({ page, browser }, testInfo) => {
  const fixture = JSON.parse(readFileSync(resolve("tests/fixtures/swiss20/tiebreak-witnesses-v1.json"), "utf8")) as Fixture;
  const config = { ...fixture.config, timeLimitSeconds: 1200 };
  await login(page);
  const created = await page.request.post(`${baseURL}/api/tournaments`, { headers: { Origin: origin }, data: { name: `${fixture.title} clocks`, config, requestId: fixture.createRequestId } });
  expect(created.status(), await created.text()).toBe(201);
  const { id } = await created.json() as { id: string };
  const initial = await snapshot(page.request, id);
  const roster = await page.request.post(`${baseURL}/api/tournaments/${id}/commands`, { headers: { Origin: origin }, data: { command: "add_entrants", payload: { names: fixture.players.map(player => player.name).join("\n") }, requestId: fixture.rosterRequestId, expectedVersion: initial.tournament.version } });
  expect(roster.status(), await roster.text()).toBe(200);
  const tables = await Promise.all(Array.from({ length: 10 }, () => frozenPage(browser)));
  const counts = new Map(fixture.players.map(player => [player.id, { firsts: 0, seconds: 0 }]));
  const ledger: ReferenceMatch[] = [];
  const timing: unknown[] = [];
  try {
    for (const round of fixture.rounds) {
      await testInfo.attach(`round-${round.number}`, { body: `Clock event: round ${round.number}/6`, contentType: "text/plain" });
      const published = await publishNext(page, id, round.number);
      const matches = published.rounds[round.number - 1]!.matches;
      expect(matches.map(m => [m.player1Id, m.player2Id])).toEqual(round.matches.map(m => [m.player1Id, m.player2Id]));
      const proof = pairingEvidence(fixture.players, fixture.rounds.slice(0, round.number - 1), matches, config);
      const links = await Promise.all(matches.map(match => issue(page.request, match.id)));
      await Promise.all(tables.map((table, index) => openMatch(table.page, links[index]!)));
      const ready = await Promise.all(tables.map((table, index) => clockRead(table.page.request, matches[index]!.id)));
      for (const [index, state] of ready.entries()) {
        const match = matches[index]!;
        const a = counts.get(match.player1Id)!; const b = counts.get(match.player2Id!)!;
        expect(state.start!.counts).toEqual({ firsts1: a.firsts, seconds1: a.seconds, firsts2: b.firsts, seconds2: b.seconds });
        if (a.firsts !== b.firsts) {
          expect(state.start!.side).toBe(a.firsts < b.firsts ? 1 : 2);
          expect(state.start!.method).toBe("fewer_firsts");
        } else if (a.seconds !== b.seconds) {
          expect(state.start!.side).toBe(a.seconds > b.seconds ? 1 : 2);
          expect(state.start!.method).toBe("more_seconds");
        } else {
          expect(state.start!.method).toBe("random");
          expect([1, 2]).toContain(state.start!.side);
        }
        expect(state.state!.usedMs).toEqual([0, 0]);
        expect(state.state!.status).toBe("ready");
      }
      // Ten tables switch concurrently under the real production shared-IP limiter.
      await Promise.all(tables.map(async (table, index) => {
        const match = matches[index]!; const expected = round.matches[index]!; const start = ready[index]!;
        const durations: [number, number] = [expected.overtime1 ? 1_200_000 + expected.overtime1 * 1000 : 1_110_000, expected.overtime2 ? 1_200_000 + expected.overtime2 * 1000 : 1_070_000];
        await table.page.getByRole("button", { name: "Start clock", exact: true }).click();
        await table.page.clock.fastForward(durations[start.start!.side - 1]!);
        await table.page.locator(`[data-side="${start.start!.side}"]`).click();
        await table.page.clock.fastForward(durations[2 - start.start!.side]!);
        await endAndReport(table.page, expected.raw1, expected.raw2, [start.players[0].name, start.players[1].name]);
        const ended = await clockRead(table.page.request, match.id);
        expect(ended.state!.usedMs).toEqual(durations);
        expect(ended.report!.overtime1).toBe(expected.overtime1);
        expect(ended.report!.overtime2).toBe(expected.overtime2);
        expect(ended.report!.confirmationMethod).toBe("shared_device");
        expect(ended.report!.acknowledgedSides).toEqual([1, 2]);
        expect(ended.matchStatus).toBe("final");
        expect(ended.start).toEqual({ ...start.start, played: true });
        timing.push({ roundNumber: round.number, matchId: match.id, starter: ended.start, usedMs: ended.state!.usedMs, report: ended.report });
      }));
      for (const [index, state] of ready.entries()) {
        const match = matches[index]!; const a = counts.get(match.player1Id)!; const b = counts.get(match.player2Id!)!;
        if (state.start!.side === 1) { a.firsts++; b.seconds++; } else { b.firsts++; a.seconds++; }
      }
      ledger.push(...round.matches);
      const current = await snapshot(page.request, id);
      const expected = calculateStandings(fixture.players, ledger, config);
      assertStandings(current.standings, expected);
      assertStandings(current.standings, round.expectedStandings);
      const publicModel = await snapshot(tables[0]!.page.request, id);
      assertStandings(publicModel.standings, expected);
      expect(JSON.stringify(publicModel)).not.toMatch(/matchSessionHash|inviteHash|controllerId|clock_events/);
      writeEvidence(`round-${round.number}.json`, { proof, expected, actual: current.standings, counts: Object.fromEntries(counts), timing: timing.filter((entry) => (entry as { roundNumber: number }).roundNumber === round.number) });
    }
    expect(ledger).toHaveLength(60);
    expect((await snapshot(page.request, id)).standings.reduce((sum, row) => sum + row.matchPoints, 0)).toBe(60);
    await restartLocalApp();
    assertStandings((await snapshot(page.request, id)).standings, fixture.expectedStandings);
    await page.goto(`/t/${(await snapshot(page.request, id)).tournament.slug}`);
    await page.screenshot({ path: evidencePath("final-standings.png"), fullPage: true });
    writeEvidence("clock-20x6.json", { status: "PASS", matches: 60, tables: 10, rounds: 6, counts: Object.fromEntries(counts), tiebreakWitnesses: fixture.witnesses, timing, physicalSafari: "PENDING" });
  } finally { await Promise.all(tables.map(table => table.context.close())); }
});

test("phone and iPad layouts, overtime reversal, offline ending and frozen reporting", async ({ page, browser }) => {
  await login(page);
  const id = await createSimpleTournament(page, `Clock controls ${randomUUID().slice(0, 8)}`, "Alex Rowan\nMorgan Vale\nPriya Marsh\nSamira Holt", 2);
  const current = await publishNext(page, id, 1);
  expect(current.tournament.config.timeLimitSeconds).toBe(1200);
  const match = current.rounds[0]!.matches[0]!;
  const { context, page: phone } = await frozenPage(browser);
  try {
    await openMatch(phone, await issue(page.request, match.id));
    const ready = await clockRead(phone.request, match.id);
    const screens = [[320, 568], [375, 667], [390, 844], [844, 390], [768, 1024], [1024, 768], [820, 1180], [1180, 820], [507, 768]];
    for (const [width, height] of screens) {
      await phone.setViewportSize({ width: width!, height: height! });
      await expect(phone.getByRole("button", { name: "Start clock", exact: true })).toBeVisible();
      const layout = await phone.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight }));
      expect(layout.width).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.height).toBeLessThanOrEqual(layout.viewportHeight + 1);
      await phone.screenshot({ path: evidencePath(`layout-${width}x${height}.png`) });
    }
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.getByRole("button", { name: "Start clock", exact: true }).click();
    const durations = [1_220_000, 1_190_000];
    await phone.clock.fastForward(durations[ready.start!.side - 1]!);
    await phone.locator(`[data-side="${ready.start!.side}"]`).click();
    await phone.clock.fastForward(durations[2 - ready.start!.side]!);
    await context.setOffline(true);
    await phone.getByRole("button", { name: "End game", exact: true }).click();
    await phone.clock.fastForward(60_000);
    await expect(phone.getByRole("button", { name: "Review scores", exact: true })).toBeDisabled();
    await phone.getByLabel(`${ready.players[0].name} game score`, { exact: true }).fill("401");
    await phone.getByLabel(`${ready.players[1].name} game score`, { exact: true }).fill("399");
    await context.setOffline(false);
    await expect(phone.getByRole("button", { name: "Review scores", exact: true })).toBeEnabled();
    await phone.getByRole("button", { name: "Review scores", exact: true }).click();
    await expect(phone.getByRole("heading", { name: "Review scores", exact: true })).toBeVisible();
    const report = await clockRead(phone.request, match.id);
    expect(report.state!.usedMs).toEqual(durations);
    expect(report.report).toMatchObject({ raw1: 401, raw2: 399, overtime1: 20, overtime2: 0, adjusted1: 397, adjusted2: 399 });
    await phone.screenshot({ path: evidencePath("overtime-score-review.png"), fullPage: true });
    await phone.getByRole("button", { name: `${ready.players[0].name}: agree`, exact: true }).click();
    await phone.getByRole("button", { name: `${ready.players[1].name}: agree`, exact: true }).click();
    await expect(phone.getByText("Match complete", { exact: true })).toBeVisible();
    const final = await snapshot(page.request, id);
    expect(final.standings.find(player => player.entrantId === match.player1Id)!.difference).toBe(-2);
    expect(final.standings.find(player => player.entrantId === match.player2Id)!.difference).toBe(2);
    writeEvidence("overtime-reversal.json", { report, standings: final.standings, usedMs: durations, offlineEnd: true });
  } finally { await context.close(); }
});
