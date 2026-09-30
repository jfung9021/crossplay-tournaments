import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { MatchClockSnapshot } from "../../../src/client/match-clock-api";
import { baseURL, command, createSimpleTournament, evidencePath, login, origin, publishNext, writeEvidence } from "../../support/swiss20-browser";

async function readClock(request: APIRequestContext, matchId: string): Promise<MatchClockSnapshot> {
  const response = await request.get(`${baseURL}/api/matches/${matchId}/clock`);
  expect(response.status()).toBe(200);
  return response.json() as Promise<MatchClockSnapshot>;
}

async function clockCommand(request: APIRequestContext, matchId: string, name: string, payload: Record<string, unknown> = {}, expectedClockVersion?: number) {
  return request.post(`${baseURL}/api/matches/${matchId}/clock`, { headers: { Origin: origin }, data: { command: name, payload, expectedClockVersion, requestId: randomUUID() } });
}

async function reconcile(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

test("CLOCK-REPORT-CORRECTIONS: pending reload, revised acknowledgements and organizer corrections remain usable and truthful", async ({ page: admin, browser }) => {
  await login(admin);
  const tournamentId = await createSimpleTournament(admin, "Shared scores — correction handoff", "Maya Chen\nOwen Brooks", 1);
  const tournament = await publishNext(admin, tournamentId, 1);
  const matchId = tournament.rounds[0].matches[0].id;
  const issued = await clockCommand(admin.request, matchId, "issue_match_link");
  expect(issued.status()).toBe(200);
  const link = new URL((await issued.json() as { inviteUrl: string }).inviteUrl);
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}${link.pathname}${link.hash}`);
    await page.getByRole("button", { name: "Start clock", exact: true }).click();
    await page.getByRole("button", { name: "End game", exact: true }).click();
    const ready = await readClock(page.request, matchId);
    const [first, second] = ready.players;
    await page.getByLabel(`${first.name} game score`, { exact: true }).fill("401");
    await page.getByLabel(`${second.name} game score`, { exact: true }).fill("399");
    await page.getByRole("button", { name: "Review scores", exact: true }).click();
    await page.getByRole("button", { name: `${first.name}: agree`, exact: true }).click();
    await expect(page.getByRole("button", { name: `${first.name} confirmed`, exact: true })).toBeDisabled();
    const pending = await readClock(page.request, matchId);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Review scores", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `${second.name}: agree`, exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: `${first.name} confirmed`, exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Edit scores", exact: true }).click();
    await page.getByLabel(`${first.name} game score`, { exact: true }).fill("403");
    await page.getByRole("button", { name: "Review scores", exact: true }).click();
    await expect(page.getByRole("button", { name: `${first.name}: agree`, exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: `${second.name}: agree`, exact: true })).toBeEnabled();
    const revised = await readClock(page.request, matchId);
    expect(revised.report?.acknowledgedSides).toEqual([]);
    expect(revised.matchRevision).toBeGreaterThan(pending.matchRevision);
    const stale = await clockCommand(page.request, matchId, "acknowledge_shared_report", { reportId: pending.report!.id, expectedRevision: pending.matchRevision, side: 2 });
    expect(stale.status()).toBe(409);

    const correctedResponse = await clockCommand(admin.request, matchId, "correct_clock", { usedMs: [1_220_000, 1_190_000], activeSide: revised.state!.activeSide, reason: "Both players reviewed the recorded times." }, revised.state!.version);
    expect(correctedResponse.status()).toBe(200);
    const corrected = await correctedResponse.json() as MatchClockSnapshot;
    expect(corrected.report).toBeNull();
    await reconcile(page);
    await expect(page.getByRole("heading", { name: "Report scores", exact: true })).toBeVisible();
    await page.getByLabel(`${first.name} game score`, { exact: true }).fill("401");
    await page.getByLabel(`${second.name} game score`, { exact: true }).fill("399");
    await expect(page.getByRole("button", { name: "Review scores", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Review scores", exact: true }).click();
    await page.getByRole("button", { name: `${first.name}: agree`, exact: true }).click();
    await page.getByRole("button", { name: `${second.name}: agree`, exact: true }).click();
    await expect(page.getByText("Both players confirmed.", { exact: true })).toBeVisible();
    const finalized = await readClock(page.request, matchId);
    expect(finalized.result).toMatchObject({ raw1: 401, raw2: 399, overtime1: 20, overtime2: 0, adjusted1: 397, adjusted2: 399 });
    expect(finalized.officialConfirmationMethod).toBe("shared_device");

    // Keep adjusted totals identical so comparing only those totals cannot hide a changed official revision.
    const finalCorrection = await command(admin.request, tournamentId, "finalize_result", { matchId, expectedRevision: finalized.matchRevision, kind: "played", raw1: 405, raw2: 401, overtime1: 40, overtime2: 10, reason: "Organizer corrected the raw scores and overtime after reviewing the game record." });
    expect(finalCorrection.status()).toBe(200);
    await reconcile(page);
    await expect(page.getByText("Organizer finalized.", { exact: true })).toBeVisible();
    await expect(page.getByText("Both players confirmed.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("405 game score · −8 points", { exact: true })).toBeVisible();
    await expect(page.getByText("401 game score · −2 points", { exact: true })).toBeVisible();
    await expect(page.getByText("40s overtime", { exact: true })).toBeVisible();
    await expect(page.getByText("10s overtime", { exact: true })).toBeVisible();
    const official = await readClock(page.request, matchId);
    expect(official.result).toMatchObject({ raw1: 405, raw2: 401, overtime1: 40, overtime2: 10, adjusted1: 397, adjusted2: 399 });
    expect(official.officialConfirmationMethod).toBe("organizer");
    await page.screenshot({ path: evidencePath("clock-corrections", "organizer-finalized.png"), fullPage: true });
    writeEvidence("clock-corrections/report-revisions.json", { pending, revised, corrected, finalized, official, pendingReloadWriteable: true, staleAcknowledgementStatus: stale.status(), correctedFormUsableWithoutReload: true });
  } finally { await context.close(); }
});
