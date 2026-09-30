import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { assertStandings, calculateScore, calculateStandings, findWitnesses, type Fixture } from "../../support/swiss-reference";
import { assertStandingsUI, evidencePath, finishFullEvent, organizerScore, runFullEvent, snapshot, writeEvidence } from "../../support/swiss20-browser";
import { readDatabaseEvidence } from "../../support/local-environment";

test("six-round companion proves all differential tiebreak rules with persisted realistic scores", async ({ page, browser }, testInfo) => {
  const fixture = JSON.parse(readFileSync(resolve("tests/fixtures/swiss20/tiebreak-witnesses-v1.json"), "utf8")) as Fixture;
  const event = await runFullEvent(page, browser, fixture, testInfo);
  const actual = event.current.standings;
  const witnesses = findWitnesses(fixture.players, event.ledger, fixture.config);
  expect(witnesses.map((witness) => witness.id)).toEqual(["TB-01", "TB-02", "TB-03", "TB-04", "TB-05", "TB-06", "TB-09"]);
  expect(witnesses).toEqual(fixture.witnesses);
  for (const witness of witnesses) {
    const a = actual.find((row) => row.entrantId === witness.playerIds[0])!;
    const b = actual.find((row) => row.entrantId === witness.playerIds[1])!;
    expect(a.matchPoints).toBe(witness.values.pointsA);
    expect(b.matchPoints).toBe(witness.values.pointsB);
    expect(a.difference).toBe(witness.values.differenceA);
    expect(b.difference).toBe(witness.values.differenceB);
    expect(a.rank).toBe(witness.values.rankA);
    expect(b.rank).toBe(witness.values.rankB);
    if (["TB-03", "TB-09"].includes(witness.id)) expect(a.rank).toBe(b.rank);
    else if (witness.id === "TB-06") expect(a.rank).toBeGreaterThan(b.rank);
    else expect(a.rank).toBeLessThan(b.rank);
    event.requirements[witness.id] = { status: "PASS", scope: "full 60-match event", witness };
  }
  await assertStandingsUI(event.spectator.page, fixture.expectedStandings);
  await event.spectator.page.screenshot({ path: evidencePath(fixture.id, "screenshots", "tiebreak-witnesses-before-correction.png"), fullPage: true });
  writeEvidence(`${fixture.id}/tiebreak-witnesses.json`, witnesses);

  const correction = fixture.correction;
  const original = fixture.rounds[correction.roundNumber - 1]!.matches[correction.matchIndex]!;
  const oldScore = calculateScore(original, fixture.config);
  const newScore = calculateScore(correction.score, fixture.config);
  expect(newScore.points1).toBe(oldScore.points1);
  expect(newScore.points2).toBe(oldScore.points2);
  expect(newScore.difference1).not.toBe(oldScore.difference1);
  const published = event.current.rounds.map((round) => ({ id: round.id, number: round.number, hash: round.inputHash, assignments: round.matches.map((match) => ({ id: match.id, table: match.tableNumber, player1Id: match.player1Id, player2Id: match.player2Id })) }));
  const oldOrder = actual.map((row) => row.entrantId);
  expect(oldOrder.indexOf(correction.witness.beforeFirstId)).toBeLessThan(oldOrder.indexOf(correction.witness.afterFirstId));
  await page.goto(`/admin/tournaments/${event.id}`);
  await page.getByRole("button", { name: `Round ${correction.roundNumber}`, exact: true }).click();
  const match = event.current.rounds[correction.roundNumber - 1]!.matches[correction.matchIndex]!;
  await organizerScore(page, event.current, match, [correction.score.raw1, correction.score.raw2, correction.score.overtime1, correction.score.overtime2], "Corrected a transcribed score after both players checked their match notes.");
  const corrected = await snapshot(page.request, event.id);
  assertStandings(corrected.standings, correction.expectedStandings);
  await assertStandingsUI(page, correction.expectedStandings);
  await event.spectator.page.reload();
  await assertStandingsUI(event.spectator.page, correction.expectedStandings);
  const newOrder = corrected.standings.map((row) => row.entrantId);
  expect(newOrder.indexOf(correction.witness.afterFirstId)).toBeLessThan(newOrder.indexOf(correction.witness.beforeFirstId));
  for (const row of actual) {
    const after = corrected.standings.find((item) => item.entrantId === row.entrantId)!;
    expect([after.matchPoints, after.wins, after.draws, after.losses]).toEqual([row.matchPoints, row.wins, row.draws, row.losses]);
  }
  expect(corrected.rounds.map((round) => ({ id: round.id, number: round.number, hash: round.inputHash, assignments: round.matches.map((item) => ({ id: item.id, table: item.tableNumber, player1Id: item.player1Id, player2Id: item.player2Id })) }))).toEqual(published);
  expect(corrected.audit?.some((item) => item.reason === "Corrected a transcribed score after both players checked their match notes.")).toBe(true);
  const changedLedger = event.ledger.map((item) => item.roundNumber === correction.roundNumber && item.player1Id === original.player1Id && item.player2Id === original.player2Id ? { ...item, ...correction.score } : item);
  assertStandings(corrected.standings, calculateStandings(fixture.players, changedLedger, fixture.config));
  await event.spectator.page.screenshot({ path: evidencePath(fixture.id, "screenshots", "tiebreak-correction-reorders.png"), fullPage: true });
  const database = readDatabaseEvidence(event.id);
  const stored = database.officialResults.find((item) => item.matchId === match.id)!;
  expect(stored.result).toEqual(corrected.rounds[correction.roundNumber - 1]!.matches[correction.matchIndex]!.result);
  writeEvidence(`${fixture.id}/tiebreak-correction.json`, { correction, before: actual, after: corrected.standings, unchangedPublishedPairings: published, database });
  event.requirements["TB-08"] = { status: "PASS", witness: correction.witness, sameMatchPointsAndWDL: true, publishedPairingsUnchanged: true };

  // Restore the frozen scores through the same audited UI so final CSVs remain the frozen ledger.
  await organizerScore(page, corrected, corrected.rounds[correction.roundNumber - 1]!.matches[correction.matchIndex]!, [original.raw1, original.raw2, original.overtime1, original.overtime2], "Restored the original verified match record after the documented correction exercise.");
  event.current = await snapshot(page.request, event.id);
  assertStandings(event.current.standings, fixture.expectedStandings);
  await finishFullEvent(page, fixture, event);
});
