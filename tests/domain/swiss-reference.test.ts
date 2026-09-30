import { describe, expect, it } from "vitest";
import mixedJson from "../fixtures/swiss20/mixed-results-v1.json";
import tiebreakJson from "../fixtures/swiss20/tiebreak-witnesses-v1.json";
import { assertStandings, calculateScore, calculateStandings, findWitnesses, fixtureHash, pairingEvidence, verifyFixture, type Fixture, type ReferenceMatch, type ReferencePlayer } from "../support/swiss-reference";

const mixed = mixedJson as Fixture; const tiebreak = tiebreakJson as Fixture;
const config = mixed.config;
const scoreInput = (raw1: number, raw2: number, overtime1: number, overtime2: number) => ({raw1, raw2, overtime1, overtime2});

describe("independent Swiss acceptance reference", () => {
  it.each([
    [401, 399, 9, 0, 401, 399, 2, 2],
    [401, 399, 10, 0, 399, 399, 1, 0],
    [401, 399, 11, 0, 399, 399, 1, 0],
    [401, 399, 19, 0, 399, 399, 1, 0],
    [401, 399, 20, 0, 397, 399, 0, -2],
    [405, 404, 20, 10, 401, 402, 0, -1],
    [1, 0, 20, 0, -3, 0, 0, -3],
  ])("hand arithmetic raw %i/%i overtime %i/%i", (raw1, raw2, overtime1, overtime2, adjusted1, adjusted2, points1, difference1) => {
    expect(calculateScore(scoreInput(raw1, raw2, overtime1, overtime2), config)).toMatchObject({adjusted1, adjusted2, points1, points2: 2 - points1, difference1});
  });

  it("charges only complete configured intervals and permits zero deductions", () => {
    for (const [seconds, deduction] of [[14, 0], [15, 3], [29, 3], [30, 6]]) {
      expect(calculateScore(scoreInput(401, 399, seconds!, 0), {...config, penaltyIntervalSeconds: 15, penaltyPoints: 3}).deduction1).toBe(deduction);
    }
    expect(calculateScore(scoreInput(401, 399, 60, 0), {...config, penaltyPoints: 0}).adjusted1).toBe(401);
  });

  it.each([mixed, tiebreak])("verifies the frozen $id whole ledger, profile and every pairing optimum", fixture => {
    verifyFixture(fixture);
    expect(fixture.rounds.map(round => [round.pairingEvidence.actualGap, round.pairingEvidence.actualFloat])).toEqual(fixture.rounds.map(round => [round.pairingEvidence.minimumGap, round.pairingEvidence.minimumFloat]));
    expect(fixture.rounds.every(round => round.pairingEvidence.checkedMasks > 0)).toBe(true);
  });

  it("contains every static tiebreak witness in the full companion event", () => {
    const witnesses = findWitnesses(tiebreak.players, tiebreak.rounds.flatMap(round => round.matches), config);
    expect(witnesses.map(witness => witness.id)).toEqual(["TB-01", "TB-02", "TB-03", "TB-04", "TB-05", "TB-06", "TB-09"]);
    const byName = new Map(tiebreak.expectedStandings.map(row => [row.name, row]));
    // Hand-recorded checkpoints, deliberately not read back from the generated witness values.
    expect(byName.get("Quinn Hale")).toMatchObject({rank: 4, matchPoints: 4, difference: 25, totalRaw: 2229, opponentPoints: 19});
    expect(byName.get("Nadia Wells")).toMatchObject({rank: 4, matchPoints: 4, difference: 25, totalRaw: 2186, opponentPoints: 19.5});
    expect(byName.get("Theo Bennett")).toMatchObject({rank: 10, matchPoints: 3, difference: 25, rawDifference: 25});
    expect(byName.get("Morgan Vale")).toMatchObject({rank: 11, matchPoints: 3, difference: 24, rawDifference: 26});
    expect(byName.get("Lena Mercer")).toMatchObject({rank: 14, matchPoints: 2.5, difference: 88});
    expect(byName.get("Robin Calder")).toMatchObject({rank: 3, matchPoints: 4.5, difference: 16});
  });

  it("rejects reversed differential order with identified row and rule", () => {
    const changed = structuredClone(tiebreak.expectedStandings); [changed[0], changed[1]] = [changed[1]!, changed[0]!];
    expect(() => assertStandings(changed, tiebreak.expectedStandings)).toThrow(/row 1.*points before adjusted differential/);
  });

  it("rejects raw differential in place of adjusted differential", () => {
    const changed = tiebreak.expectedStandings.map(row => ({...row, difference: row.rawDifference}));
    expect(() => assertStandings(changed, tiebreak.expectedStandings)).toThrow(/difference: expected 16, observed 18/);
  });

  it("rejects differential as the primary ranking key", () => {
    const changed = [...tiebreak.expectedStandings].sort((a, b) => b.difference - a.difference || b.matchPoints - a.matchPoints);
    expect(() => assertStandings(changed, tiebreak.expectedStandings)).toThrow(/points before adjusted differential/);
  });

  it("rejects separate ranks assigned to an exact competitive tie", () => {
    const changed = structuredClone(tiebreak.expectedStandings); changed[4]!.rank = 5;
    expect(() => assertStandings(changed, tiebreak.expectedStandings)).toThrow(/rank: expected 4, observed 5/);
  });

  it("excludes a pending or disputed result and detects evidence that includes it", () => {
    const first = tiebreak.rounds[0]!.matches[0]!;
    const expected = calculateStandings(tiebreak.players, [], config);
    for (const status of ["awaiting_confirmation", "disputed"] as const) assertStandings(calculateStandings(tiebreak.players, [{...first, status}], config), expected);
    const incorrect = calculateStandings(tiebreak.players, [first], config);
    expect(() => assertStandings(incorrect, expected)).toThrow(/Standings/);
    expect(incorrect.find(row => row.entrantId === first.player1Id)).toMatchObject({matchPoints: 1, difference: 2});
  });

  it.each([mixed, tiebreak])("freezes a correction that reorders equal-point players without altering WDL in $id", fixture => {
    const matches = structuredClone(fixture.rounds.flatMap(round => round.matches));
    const correction = fixture.correction; const match = matches[(correction.roundNumber - 1) * 10 + correction.matchIndex]!;
    const priorOutcome = calculateScore(match, config).points1; Object.assign(match, correction.score);
    expect(calculateScore(match, config).points1).toBe(priorOutcome);
    const expected = calculateStandings(fixture.players, matches, config); assertStandings(correction.expectedStandings, expected);
    for (const original of fixture.expectedStandings) expect(expected.find(row => row.entrantId === original.entrantId)).toMatchObject({matchPoints: original.matchPoints, wins: original.wins, draws: original.draws, losses: original.losses});
    expect(expected.find(row => row.entrantId === correction.witness.afterFirstId)!.rank).toBeLessThan(expected.find(row => row.entrantId === correction.witness.beforeFirstId)!.rank);
  });

  it("rejects duplicated assignments, repeat opponents and a legal but worse score gap", () => {
    const players: ReferencePlayer[] = ["a", "b", "c", "d"].map((id, seed) => ({id, name: id, seed, active: true}));
    const prior: ReferenceMatch[] = [{player1Id: "a", player2Id: "c", raw1: 400, raw2: 350, overtime1: 0, overtime2: 0}, {player1Id: "b", player2Id: "d", raw1: 390, raw2: 340, overtime1: 0, overtime2: 0}];
    expect(() => pairingEvidence(players, [], [{player1Id: "a", player2Id: "b"}, {player1Id: "a", player2Id: "c"}], config)).toThrow(/exactly once/);
    expect(() => pairingEvidence(players, [{number: 1, matches: prior}], prior, config)).toThrow(/Repeated opponent/);
    expect(() => pairingEvidence(players, [{number: 1, matches: prior}], [{player1Id: "a", player2Id: "d"}, {player1Id: "b", player2Id: "c"}], config)).toThrow(/differs from independent minimum/);
    expect(pairingEvidence(players, [{number: 1, matches: prior}], [{player1Id: "a", player2Id: "b"}, {player1Id: "c", player2Id: "d"}], config)).toMatchObject({actualGap: 0, minimumGap: 0});
  });

  it("detects fixture tampering before use and missing witnesses without vacuous success", () => {
    const changed = structuredClone(tiebreak); changed.rounds[0]!.matches[0]!.raw1++;
    expect(() => verifyFixture(changed)).toThrow(/hash mismatch/);
    const noWitness = structuredClone(mixed); noWitness.id = "tiebreak-incomplete"; noWitness.fixtureHash = fixtureHash(noWitness);
    expect(() => verifyFixture(noWitness)).toThrow(/missing required witness TB-03/);
  });
});
