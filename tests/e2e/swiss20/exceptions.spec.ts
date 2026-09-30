import { expect, test } from "@playwright/test";
import type { Match } from "../../../src/domain/types";
import { createSimpleTournament, fillScore, installPacing, login, matchCard, organizerScore, playerSession, publishNext, snapshot } from "../../support/swiss20-browser";
import { administrativeResult, assertRejectedUnchanged, exceptionNames, issueInvitation, loginAuxiliary,
  pairedIdentity, saveExceptionEvidence, scoreWithPreview, withdraw } from "../../support/swiss20-exceptions";

test("EX-01/02: withdrawal, forfeits, and non-repeating eligible byes in a separate 20-player event", async ({ page }, testInfo) => {
  await login(page);
  const id = await createSimpleTournament(page, "Riverside Crossplay Club — attendance changes", exceptionNames.join("\n"), 3);
  let current = await publishNext(page, id, 1);
  expect(current.entrants).toHaveLength(20);
  expect(current.rounds[0]!.matches).toHaveLength(10);
  const [forfeit, doubleForfeit] = current.rounds[0]!.matches as [Match, Match, ...Match[]];
  await administrativeResult(page, current, forfeit, "forfeit", "Opponent could not return for the match.");
  await administrativeResult(page, current, doubleForfeit, "double_forfeit", "Both players missed the round.");
  for (const [index, match] of current.rounds[0]!.matches.slice(2).entries()) {
    await organizerScore(page, current, match, [356 + index * 3, 356 + index * 3]);
  }
  current = await snapshot(page.request, id);
  const firstRound = structuredClone(current.rounds[0]);
  expect(firstRound!.matches.find(match => match.id === forfeit.id)!.result).toMatchObject({ raw1: null, raw2: null,
    adjusted1: null, adjusted2: null, points1: 2, points2: 0, difference1: 0 });
  expect(firstRound!.matches.find(match => match.id === doubleForfeit.id)!.result).toMatchObject({ raw1: null, raw2: null,
    adjusted1: null, adjusted2: null, points1: 0, points2: 0, difference1: 0 });
  const withdrawnId = doubleForfeit.player2Id!;
  const withdrawnStanding = structuredClone(current.standings.find(row => row.entrantId === withdrawnId)!);
  await withdraw(page, id, withdrawnId);
  const excludedFromBye = new Set([forfeit.player1Id]);
  const seenPairs = new Set(firstRound!.matches.map(match => [match.player1Id, match.player2Id].sort().join(":")));
  const byeEvidence: Array<Record<string, unknown>> = [];
  for (const roundNumber of [2, 3]) {
    current = await publishNext(page, id, roundNumber);
    const round = current.rounds.find(item => item.number === roundNumber)!;
    const played = round.matches.filter(match => match.player2Id);
    const byes = round.matches.filter(match => !match.player2Id);
    expect(played).toHaveLength(9);
    expect(byes).toHaveLength(1);
    const assigned = round.matches.flatMap(match => match.player2Id ? [match.player1Id, match.player2Id] : [match.player1Id]);
    expect(new Set(assigned).size).toBe(19);
    expect(assigned).not.toContain(withdrawnId);
    const bye = byes[0]!;
    expect(excludedFromBye.has(bye.player1Id), "Prior bye/forfeit winner cannot receive another full-point unplayed win").toBe(false);
    expect(bye.result).toMatchObject({ raw1: null, raw2: null, points1: 2, points2: 0, difference1: 0 });
    byeEvidence.push({ round: roundNumber, recipient: bye.player1Id, previouslyIneligible: [...excludedFromBye], result: bye.result });
    excludedFromBye.add(bye.player1Id);
    for (const [index, match] of played.entries()) {
      const key = [match.player1Id, match.player2Id].sort().join(":");
      expect(seenPairs.has(key), "Published forfeit pairs also prevent rematches").toBe(false);
      seenPairs.add(key);
      await organizerScore(page, current, match, [362 + index * 3, 355 + index * 3]);
    }
  }
  current = await snapshot(page.request, id);
  expect(current.entrants.filter(entrant => entrant.active)).toHaveLength(19);
  expect(current.rounds[0]!.matches).toEqual(firstRound!.matches);
  expect(current.standings.find(row => row.entrantId === withdrawnId)).toMatchObject({ active: false,
    matchPoints: withdrawnStanding.matchPoints, difference: withdrawnStanding.difference,
    wins: withdrawnStanding.wins, draws: withdrawnStanding.draws, losses: withdrawnStanding.losses, played: withdrawnStanding.played });
  expect(current.standings.reduce((sum, row) => sum + row.difference, 0)).toBe(0);
  await page.getByRole("button", { name: "Finish tournament", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tournament complete", exact: true })).toBeVisible();
  await saveExceptionEvidence(testInfo, "attendance", { requirements: ["EX-01", "EX-02"], tournamentId: id,
    withdrawnId, byeEvidence, firstRound, final: await snapshot(page.request, id) });
});

test("EX-03: configurable completed-interval penalties, zero deduction, and separately labelled artificial boundary", async ({ page }, testInfo) => {
  await login(page);
  const id = await createSimpleTournament(page, "Harbor Crossplay Club — alternate overtime rule", exceptionNames.slice(0, 8).join("\n"), 1, 3, 15);
  let current = await publishNext(page, id, 1);
  const cases = [{ seconds: 14, adjusted: 401 }, { seconds: 15, adjusted: 398 }, { seconds: 29, adjusted: 398 }, { seconds: 30, adjusted: 395 }];
  const results: Match[] = [];
  for (const [index, entry] of cases.entries()) results.push(await scoreWithPreview(page, current, current.rounds[0]!.matches[index]!, 401, 399, entry.seconds, entry.adjusted, 399));
  const locked = await assertRejectedUnchanged(page, page.request, id, "update_settings", {
    name: current.tournament.name, date: null, config: { ...current.tournament.config, penaltyPoints: 4 },
  }, [400, 409], /locked/i);
  await page.goto(`/admin/tournaments/${id}/settings`);
  await expect(page.getByLabel("Overtime deduction (points)")).toBeDisabled();
  await expect(page.getByLabel("For every (seconds)")).toBeDisabled();
  const zeroId = await createSimpleTournament(page, "Harbor Crossplay Club — no overtime deduction", exceptionNames.slice(0, 2).join("\n"), 1, 0, 15);
  current = await publishNext(page, zeroId, 1);
  const zero = await scoreWithPreview(page, current, current.rounds[0]!.matches[0]!, 401, 399, 30, 401, 399);
  const boundaryId = await createSimpleTournament(page, "Artificial score boundary — negative adjusted score", exceptionNames.slice(0, 2).join("\n"), 1);
  current = await publishNext(page, boundaryId, 1);
  const artificial = await scoreWithPreview(page, current, current.rounds[0]!.matches[0]!, 1, 0, 20, -3, 0);
  await saveExceptionEvidence(testInfo, "penalties", { requirements: ["EX-03"], tournamentId: id,
    configuredRule: { penaltyPoints: 3, penaltyIntervalSeconds: 15 }, cases, results, locked,
    zeroDeduction: { tournamentId: zeroId, result: zero },
    artificialBoundary: { explicitlyNotOrdinaryFixtureData: true, tournamentId: boundaryId, result: artificial } });
});

test("EX-04/05: corrections invalidate drafts, retain published opponents, and support a bounded lifecycle", async ({ page }, testInfo) => {
  await login(page);
  const id = await createSimpleTournament(page, "Maple Crossplay Club — score desk corrections", exceptionNames.slice(0, 6).join("\n"), 3);
  let current = await publishNext(page, id, 1);
  const blockedPending = await assertRejectedUnchanged(page, page.request, id, "finish_tournament", { reason: "Venue must close early." }, [400, 409], /match|result|unresolved|confirm/i);
  for (const [index, match] of current.rounds[0]!.matches.entries()) await organizerScore(page, current, match, [381 + index, 375 + index]);
  await page.getByRole("button", { name: "Preview round 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publish round 2", exact: true })).toBeVisible();
  current = await snapshot(page.request, id);
  const discardedDraft = current.rounds.find(round => round.status === "draft")!;
  const originalMatch = current.rounds[0]!.matches[0]!;
  await page.getByRole("button", { name: "Round 1", exact: true }).click();
  await organizerScore(page, current, originalMatch, [384, 375], "Checked the score sheet before publishing round two.");
  current = await snapshot(page.request, id);
  expect(current.rounds.every(round => round.status !== "draft")).toBe(true);
  expect(current.standings.find(row => row.entrantId === originalMatch.player1Id)!.difference).toBe(9);
  const staleDraft = await assertRejectedUnchanged(page, page.request, id, "publish_round", { roundId: discardedDraft.id }, [400, 409], /pairing|preview|stale/i);
  current = await publishNext(page, id, 2);
  const beforeCorrection = pairedIdentity(current);
  const corrected = current.rounds[0]!.matches.find(match => match.id === originalMatch.id)!;
  await page.getByRole("button", { name: "Round 1", exact: true }).click();
  await organizerScore(page, current, corrected, [385, 375], "Both players confirmed a one-point recording error.");
  current = await snapshot(page.request, id);
  expect(pairedIdentity(current)).toEqual(beforeCorrection);
  expect(current.standings.find(row => row.entrantId === originalMatch.player1Id)!.difference).toBe(10);
  expect(current.audit?.some(event => event.reason === "Both players confirmed a one-point recording error.")).toBe(true);
  await page.getByRole("button", { name: "Round 2", exact: true }).click();
  for (const [index, match] of current.rounds[1]!.matches.entries()) await organizerScore(page, current, match, [364 + index, 364 + index]);
  const missingReason = await assertRejectedUnchanged(page, page.request, id, "finish_tournament", {}, [400, 409], /reason/i);
  await page.getByText("Finish early", { exact: true }).click();
  await page.getByLabel("Reason", { exact: true }).fill("The venue is closing earlier than planned.");
  await page.getByRole("button", { name: "Finish tournament early", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tournament complete", exact: true })).toBeVisible();
  await page.getByText("Reopen results for a correction", { exact: true }).click();
  await page.getByLabel("Reason", { exact: true }).fill("Reviewing a transcribed final score.");
  await page.getByRole("button", { name: "Reopen results", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Results reopened", exact: true })).toBeVisible();
  current = await snapshot(page.request, id);
  expect(current.tournament.correctionsOnly).toBe(true);
  const blockedExtra = await assertRejectedUnchanged(page, page.request, id, "generate_round", {}, [400, 409], /correction/i);
  const last = current.rounds[1]!.matches[0]!;
  await organizerScore(page, current, last, [365, 364], "Corrected the transcribed final score after reopening.");
  await page.locator("details").filter({ has: page.getByText("Finish corrected tournament", { exact: true }) }).getByLabel("Reason", { exact: true }).fill("Score review is complete.");
  await page.getByRole("button", { name: "Finish tournament", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tournament complete", exact: true })).toBeVisible();
  const finished = await snapshot(page.request, id);
  await page.getByRole("button", { name: "Archive tournament", exact: true }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  const archived = await snapshot(page.request, id);
  expect(archived.tournament.status).toBe("archived");
  expect(archived.rounds).toEqual(finished.rounds);
  expect(archived.standings).toEqual(finished.standings);
  expect(archived.rounds).toHaveLength(2);
  await saveExceptionEvidence(testInfo, "corrections-lifecycle", { requirements: ["EX-04", "EX-05"], tournamentId: id,
    blockedPending, discardedDraftId: discardedDraft.id, staleDraft, publishedPairings: beforeCorrection,
    missingReason, blockedExtra, archived });
});

test("EX-06/07: invitation replacement and actual local identities cannot cross authorization boundaries", async ({ page, browser }, testInfo) => {
  await login(page);
  const id = await createSimpleTournament(page, "Oak Crossplay Club — player access", exceptionNames.slice(0, 4).join("\n"), 2);
  let current = await publishNext(page, id, 1);
  const target = current.rounds[0]!.matches[0]!;
  const otherMatch = current.rounds[0]!.matches[1]!;
  const unconsumedOldLink = await issueInvitation(page, id, target.player1Id);
  const prior = await playerSession(browser, page, id, target.player1Id);
  const unrelatedPlayer = await playerSession(browser, page, id, otherMatch.player1Id);
  const replacementLink = await issueInvitation(page, id, target.player1Id);
  const anonymous = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  const unrelatedAuth = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  const otherOrganizer = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  const replacement = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  try {
    await installPacing(anonymous);
    await installPacing(replacement);
    const oldPage = await anonymous.newPage();
    await oldPage.goto(unconsumedOldLink);
    await oldPage.getByRole("button", { name: "Join tournament", exact: true }).click();
    await expect(oldPage.getByRole("main").getByRole("alert")).toContainText(/link|invitation/i);
    expect((await snapshot(prior.page.request, id)).viewer.entrantId).toBeNull();
    const rejected: Array<Record<string, unknown>> = [];
    const payload = { matchId: target.id, expectedRevision: target.revision, raw1: 387, raw2: 379, overtime1: 0, overtime2: 0 };
    rejected.push(await assertRejectedUnchanged(page, prior.page.request, id, "submit_report", payload, [401, 403]));
    rejected.push(await assertRejectedUnchanged(page, unrelatedPlayer.page.request, id, "submit_report", payload, [401, 403]));
    rejected.push(await assertRejectedUnchanged(page, anonymous.request, id, "submit_report", payload, [401, 403]));
    const authPage = await unrelatedAuth.newPage();
    const unrelatedLogin = await loginAuxiliary(authPage, "unrelatedAuth");
    rejected.push(await assertRejectedUnchanged(page, unrelatedAuth.request, id, "finalize_result", { ...payload, kind: "played" }, [401, 403]));
    const otherAdminPage = await otherOrganizer.newPage();
    const otherOrganizerLogin = await loginAuxiliary(otherAdminPage, "otherOrganizer");
    rejected.push(await assertRejectedUnchanged(page, otherOrganizer.request, id, "finalize_result", { ...payload, kind: "played" }, [401, 403]));
    rejected.push(await assertRejectedUnchanged(page, otherOrganizer.request, id, "issue_invite", { entrantId: target.player1Id }, [401, 403]));
    const replacementPage = await replacement.newPage();
    await replacementPage.goto(replacementLink);
    await replacementPage.getByRole("button", { name: "Join tournament", exact: true }).click();
    await expect(replacementPage).toHaveURL(/\/t\/[^/]+$/);
    expect((await snapshot(replacementPage.request, id)).viewer.entrantId).toBe(target.player1Id);
    const ownCard = matchCard(replacementPage, current, target, true);
    await ownCard.getByRole("button", { name: "Report result", exact: true }).click();
    await fillScore(ownCard, 387, 379, 0, 0);
    await ownCard.getByRole("button", { name: "Submit result", exact: true }).click();
    await expect(ownCard.getByText("Waiting for your opponent to confirm.")).toBeVisible();
    expect((await snapshot(replacementPage.request, id)).rounds[0]!.matches.find(match => match.id === target.id)!.report).not.toBeNull();
    current = await snapshot(anonymous.request, id);
    expect(current.viewer).toEqual({ isOrganizer: false, entrantId: null });
    expect(current.audit).toBeUndefined();
    expect(current.rounds.flatMap(round => round.matches).every(match => match.report === null)).toBe(true);
    expect(JSON.stringify(current)).not.toMatch(/inviteHash|sessionHash|userId|inviteUrl/);
    const otherOrganizerModel = await snapshot(otherOrganizer.request, id);
    expect(otherOrganizerModel.viewer.isOrganizer).toBe(false);
    expect(otherOrganizerModel.audit).toBeUndefined();
    expect(otherOrganizerModel.rounds.flatMap(round => round.matches).every(match => match.report === null)).toBe(true);
    await saveExceptionEvidence(testInfo, "authorization", { requirements: ["EX-06", "EX-07"], tournamentId: id,
      intendedEntrantId: target.player1Id, revokedSessionEntrantId: null, replacementEntrantId: target.player1Id,
      unrelatedLogin, otherOrganizerLogin, rejected, anonymousModel: current, credentialMaterialOmitted: true });
  } finally {
    for (const context of [prior.context, unrelatedPlayer.context, anonymous, unrelatedAuth, otherOrganizer, replacement]) await context.close();
  }
});

test("EX-08: a genuinely impossible legal pairing produces no partial round", async ({ page }, testInfo) => {
  await login(page);
  const id = await createSimpleTournament(page, "Willow Crossplay Club — reduced field", exceptionNames.slice(0, 4).join("\n"), 3);
  let current = await publishNext(page, id, 1);
  for (const match of current.rounds[0]!.matches) await organizerScore(page, current, match, [372, 372]);
  const retainedPair = current.rounds[0]!.matches[0]!;
  const withdrawnPair = current.rounds[0]!.matches[1]!;
  await withdraw(page, id, withdrawnPair.player1Id);
  await withdraw(page, id, withdrawnPair.player2Id!);
  current = await snapshot(page.request, id);
  expect(current.entrants.filter(entrant => entrant.active).map(entrant => entrant.id).sort()).toEqual([retainedPair.player1Id, retainedPair.player2Id!].sort());
  await page.goto(`/admin/tournaments/${id}`);
  await page.getByRole("button", { name: "Preview round 2", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/rematch|pairing|opponent/i);
  const afterUI = await snapshot(page.request, id);
  expect(afterUI.rounds).toEqual(current.rounds);
  expect(afterUI.tournament.version).toBe(current.tournament.version);
  const rejection = await assertRejectedUnchanged(page, page.request, id, "generate_round", {}, [409], /rematch|pairing|opponent/i);
  await saveExceptionEvidence(testInfo, "impossible-pairing", { requirements: ["EX-08"], tournamentId: id,
    activePlayers: [retainedPair.player1Id, retainedPair.player2Id], priorOpponentPair: retainedPair,
    rejection, noPartialRound: (await snapshot(page.request, id)).rounds.length === 1 });
});
