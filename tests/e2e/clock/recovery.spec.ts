import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import type { MatchClockSnapshot } from "../../../src/client/match-clock-api";
import type { ClockState } from "../../../src/domain/clock-types";
import { baseURL, createSimpleTournament, evidencePath, login, origin, publishNext, snapshot, writeEvidence } from "../../support/swiss20-browser";

async function clockSnapshot(request: APIRequestContext, matchId: string): Promise<MatchClockSnapshot> {
  const response = await request.get(`${baseURL}/api/matches/${matchId}/clock`);
  expect(response.status()).toBe(200);
  return response.json() as Promise<MatchClockSnapshot>;
}
async function clockCommand(request: APIRequestContext, matchId: string, command: string, payload: Record<string, unknown> = {}, expectedClockVersion?: number) {
  return request.post(`${baseURL}/api/matches/${matchId}/clock`, {
    headers: { Origin: origin }, data: { command, payload, expectedClockVersion, requestId: randomUUID() },
  });
}
async function openShared(browser: Browser, admin: Page, matchId: string) {
  const issued = await clockCommand(admin.request, matchId, "issue_match_link");
  expect(issued.status()).toBe(200);
  const link = new URL((await issued.json() as { inviteUrl: string }).inviteUrl);
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}${link.pathname}${link.hash}`);
  await expect(page.getByRole("button", { name: "Start clock", exact: true })).toBeEnabled();
  expect(new URL(page.url()).hash).toBe("");
  expect((await context.cookies()).some(cookie => cookie.httpOnly)).toBe(true);
  return { context, page };
}
async function savedClock(page: Page, matchId: string): Promise<{ state: ClockState; events: unknown[] }> {
  return page.evaluate(id => {
    const key = Object.keys(localStorage).find(key => key.startsWith(`crossplay.clock.${id}.`));
    if (!key) throw new Error("Missing local clock checkpoint.");
    return JSON.parse(localStorage.getItem(key)!);
  }, matchId);
}
async function setup(admin: Page, browser: Browser, name: string, players = "Maya Chen\nOwen Brooks") {
  await login(admin);
  const tournamentId = await createSimpleTournament(admin, name, players, 1);
  const published = await publishNext(admin, tournamentId, 1);
  const matchId = published.rounds[0].matches[0].id;
  return { tournamentId, published, matchId, ...await openShared(browser, admin, matchId) };
}

test("CLOCK-RECOVERY: real-time refresh, pause, keyboard switching and a second tab preserve one timeline", async ({ page: admin, browser }) => {
  const match = await setup(admin, browser, "Clock recovery — shared phone");
  const { page, context, matchId, tournamentId } = match;
  try {
    const before = await clockSnapshot(page.request, matchId);
    const starter = before.state!.activeSide;
    const tournamentVersion = (await snapshot(admin.request, tournamentId)).tournament.version;
    await page.getByRole("button", { name: "Start clock", exact: true }).click();
    await expect.poll(async () => (await clockSnapshot(page.request, matchId)).state?.status).toBe("running");
    await page.waitForTimeout(350);
    const otherSide = starter === 1 ? 2 : 1;
    await page.locator(`[data-side="${otherSide}"]`).click({ force: true });
    expect((await savedClock(page, matchId)).state.activeSide).toBe(starter);
    const startedAt = Date.now();
    await page.reload();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
    const afterReload = await savedClock(page, matchId);
    expect(afterReload.state.activeSide).toBe(starter);
    expect(afterReload.state.usedMs[starter - 1]).toBeGreaterThanOrEqual(300);
    expect(afterReload.state.reviewRequired).toBe(false);
    await page.locator(`[data-side="${starter}"]`).focus();
    await page.keyboard.press("Enter");
    expect((await savedClock(page, matchId)).state.activeSide).toBe(otherSide);
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const paused = (await savedClock(page, matchId)).state;
    await page.waitForTimeout(350);
    expect((await savedClock(page, matchId)).state.usedMs).toEqual(paused.usedMs);
    await page.getByRole("button", { name: "Flip sides", exact: true }).click();
    expect((await savedClock(page, matchId)).state.activeSide).toBe(otherSide);

    const second = await context.newPage();
    await second.goto(`/match/${matchId}`);
    await expect(second.getByText("Read-only · Clock on another device", { exact: true })).toBeVisible();
    await expect(second.getByRole("button", { name: "Resume", exact: true })).toBeDisabled();
    await second.close();
    await page.bringToFront();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "End game", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Report scores", exact: true })).toBeVisible();
    await expect.poll(async () => (await clockSnapshot(page.request, matchId)).state?.status).toBe("ended");
    const ended = await clockSnapshot(page.request, matchId);
    expect(ended.state!.usedMs[otherSide - 1]).toBeGreaterThanOrEqual(300);
    expect(ended.state!.usedMs[0] + ended.state!.usedMs[1]).toBeLessThan(Date.now() - startedAt + 5000);
    expect(ended.start).toEqual(before.start && { ...before.start, played: true });
    expect((await snapshot(admin.request, tournamentId)).tournament.version).toBe(tournamentVersion);
    await page.screenshot({ path: evidencePath("clock-recovery", "report-after-refresh.png"), fullPage: true });
    writeEvidence("clock-recovery/real-time-refresh.json", { starter, paused, ended: ended.state, startingRecord: ended.start, tournamentVersionUnchanged: true, keyboardSwitch: true, secondTabReadOnly: true });
  } finally { await context.close(); }
});

test("CLOCK-OFFLINE: offline taps and end remain frozen until ordered reconnect acceptance", async ({ page: admin, browser }) => {
  const { page, context, matchId } = await setup(admin, browser, "Clock recovery — offline handoff");
  try {
    await page.getByRole("button", { name: "Start clock", exact: true }).click();
    await expect.poll(async () => (await clockSnapshot(page.request, matchId)).state?.sequence).toBe(1);
    await context.setOffline(true);
    await page.waitForTimeout(180);
    const initial = (await savedClock(page, matchId)).state;
    await page.locator(`[data-side="${initial.activeSide}"]`).click();
    await page.waitForTimeout(180);
    await page.getByRole("button", { name: "End game", exact: true }).click();
    const offline = await savedClock(page, matchId);
    expect(offline.state.status).toBe("ended");
    expect(offline.events.length).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(700);
    expect((await savedClock(page, matchId)).state.usedMs).toEqual(offline.state.usedMs);
    await page.getByRole("spinbutton").nth(0).fill("401");
    await page.getByRole("spinbutton").nth(1).fill("399");
    await expect(page.getByRole("button", { name: "Review scores", exact: true })).toBeDisabled();
    await expect(page.getByRole("status")).toContainText("Waiting to save");
    await context.setOffline(false);
    await expect.poll(async () => (await savedClock(page, matchId)).events.length).toBe(0);
    await expect(page.getByRole("button", { name: "Review scores", exact: true })).toBeEnabled();
    const accepted = await clockSnapshot(page.request, matchId);
    expect(accepted.state!.usedMs).toEqual(offline.state.usedMs);
    expect(accepted.state!.sequence).toBe(offline.state.sequence);
    await page.getByRole("button", { name: "Review scores", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review scores", exact: true })).toBeVisible();
    const reported = await clockSnapshot(page.request, matchId);
    expect(reported.report).toMatchObject({ raw1: 401, raw2: 399, overtime1: 0, overtime2: 0, confirmationMethod: "shared_device" });
    expect(reported.state!.usedMs).toEqual(offline.state.usedMs);
    writeEvidence("clock-recovery/offline-end.json", { offline: offline.state, accepted: accepted.state, report: reported.report, scoreEntryTimeExcluded: true });
  } finally { await context.close(); }
});

test("CLOCK-LOST-RESPONSE: committed events survive a missing response and browser reload exactly once", async ({ page: admin, browser }) => {
  const { page, context, matchId } = await setup(admin, browser, "Clock recovery — lost acknowledgement");
  try {
    let committed = false;
    let block = true;
    await page.route(`**/api/matches/${matchId}/clock`, async route => {
      const request = route.request();
      if (request.method() === "POST" && request.postDataJSON().command === "append_events" && block) {
        if (!committed) { const response = await route.fetch(); expect(response.status()).toBe(200); committed = true; }
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Start clock", exact: true }).click();
    await expect.poll(() => committed).toBe(true);
    await page.waitForTimeout(150);
    const active = (await savedClock(page, matchId)).state.activeSide;
    await page.locator(`[data-side="${active}"]`).click();
    await page.getByRole("button", { name: "End game", exact: true }).click();
    const frozen = await savedClock(page, matchId);
    expect(frozen.events.length).toBeGreaterThanOrEqual(3);
    block = false;
    await page.reload();
    await expect(page.getByRole("heading", { name: "Report scores", exact: true })).toBeVisible();
    await expect.poll(async () => (await savedClock(page, matchId)).events.length).toBe(0);
    const accepted = await clockSnapshot(page.request, matchId);
    expect(accepted.state!.usedMs).toEqual(frozen.state.usedMs);
    expect(accepted.state!.sequence).toBe(frozen.state.sequence);
    expect(accepted.state!.reviewRequired).toBe(false);
    writeEvidence("clock-recovery/lost-response.json", { beforeReload: frozen.state, accepted: accepted.state, acceptedExactlyOnce: true });
  } finally { await context.close(); }
});

test("CLOCK-SECURITY: match scope, anonymous access, controller epochs and revocation are enforced", async ({ page: admin, browser }) => {
  const { page, context, matchId, published, tournamentId } = await setup(admin, browser, "Clock access — table-scoped sessions", "Maya Chen\nOwen Brooks\nPriya Shah\nTheo Martin");
  const anonymous = await browser.newContext({ baseURL });
  try {
    const otherMatch = published.rounds[0].matches.find(match => match.id !== matchId)!;
    const own = await clockSnapshot(page.request, matchId);
    const anonymousRead = await anonymous.request.get(`${baseURL}/api/matches/${matchId}/clock`);
    expect([401, 403, 404]).toContain(anonymousRead.status());
    const crossRead = await page.request.get(`${baseURL}/api/matches/${otherMatch.id}/clock`);
    expect([401, 403, 404]).toContain(crossRead.status());
    const crossWrite = await clockCommand(page.request, otherMatch.id, "claim_clock", { controllerId: randomUUID() });
    expect([401, 403, 404]).toContain(crossWrite.status());
    const adminImpersonation = await clockCommand(page.request, matchId, "issue_match_link");
    expect([401, 403]).toContain(adminImpersonation.status());
    const forgedSide = await clockCommand(page.request, matchId, "append_events", {
      controllerId: own.controllerId, epoch: own.state!.epoch,
      events: [{ sequence: 1, kind: "start", elapsedMs: 0, atMs: Date.now(), side: own.state!.activeSide === 1 ? 2 : 1 }],
    }, own.state!.version);
    expect([400, 409]).toContain(forgedSide.status());
    expect((await clockSnapshot(page.request, matchId)).state).toEqual(own.state);

    const transferred = await clockCommand(admin.request, matchId, "takeover_clock", { controllerId: randomUUID(), reason: "Acceptance test: original phone unavailable." });
    expect(transferred.status()).toBe(200);
    const transferredState = (await transferred.json() as MatchClockSnapshot).state!;
    expect(transferredState.epoch).toBeGreaterThan(own.state!.epoch);
    const stale = await clockCommand(page.request, matchId, "append_events", {
      controllerId: own.controllerId, epoch: own.state!.epoch,
      events: [{ sequence: 1, kind: "start", elapsedMs: 0, atMs: Date.now(), side: own.state!.activeSide }],
    }, own.state!.version);
    expect([403, 409]).toContain(stale.status());
    const revoked = await clockCommand(admin.request, matchId, "revoke_match_link", { reason: "Acceptance test: table link revoked." });
    expect(revoked.status()).toBe(200);
    const revokedRead = await page.request.get(`${baseURL}/api/matches/${matchId}/clock`);
    expect([401, 403, 404, 410]).toContain(revokedRead.status());
    const publicTournament = await snapshot(anonymous.request, tournamentId);
    expect(JSON.stringify(publicTournament)).not.toContain("controllerId");
    expect(JSON.stringify(publicTournament)).not.toContain("inviteHash");
    writeEvidence("clock-recovery/security.json", { anonymousRead: anonymousRead.status(), crossRead: crossRead.status(), crossWrite: crossWrite.status(), adminImpersonation: adminImpersonation.status(), forgedStarter: forgedSide.status(), staleEpoch: stale.status(), revokedRead: revokedRead.status(), priorEpoch: own.state!.epoch, transferredEpoch: transferredState.epoch });
  } finally { await context.close(); await anonymous.close(); }
});
