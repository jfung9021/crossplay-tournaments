import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { MatchClockSnapshot } from "../../../src/client/match-clock-api";
import { baseURL, command, createSimpleTournament, evidencePath, fillScore, login, matchCard, openMatchFromCard, origin, publishNext, snapshot, writeEvidence } from "../../support/swiss20-browser";

async function saveSettings(page: Page) {
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved.");
}

async function copySettings(page: Page, id: string, name: string) {
  await page.goto(`/admin/tournaments/${id}/settings`);
  await page.getByRole("link", { name: "Copy settings", exact: true }).click();
  await page.getByLabel("Tournament name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create tournament", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/tournaments\/[^/]+\/settings$/);
  return new URL(page.url()).pathname.split("/")[3]!;
}

async function readClock(request: APIRequestContext, matchId: string): Promise<MatchClockSnapshot> {
  const response = await request.get(`${baseURL}/api/matches/${matchId}/clock`);
  expect(response.status()).toBe(200);
  return response.json() as Promise<MatchClockSnapshot>;
}

async function seedPreciseTime(page: Page, matchId: string, usedMs: [number, number]) {
  const before = await readClock(page.request, matchId);
  const response = await page.request.post(`${baseURL}/api/matches/${matchId}/clock`, {
    headers: { Origin: origin },
    data: { command: "correct_clock", payload: { usedMs, activeSide: before.state!.activeSide, reason: "Synthetic precise timing fixture for UI acceptance." }, expectedClockVersion: before.state!.version, requestId: randomUUID() },
  });
  expect(response.status()).toBe(200);
  const seeded = await response.json() as MatchClockSnapshot;
  expect(seeded.state?.usedMs).toEqual(usedMs);
  return seeded;
}

async function capture(page: Page, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "The viewport has no horizontal overflow").toBe(true);
  await page.screenshot({ path: evidencePath("ui-workflow", name), fullPage: true });
}

async function expectStandingsFirst(page: Page) {
  await expect(page.getByRole("heading", { name: "Final standings", exact: true })).toBeVisible();
  await expect(page.locator(".match")).toHaveCount(1);
  expect(await page.locator("#standings").evaluate(element => {
    const match = document.querySelector(".match");
    return !!match && !!(element.compareDocumentPosition(match) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), "Final standings precede the match cards in document order").toBe(true);
}

test("UI-WORKFLOW: duration settings retain exact values, explicit modes, copies and publication locks", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/tournaments/new");
  await page.getByLabel("Tournament name", { exact: true }).fill("Duration settings acceptance");
  await page.getByLabel("Rounds", { exact: true }).fill("1");
  const duration = page.getByLabel("Time per player (m:ss)", { exact: true });
  await expect(page.getByLabel("Timer", { exact: true })).toHaveValue("app");
  await expect(duration).toHaveValue("20:00");
  await expect(page.getByLabel("For every (m:ss)", { exact: true })).toHaveValue("0:10");
  for (const invalid of ["", "9:60"]) {
    await duration.fill(invalid);
    await duration.blur();
    expect(await duration.evaluate(input => (input as HTMLInputElement).checkValidity())).toBe(false);
    const create = page.getByRole("button", { name: "Create tournament", exact: true });
    if (await create.isEnabled()) await create.click();
    await expect(page).toHaveURL(`${baseURL}/admin/tournaments/new`);
    await expect(page.getByLabel("Timer", { exact: true })).toHaveValue("app");
  }
  await duration.fill("09:24");
  await duration.blur();
  await expect(duration).toHaveValue("9:24");
  await capture(page, "phone-new-settings.png");
  await page.getByRole("button", { name: "Create tournament", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/tournaments\/[^/]+\/players$/);
  const id = new URL(page.url()).pathname.split("/")[3]!;
  await page.getByLabel("Player names", { exact: true }).fill("Maya Chen\nOwen Brooks");
  await page.getByRole("button", { name: "Add players", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("players added");
  const initial = await snapshot(page.request, id);
  expect(initial.tournament.config).toMatchObject({ timeLimitSeconds: 564, penaltyIntervalSeconds: 10, penaltyPoints: 2 });

  await page.goto(`/admin/tournaments/${id}/settings`);
  await expect(duration).toHaveValue("9:24");
  await page.getByLabel("Timer", { exact: true }).selectOption("external");
  await expect(duration).toHaveCount(0);
  await page.getByLabel("Timer", { exact: true }).selectOption("app");
  await expect(duration).toHaveValue("9:24");
  await saveSettings(page);
  await page.reload();
  await expect(duration).toHaveValue("9:24");
  const appCopyId = await copySettings(page, id, "Exact app timer settings copy");
  const appCopy = await snapshot(page.request, appCopyId);
  expect(appCopy.tournament.config).toEqual(initial.tournament.config);
  expect(appCopy.entrants).toEqual([]);
  expect(appCopy.rounds).toEqual([]);
  await expect(page.getByLabel("Timer", { exact: true })).toHaveValue("app");
  await expect(duration).toHaveValue("9:24");

  await page.goto(`/admin/tournaments/${id}/settings`);
  await page.getByLabel("Timer", { exact: true }).selectOption("external");
  await saveSettings(page);
  expect((await snapshot(page.request, id)).tournament.config.timeLimitSeconds).toBeNull();
  const externalCopyId = await copySettings(page, id, "Exact external timer settings copy");
  expect((await snapshot(page.request, externalCopyId)).tournament.config.timeLimitSeconds).toBeNull();
  await expect(page.getByLabel("Timer", { exact: true })).toHaveValue("external");
  await expect(duration).toHaveCount(0);
  await page.goto(`/admin/tournaments/${id}/settings`);
  await page.getByLabel("Timer", { exact: true }).selectOption("app");
  await expect(duration).toHaveValue("20:00");
  await duration.fill("9:24");
  await saveSettings(page);
  const published = await publishNext(page, id, 1);
  await page.goto(`/admin/tournaments/${id}/settings`);
  await expect(page.getByLabel("Timer", { exact: true })).toBeDisabled();
  await expect(duration).toBeDisabled();
  await expect(page.getByLabel("For every (m:ss)", { exact: true })).toBeDisabled();
  await page.getByLabel("Tournament name", { exact: true }).fill("Duration settings acceptance — renamed");
  await saveSettings(page);
  expect((await snapshot(page.request, id)).tournament.config).toEqual(published.tournament.config);
  const blocked = await command(page.request, id, "update_settings", { name: "Forbidden mode change", date: null, config: { ...published.tournament.config, timeLimitSeconds: null } });
  expect([400, 409]).toContain(blocked.status());
  await page.setViewportSize({ width: 820, height: 1180 });
  await capture(page, "ipad-locked-settings.png");
  await page.goto(`/t/${published.tournament.slug}/rules`);
  await expect(page.getByText("9:24 per player · App timer", { exact: true })).toBeVisible();
  await expect(page.locator(".rules-list")).toContainText("0:10");
  await expect(page.locator(".rules-list")).toContainText("Start Timer");
  await expect(page.locator(".rules-list")).not.toContainText("seconds");
  await capture(page, "ipad-app-rules.png");
  writeEvidence("ui-workflow/settings.json", { status: "PASS", tournamentId: id, initialConfig: initial.tournament.config, appCopyId, externalCopyId, lockedConfig: (await snapshot(page.request, id)).tournament.config, rejectedChangeStatus: blocked.status() });
});

test("UI-WORKFLOW: optional access, external reporting and final standings work on the ordinary tournament page", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createSimpleTournament(page, "External timer table workflow", "Priya Marsh\nSamira Holt", 1);
  const roster = await snapshot(page.request, id);
  const access = page.locator("details").filter({ has: page.locator("summary", { hasText: "Individual player access" }) });
  await expect(access).not.toHaveAttribute("open", "");
  await expect(page.locator(".roster-row").getByRole("button", { name: /player link/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create or replace player link", exact: true })).toBeHidden();
  await access.locator("summary").click();
  await access.getByLabel("Player", { exact: true }).selectOption(roster.entrants[0].id);
  await access.getByRole("button", { name: "Create or replace player link", exact: true }).click();
  const invitation = access.getByLabel(`Private player link for ${roster.entrants[0].name}`, { exact: true });
  await expect(invitation).toBeVisible();
  await expect(invitation).not.toHaveValue("");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await access.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(access.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await access.getByLabel("Player", { exact: true }).selectOption(roster.entrants[1].id);
  await expect(access.getByLabel(/Private player link/)).toHaveCount(0);
  await expect(access.getByRole("button", { name: "Copied", exact: true })).toHaveCount(0);
  await capture(page, "phone-optional-access.png");

  await page.goto(`/admin/tournaments/${id}/settings`);
  await page.getByLabel("Timer", { exact: true }).selectOption("external");
  await saveSettings(page);
  const tournament = await publishNext(page, id, 1);
  const match = tournament.rounds[0].matches[0];
  await page.goto(`/t/${tournament.tournament.slug}/rules`);
  await expect(page.locator(".rules-list")).toContainText(/external timer/i);
  await expect(page.locator(".rules-list")).not.toContainText("seconds");
  await page.goto(`/t/${tournament.tournament.slug}`);
  const card = matchCard(page, tournament, match);
  await expect(card.getByRole("button", { name: "Start Match", exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: "Report result", exact: true }).click();
  await fillScore(card, 401, 399, 20, 0);
  await expect(card.getByLabel("Overtime (m:ss)", { exact: true }).first()).toHaveValue("0:20");
  await expect(card.getByText("Final result:")).toContainText("397–399");
  await capture(page, "phone-external-score-entry.png");
  await card.getByRole("button", { name: "Save result", exact: true }).click();
  await expect.poll(async () => (await snapshot(page.request, id)).rounds[0].matches[0].status).toBe("final");
  const scored = await snapshot(page.request, id);
  expect(scored.rounds[0].matches[0].result).toMatchObject({ raw1: 401, raw2: 399, overtime1: 20, overtime2: 0, adjusted1: 397, adjusted2: 399, difference1: -2 });
  await expect(card).toContainText("0:20 overtime");
  await expect(card).not.toContainText("−0 points");
  await page.goto(`/admin/tournaments/${id}`);
  await page.getByRole("button", { name: "Finish tournament", exact: true }).click();
  await expectStandingsFirst(page);
  const finished = await snapshot(page.request, id);
  expect(finished.standings).toEqual(scored.standings);
  await page.goto(`/t/${tournament.tournament.slug}`);
  await expectStandingsFirst(page);
  await capture(page, "phone-final-standings.png");
  await page.goto(`/admin/tournaments/${id}`);
  await page.getByRole("button", { name: "Archive tournament", exact: true }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await expectStandingsFirst(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto(`/t/${tournament.tournament.slug}`);
  await expectStandingsFirst(page);
  await capture(page, "ipad-archived-standings.png");
  const archived = await snapshot(page.request, id);
  expect(archived.tournament.status).toBe("archived");
  expect(archived.standings).toEqual(scored.standings);
  writeEvidence("ui-workflow/external-reporting.json", { status: "PASS", tournamentId: id, optionalAccessHiddenInitially: true, selectedPlayerLinkCleared: true, copyWorked: true, result: scored.rounds[0].matches[0].result, finalStandings: archived.standings, finalAndArchivedStandingsFirst: true });
});

test("UI-WORKFLOW: organizer duration corrections preserve untouched milliseconds and penalty summaries stay compact", async ({ page }) => {
  await login(page);
  const id = await createSimpleTournament(page, "Precise clock correction workflow", "Alex Rowan\nMorgan Vale", 1);
  const tournament = await publishNext(page, id, 1);
  const match = tournament.rounds[0].matches[0];
  await page.setViewportSize({ width: 390, height: 844 });
  await openMatchFromCard(page, id, match.id);
  await page.getByRole("button", { name: "Start Timer", exact: true }).click();
  await page.getByRole("button", { name: "End game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Report scores", exact: true })).toBeVisible();
  await expect.poll(async () => (await readClock(page.request, match.id)).state?.status).toBe("ended");
  const report = page.getByRole("region", { name: "Match scores", exact: true });
  await expect(report).not.toContainText("overtime");
  await expect(report).not.toContainText("−0 points");
  const seeded = await seedPreciseTime(page, match.id, [1_209_999, 864_123]);
  await page.reload();
  await expect(report).toContainText("0:09 overtime");
  await expect(report).not.toContainText("−0 points");
  await capture(page, "phone-overtime-without-deduction.png");

  await page.goto(`/admin/tournaments/${id}`);
  const card = matchCard(page, tournament, match);
  await card.locator("summary", { hasText: "Organizer actions" }).click();
  await card.getByRole("combobox", { name: "Action", exact: true }).selectOption("correct_clock");
  const [first, second] = seeded.players;
  await expect(card.getByLabel(`${first.name}: time used (m:ss)`, { exact: true })).toHaveValue("20:09");
  await expect(card.getByLabel(`${second.name}: time used (m:ss)`, { exact: true })).toHaveValue("14:24");
  await card.getByLabel(`${second.name}: time used (m:ss)`, { exact: true }).focus();
  await card.getByLabel(`${second.name}: time used (m:ss)`, { exact: true }).blur();
  await card.getByLabel(`${first.name}: time used (m:ss)`, { exact: true }).fill("20:10");
  await card.getByLabel("Reason", { exact: true }).fill("Correct only the first player's elapsed time.");
  await page.setViewportSize({ width: 1180, height: 820 });
  await capture(page, "ipad-organizer-duration-correction.png");
  await card.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(card.getByRole("status")).toHaveText("Saved.");
  const corrected = await readClock(page.request, match.id);
  expect(corrected.state?.usedMs).toEqual([1_210_000, 864_123]);
  await page.goto(`/match/${match.id}`);
  await page.getByLabel(`${first.name} game score`, { exact: true }).fill("401");
  await page.getByLabel(`${second.name} game score`, { exact: true }).fill("399");
  await page.getByRole("button", { name: "Review scores", exact: true }).click();
  await expect(report).toContainText("0:10 overtime");
  await expect(report).toContainText("401 game score · −2 points");
  await expect(report).not.toContainText("−0 points");
  await capture(page, "ipad-score-review-deduction.png");
  await page.getByRole("button", { name: `${first.name}: agree`, exact: true }).click();
  await page.getByRole("button", { name: `${second.name}: agree`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Match complete", exact: true })).toBeVisible();
  const official = await readClock(page.request, match.id);
  expect(official.result).toMatchObject({ adjusted1: 399, adjusted2: 399, overtime1: 10, overtime2: 0 });

  const zeroId = await createSimpleTournament(page, "Zero deduction presentation", "Elena Park\nNoah Rivera", 1, 0);
  const zeroTournament = await publishNext(page, zeroId, 1);
  const zeroMatch = zeroTournament.rounds[0].matches[0];
  await openMatchFromCard(page, zeroId, zeroMatch.id);
  await page.getByRole("button", { name: "Start Timer", exact: true }).click();
  await page.getByRole("button", { name: "End game", exact: true }).click();
  await expect.poll(async () => (await readClock(page.request, zeroMatch.id)).state?.status).toBe("ended");
  const zero = await seedPreciseTime(page, zeroMatch.id, [1_230_000, 1_100_000]);
  await page.reload();
  await expect(report).toContainText("0:30 overtime");
  await expect(report).not.toContainText("−0 points");
  await page.getByLabel(`${zero.players[0].name} game score`, { exact: true }).fill("401");
  await page.getByLabel(`${zero.players[1].name} game score`, { exact: true }).fill("399");
  await page.getByRole("button", { name: "Review scores", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review scores", exact: true })).toBeVisible();
  const zeroReport = await readClock(page.request, zeroMatch.id);
  expect(zeroReport.report).toMatchObject({ raw1: 401, raw2: 399, overtime1: 30, adjusted1: 401, adjusted2: 399 });
  await expect(report).toContainText("0:30 overtime");
  await expect(report).not.toContainText("−0 points");
  writeEvidence("ui-workflow/precise-corrections.json", { status: "PASS", tournamentId: id, seededUsedMs: seeded.state?.usedMs, correctedUsedMs: corrected.state?.usedMs, untouchedMillisecondsRetained: true, officialResult: official.result, zeroPenaltyTournamentId: zeroId, zeroPenaltyReport: zeroReport.report });
});
