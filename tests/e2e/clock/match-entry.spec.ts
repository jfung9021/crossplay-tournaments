import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { MatchClockSnapshot } from "../../../src/client/match-clock-api";
import { baseURL, command, createSimpleTournament, evidencePath, login, matchCard, origin, playerSession, publishNext, snapshot, writeEvidence } from "../../support/swiss20-browser";

test("MATCH-ENTRY: admin opens from the match card and returns to its clock and score review", async ({ page: admin, browser }) => {
  await login(admin);
  const id = await createSimpleTournament(admin, "Match entry acceptance", "Alex Rowan\nMorgan Vale\nPriya Marsh\nSamira Holt", 1);
  const tournament = await publishNext(admin, id, 1);
  const match = tournament.rounds[0].matches[0];
  const player = await playerSession(browser, admin, id, match.player1Id);
  const spectator = await browser.newContext({ baseURL });
  try {
    const endpoint = `${baseURL}/api/matches/${match.id}/open`;
    const data = { requestId: randomUUID(), controllerId: randomUUID() };
    const denied = await spectator.request.post(endpoint, { headers: { Origin: origin }, data });
    expect(denied.status()).toBe(403);
    const participant = await player.page.request.post(endpoint, { headers: { Origin: origin }, data });
    expect(participant.status()).toBe(403);
    const forged = await admin.request.post(endpoint, { headers: { Origin: origin }, data: { ...data, sessionHash: "a".repeat(64) } });
    expect(forged.status()).toBe(400);
    const oldClaim = await spectator.request.post(`/api/matches/${match.id}/claim`, { headers: { Origin: origin }, data: { token: "a".repeat(43), requestId: randomUUID() } });
    expect(oldClaim.status()).toBe(404);
    const oldIssue = await admin.request.post(`/api/matches/${match.id}/clock`, { headers: { Origin: origin }, data: { command: "issue_match_link", payload: {}, requestId: randomUUID() } });
    expect(oldIssue.status()).toBe(400);
    await admin.goto(`/t/${tournament.tournament.slug}`);
    await admin.setViewportSize({ width: 390, height: 844 });
    await expect(admin.getByRole("button", { name: "Create shared match link", exact: true })).toHaveCount(0);
    await admin.screenshot({ path: evidencePath("match-entry", "public-match-cards.png"), fullPage: true });
    const card = () => matchCard(admin, tournament, match);
    await card().getByRole("button", { name: "Start Match", exact: true }).click();
    await expect(admin).toHaveURL(`${baseURL}/match/${match.id}`);
    await expect(admin.getByRole("button", { name: "Start Timer", exact: true })).toBeEnabled();
    await expect(admin.getByText("20:00", { exact: true })).toHaveCount(2);
    const readClock = async () => (await admin.request.get(`${baseURL}/api/matches/${match.id}/clock`)).json() as Promise<MatchClockSnapshot>;
    const ready = await readClock();
    await admin.waitForTimeout(400);
    expect((await readClock()).state?.usedMs).toEqual([0, 0]);
    expect(ready.state?.status).toBe("ready");
    expect(ready.start?.played).toBe(false);
    await admin.screenshot({ path: evidencePath("match-entry", "phone-ready.png"), fullPage: true });
    await admin.getByRole("link", { name: "Tournament", exact: true }).click();
    await card().getByRole("button", { name: "Start Match", exact: true }).click();
    await expect(admin.getByRole("button", { name: "Start Timer", exact: true })).toBeEnabled();
    await admin.getByRole("button", { name: "Start Timer", exact: true }).click();
    await expect.poll(async () => (await readClock()).state?.status).toBe("running");
    await admin.getByRole("link", { name: "Tournament", exact: true }).click();
    await card().getByRole("button", { name: "Continue match", exact: true }).click();
    await expect(admin.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
    await admin.getByRole("button", { name: "Pause", exact: true }).click();
    await expect.poll(async () => (await readClock()).state?.status).toBe("paused");
    const controller = (await readClock()).controllerId;
    await admin.getByRole("link", { name: "Tournament", exact: true }).click();
    await card().getByRole("button", { name: "Continue match", exact: true }).click();
    await expect(admin.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
    expect((await readClock()).controllerId).toBe(controller);
    await admin.getByRole("button", { name: "End game", exact: true }).click();
    await expect.poll(async () => (await readClock()).state?.status).toBe("ended");
    await admin.getByRole("link", { name: "Back to tournament", exact: true }).click();
    await card().getByRole("button", { name: "Report scores", exact: true }).click();
    await admin.getByLabel(`${ready.players[0].name} game score`, { exact: true }).fill("401");
    await admin.getByLabel(`${ready.players[1].name} game score`, { exact: true }).fill("399");
    await admin.getByRole("button", { name: "Review scores", exact: true }).click();
    await admin.getByRole("button", { name: `${ready.players[0].name}: agree`, exact: true }).click();
    await admin.getByRole("link", { name: "Back to tournament", exact: true }).click();
    await card().getByRole("button", { name: "Review scores", exact: true }).click();
    await expect(admin.getByRole("heading", { name: "Review scores", exact: true })).toBeVisible();
    await admin.getByRole("button", { name: `${ready.players[1].name}: agree`, exact: true }).click();
    await expect(admin.getByRole("heading", { name: "Match complete", exact: true })).toBeVisible();
    await admin.getByRole("link", { name: "Back to tournament", exact: true }).click();
    await expect(card().getByRole("button", { name: "Start Match", exact: true })).toHaveCount(0);
    const saved = await snapshot(admin.request, id);
    expect(saved.rounds[0].matches[0].status).toBe("final");
    expect(saved.rounds[0].matches[0].result).toMatchObject({ raw1: 401, raw2: 399, adjusted1: 401, adjusted2: 399 });
    writeEvidence("match-entry/result.json", { status: "PASS", organizerOpenedFromMatch: true, startsPaused: true, returnPreservesController: true, pendingReportReentry: true, noTimerInviteRequired: true, anonymousStatus: denied.status(), individualPlayerStatus: participant.status(), forgedSessionStatus: forged.status(), finalResult: saved.rounds[0].matches[0].result });
  } finally { await player.context.close(); await spectator.close(); }
});

test("MATCH-ENTRY: nine devices share one admin account with independent timers and safe same-match entry", async ({ page: admin, browser }) => {
  await login(admin);
  const fixture = JSON.parse(readFileSync("tests/fixtures/swiss20/tiebreak-witnesses-v1.json", "utf8")) as { players: { name: string }[] };
  const id = await createSimpleTournament(admin, "Nine admin devices", fixture.players.slice(0, 18).map(player => player.name).join("\n"), 1);
  const tournament = await publishNext(admin, id, 1);
  const devices = await Promise.all(Array.from({ length: 9 }, async () => {
    const context = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 } });
    const page = await context.newPage(); return { context, page };
  }));
  try {
    // Real independent sign-ins, paced with the suite to respect the 16/minute login limit.
    for (const device of devices) await login(device.page);
    await Promise.all(devices.map(async ({ page }, index) => {
      await page.goto(`/t/${tournament.tournament.slug}`);
      await page.getByLabel("Table", { exact: true }).selectOption(String(tournament.rounds[0].matches[index].tableNumber));
      await expect(page.getByRole("article")).toHaveCount(1);
      await matchCard(page, tournament, tournament.rounds[0].matches[index]).getByRole("button", { name: "Start Match", exact: true }).click();
      await expect(page.getByRole("button", { name: "Start Timer", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Start Timer", exact: true }).click();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await expect.poll(async () => {
        const response = await page.request.get(`/api/matches/${tournament.rounds[0].matches[index].id}/clock`);
        const saved = await response.json() as MatchClockSnapshot;
        return saved.state?.status === "paused" && saved.canControl;
      }).toBe(true);
    }));
    const states = await Promise.all(devices.map(async ({ page }, index) => {
      const response = await page.request.get(`/api/matches/${tournament.rounds[0].matches[index].id}/clock`);
      expect(response.status()).toBe(200); return response.json() as Promise<MatchClockSnapshot>;
    }));
    expect(new Set(states.map(value => value.controllerId)).size).toBe(9);
    expect(states.every(value => value.state?.status === "paused" && value.canControl)).toBe(true);
    await devices[0].page.screenshot({ path: evidencePath("match-entry", "ipad-paused.png"), fullPage: true });
    await Promise.all(devices.map(async ({ page }, index) => {
      await page.getByRole("link", { name: "Tournament", exact: true }).click();
      await expect(page.getByLabel("Table", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Table", { exact: true })).toHaveValue(String(tournament.rounds[0].matches[index].tableNumber));
      await expect(page.getByRole("article")).toHaveCount(1);
      await expect(matchCard(page, tournament, tournament.rounds[0].matches[index]).getByRole("button", { name: "Continue match", exact: true })).toBeVisible();
    }));
    await devices[0].page.screenshot({ path: evidencePath("match-entry", "ipad-selected-table.png"), fullPage: true });
    const firstMatch = tournament.rounds[0].matches[0];
    await admin.goto(`/admin/tournaments/${id}`);
    await expect(admin.getByRole("article")).toHaveCount(9);
    await matchCard(admin, tournament, firstMatch).getByRole("button", { name: "View match", exact: true }).click();
    await expect(admin.getByText("Read-only · Clock on another device", { exact: true })).toBeVisible();
    await expect(admin.getByRole("button", { name: "Resume", exact: true })).toBeDisabled();
    const retained = await devices[0].page.request.get(`/api/matches/${firstMatch.id}/clock`);
    expect((await retained.json() as MatchClockSnapshot).controllerId).toBe(states[0].controllerId);
    const raceId = await createSimpleTournament(admin, "Simultaneous match entry", "Maya Chen\nOwen Brooks", 1);
    const race = await publishNext(admin, raceId, 1);
    const path = `/api/matches/${race.rounds[0].matches[0].id}/open`;
    const requests = devices.slice(0, 2).map(() => ({ requestId: randomUUID(), controllerId: randomUUID() }));
    const responses = await Promise.all(devices.slice(0, 2).map(({ page }, index) => page.request.post(path, { headers: { Origin: origin }, data: requests[index] })));
    expect(responses.map(response => response.status())).toEqual([200, 200]);
    const opened = await Promise.all(responses.map(response => response.json() as Promise<MatchClockSnapshot>));
    expect(opened.filter(value => !value.isOrganizer)).toHaveLength(1);
    expect(new Set(opened.map(value => value.controllerId)).size).toBe(1);
    expect(opened.every(value => value.state?.status === "ready" && !value.state.reviewRequired)).toBe(true);
    const ownerIndex = opened.findIndex(value => !value.isOrganizer);
    await devices[ownerIndex].context.clearCookies({ name: `crossplay_match_${race.rounds[0].matches[0].id}` });
    const retried = await devices[ownerIndex].page.request.post(path, { headers: { Origin: origin }, data: requests[ownerIndex] });
    expect(retried.status()).toBe(200);
    expect(await retried.json()).toMatchObject({ isOrganizer: false, canControl: true, controllerId: opened[ownerIndex].controllerId });
    const recovered = await devices[ownerIndex].page.request.get(`/api/matches/${race.rounds[0].matches[0].id}/clock`);
    expect(await recovered.json()).toMatchObject({ isOrganizer: false, canControl: true });
    writeEvidence("match-entry/nine-devices.json", { status: "PASS", sameAdminAccount: true, devices: 9, distinctControllers: 9, independentRememberedTables: true, otherDeviceReadOnly: true, concurrentEntryOneController: true, lostResponseRetryRestoresAccess: true, states });
  } finally { await Promise.all(devices.map(device => device.context.close())); }
});

test("MATCH-TABLE: remembered physical tables follow new rounds, preserve history and handle unavailable storage", async ({ page: admin, browser }) => {
  await login(admin);
  const id = await createSimpleTournament(admin, "Remembered table acceptance", "Maya Chen\nOwen Brooks\nPriya Shah\nTheo Martin\nAmelia Brooks", 2);
  const first = await publishNext(admin, id, 1);
  const tableOne = first.rounds[0].matches.find(match => match.player2Id && match.tableNumber === 1)!;
  const tableTwo = first.rounds[0].matches.find(match => match.player2Id && match.tableNumber === 2)!;
  const secondContext = await browser.newContext({ baseURL, storageState: await admin.context().storageState() });
  const second = await secondContext.newPage();
  const unavailableContext = await browser.newContext({ baseURL, storageState: await admin.context().storageState() });
  await unavailableContext.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage unavailable", "SecurityError"); } });
  });
  const unavailable = await unavailableContext.newPage();
  try {
    await admin.goto(`/t/${first.tournament.slug}`);
    await expect(admin.getByRole("article")).toHaveCount(3);
    await expect(admin.getByRole("article").filter({ hasText: "Bye" })).toHaveCount(1);
    await admin.getByLabel("Table", { exact: true }).selectOption("1");
    await second.goto(`/t/${first.tournament.slug}`);
    await second.getByLabel("Table", { exact: true }).selectOption("2");
    await unavailable.goto(`/t/${first.tournament.slug}`);
    await unavailable.getByLabel("Table", { exact: true }).selectOption("1");
    await expect(unavailable.getByRole("article")).toHaveCount(1);
    await expect(matchCard(unavailable, first, tableOne)).toBeVisible();
    await unavailable.getByLabel("Table", { exact: true }).selectOption("all");
    await expect(unavailable.getByRole("article")).toHaveCount(3);

    for (const match of first.rounds[0].matches.filter(match => match.player2Id)) {
      const response = await command(admin.request, id, "finalize_result", { matchId: match.id, expectedRevision: match.revision, kind: "played", raw1: 401, raw2: 399, overtime1: 0, overtime2: 0 });
      expect(response.status()).toBe(200);
    }
    for (const entrantId of [tableTwo.player1Id, tableTwo.player2Id]) {
      expect((await command(admin.request, id, "withdraw_entrant", { entrantId })).status()).toBe(200);
    }
    const next = await publishNext(admin, id, 2);
    const nextTableOne = next.rounds[1].matches.find(match => match.player2Id && match.tableNumber === 1)!;
    expect(new Set([nextTableOne.player1Id, nextTableOne.player2Id])).not.toEqual(new Set([tableOne.player1Id, tableOne.player2Id]));
    await admin.goto(`/t/${first.tournament.slug}`);
    await expect(admin.getByLabel("Table", { exact: true })).toHaveValue("1");
    await expect(admin.getByRole("article")).toHaveCount(1);
    await expect(matchCard(admin, next, nextTableOne)).toBeVisible();
    await admin.goto(`/t/${first.tournament.slug}/rounds/1`);
    await expect(admin.getByRole("article")).toHaveCount(3);
    await expect(admin.getByLabel("Table", { exact: true })).toHaveCount(0);
    await admin.goto(`/t/${first.tournament.slug}`);
    await expect(admin.getByLabel("Table", { exact: true })).toHaveValue("1");
    await second.reload();
    await expect(second.getByText("Table 2 has no match this round", { exact: true })).toBeVisible();
    await second.getByRole("button", { name: "Show all tables", exact: true }).click();
    await expect(second.getByRole("article")).toHaveCount(2);
    await expect(second.getByRole("article").filter({ hasText: "Bye" })).toHaveCount(1);
    writeEvidence("match-entry/table-preference.json", { status: "PASS", canonicalTournamentId: id, nextRoundNewOpponents: true, missingWithdrawnTable: true, historyShowsAll: true, byesInAllTables: true, unavailableStorageWorks: true });
  } finally { await secondContext.close(); await unavailableContext.close(); }
});
