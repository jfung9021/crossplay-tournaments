import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { generatePairings } from "../src/domain/pairing";
import type { Round } from "../src/domain/types";
import { calculateScore, calculateStandings, findWitnesses, fixtureHash, pairingEvidence, profileFixture, verifyFixture, type Fixture, type ReferenceMatch, type ReferencePlayer } from "../tests/support/swiss-reference";

// Discovery may use the real engine. Frozen arithmetic and optimum checks use only the independent reference.
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const uuid = (text: string) => { const hex = hash(text); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`; };
const names = ["Morgan Vale", "Alex Rowan", "Samira Holt", "Theo Bennett", "Priya Marsh", "Elliot Park", "Nadia Wells", "Jules Avery", "Robin Calder", "Casey Flynn", "Maya Linden", "Owen Brooks", "Lena Mercer", "Arun Ellis", "Quinn Hale", "Tessa Reed", "Noah Finch", "Iris Morgan", "Dylan Shaw", "Cleo Hart"];
const config = {roundCount: 6, penaltyIntervalSeconds: 10, penaltyPoints: 2, timeLimitSeconds: null};
function random(seed: number) { let value = seed; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; }; }
function asRound(number: number, matches: ReferenceMatch[]): Round {
  return {id: `round-${number}`, number, status: "completed", engineVersion: "fixture-discovery", inputHash: "fixture-discovery", matches: matches.map((match, index) => ({id: `r${number}-m${index + 1}`, roundNumber: number, tableNumber: index + 1, player1Id: match.player1Id, player2Id: match.player2Id, kind: "played", status: "final", revision: 1, report: null, result: calculateScore(match, config)}))};
}
function setMargin(match: ReferenceMatch, margin: number): boolean {
  const d1 = Math.trunc(match.overtime1 / 10) * 2; const d2 = Math.trunc(match.overtime2 / 10) * 2;
  const rawGap = margin + d1 - d2;
  if (Math.abs(rawGap) > 150) return false;
  let raw2 = Math.round((match.raw1 + match.raw2 - rawGap) / 2); let raw1 = raw2 + rawGap;
  const shift = Math.max(0, 300 - Math.min(raw1, raw2)) - Math.max(0, Math.max(raw1, raw2) - 450);
  raw1 += shift; raw2 += shift;
  match.raw1 = raw1; match.raw2 = raw2; return true;
}
function marginFor(match: ReferenceMatch, id: string) { return calculateScore(match, config).difference1 * (match.player1Id === id ? 1 : -1); }
function includes(match: ReferenceMatch, id: string) { return match.player1Id === id || match.player2Id === id; }
function adjustDifference(players: ReferencePlayer[], matches: ReferenceMatch[], id: string, target: number, protectedMatches: Set<number>, excludedId?: string): boolean {
  let delta = target - calculateStandings(players, matches, config).find(row => row.entrantId === id)!.difference;
  for (const [index, match] of matches.entries()) {
    if (!delta) break;
    if (!includes(match, id) || protectedMatches.has(index) || (excludedId && includes(match, excludedId))) continue;
    const current = marginFor(match, id); if (!current) continue;
    const minimum = current > 0 ? 1 : -110; const maximum = current > 0 ? 110 : -1;
    const change = Math.max(minimum - current, Math.min(maximum - current, delta));
    if (setMargin(match, (current + change) * (match.player1Id === id ? 1 : -1))) delta -= change;
  }
  return delta === 0;
}

function shapeWitnesses(players: ReferencePlayer[], source: ReferenceMatch[]): ReferenceMatch[] | null {
  const initial = calculateStandings(players, source, config);
  // Preserve the first-round hand-calculated overtime examples throughout discovery.
  for (const largePlayer of initial.filter(row => row.wins >= 1 && row.losses >= 2 && row.pointUnits <= 5)) {
    const largeMatch = source.findIndex((match, index) => index >= 10 && includes(match, largePlayer.entrantId) && marginFor(match, largePlayer.entrantId) > 0);
    if (largeMatch < 0) continue;
    for (const narrowPlayer of initial.filter(row => row.wins >= 3 && row.pointUnits > largePlayer.pointUnits && !includes(source[largeMatch]!, row.entrantId))) {
      let matches = structuredClone(source);
      const protectedMatches = new Set(Array.from({length: 6}, (_, i) => i));
      let compatible = true;
      for (const [index, match] of matches.entries()) {
        if (includes(match, largePlayer.entrantId)) {
          const margin = marginFor(match, largePlayer.entrantId); const desired = margin > 0 ? (index === largeMatch ? 95 : 5) : margin < 0 ? -4 : 0;
          if (index < 6 && desired !== margin) { compatible = false; break; }
          setMargin(match, desired * (match.player1Id === largePlayer.entrantId ? 1 : -1)); protectedMatches.add(index);
        }
        if (includes(match, narrowPlayer.entrantId) && marginFor(match, narrowPlayer.entrantId) > 0) {
          if (!includes(match, largePlayer.entrantId)) {
            if (index < 6) { compatible = false; break; }
            setMargin(match, 8 * (match.player1Id === narrowPlayer.entrantId ? 1 : -1));
          }
          protectedMatches.add(index);
        }
      }
      if (!compatible || !findWitnesses(players, matches, config).some(witness => witness.id === "TB-06")) continue;
      for (const a of initial) for (const b of initial) {
        if (a === b || [largePlayer.entrantId, narrowPlayer.entrantId].includes(a.entrantId) || [largePlayer.entrantId, narrowPlayer.entrantId].includes(b.entrantId) || a.pointUnits !== b.pointUnits || a.opponentPoints === b.opponentPoints) continue;
        if (!matches.some(match => includes(match, a.entrantId) && includes(match, b.entrantId) && calculateScore(match, config).difference1)) continue;
        const tied = structuredClone(matches);
        const target = calculateStandings(players, tied, config).find(row => row.entrantId === b.entrantId)!.difference;
        if (!adjustDifference(players, tied, a.entrantId, target, protectedMatches, b.entrantId)) continue;
        if (!findWitnesses(players, tied, config).some(witness => witness.id === "TB-09")) continue;
        const protectedTied = new Set(protectedMatches);
        tied.forEach((match, index) => { if (includes(match, a.entrantId) || includes(match, b.entrantId)) protectedTied.add(index); });
        const tiedRows = calculateStandings(players, tied, config);
        for (const high of tiedRows) for (const low of tiedRows) {
          if (high === low || high.pointUnits !== low.pointUnits || [a.entrantId, b.entrantId, largePlayer.entrantId, narrowPlayer.entrantId].includes(high.entrantId) || [a.entrantId, b.entrantId, largePlayer.entrantId, narrowPlayer.entrantId].includes(low.entrantId)) continue;
          const reversed = structuredClone(tied);
          const overtimeIndex = reversed.findIndex((match, index) => !protectedTied.has(index) && includes(match, low.entrantId) && !includes(match, high.entrantId) && !match.overtime1 && !match.overtime2);
          if (overtimeIndex < 0) continue;
          const overtimeMatch = reversed[overtimeIndex]!; const oldMargin = calculateScore(overtimeMatch, config).difference1;
          if (overtimeMatch.player1Id === low.entrantId) overtimeMatch.overtime1 = 20; else overtimeMatch.overtime2 = 20;
          setMargin(overtimeMatch, oldMargin);
          const highDifference = calculateStandings(players, reversed, config).find(row => row.entrantId === high.entrantId)!.difference;
          if (!adjustDifference(players, reversed, low.entrantId, highDifference - 1, protectedTied, high.entrantId)) continue;
          const witnesses = findWitnesses(players, reversed, config);
          if (["TB-01", "TB-02", "TB-03", "TB-04", "TB-05", "TB-06", "TB-09"].every(id => witnesses.some(witness => witness.id === id))) return reversed;
        }
      }
      matches = [];
    }
  }
  return null;
}

function correctionFor(players: ReferencePlayer[], matches: ReferenceMatch[]): Fixture["correction"] {
  const original = calculateStandings(players, matches, config);
  for (const [index, match] of matches.entries()) {
    const margin = calculateScore(match, config).difference1;
    if (!margin) continue;
    for (const amount of [1, 5, 15, 30, 70, 100]) {
      const changed = structuredClone(matches); const replacement = changed[index]!;
      if (!setMargin(replacement, Math.sign(margin) * amount)) continue;
      const after = calculateStandings(players, changed, config);
      for (const beforeA of original) for (const beforeB of original) {
        if (beforeA.pointUnits !== beforeB.pointUnits || beforeA.rank >= beforeB.rank) continue;
        const afterA = after.find(row => row.entrantId === beforeA.entrantId)!; const afterB = after.find(row => row.entrantId === beforeB.entrantId)!;
        if (afterA.rank <= afterB.rank) continue;
        return {roundNumber: Math.floor(index / 10) + 1, matchIndex: index % 10, score: {raw1: replacement.raw1, raw2: replacement.raw2, overtime1: replacement.overtime1, overtime2: replacement.overtime2}, expectedStandings: after, witness: {beforeFirstId: beforeA.entrantId, afterFirstId: beforeB.entrantId}};
      }
    }
  }
  throw new Error("No outcome-preserving differential reorder correction found");
}

function build(id: string, title: string): Fixture {
  const createRequestId = uuid(`create:${id}`); const rosterRequestId = uuid(`roster:${id}`); const seed = uuid(`seed:${createRequestId}`);
  const players = names.map((name, index) => { const id = uuid(`${rosterRequestId}:${index}`); return {id, name, seed: parseInt(hash(`${seed}:${id}`).slice(0, 7), 16), active: true}; });
  for (let attempt = 1; attempt <= 200; attempt++) {
    const next = random(attempt * 907 + (id.startsWith("mixed") ? 91 : 331)); const rounds: Round[] = []; let matches: ReferenceMatch[] = [];
    for (let roundNumber = 1; roundNumber <= 6; roundNumber++) {
      const pairs = generatePairings({entrants: players, rounds, seed, roundNumber}).pairs;
      const current: ReferenceMatch[] = pairs.map((pair, tableIndex) => {
        let raw1 = 340 + Math.floor(next() * 71); let raw2 = 340 + Math.floor(next() * 71);
        if (next() < 0.1) raw1 = raw2;
        if (next() < 0.13) raw1 = next() < 0.5 ? 300 + Math.floor(next() * 25) : 425 + Math.floor(next() * 26);
        let overtime1 = next() < 0.08 ? 1 + Math.floor(next() * 24) : 0; let overtime2 = next() < 0.06 ? 1 + Math.floor(next() * 24) : 0;
        if (roundNumber === 1 && tableIndex < 6) {
          raw1 = tableIndex === 5 ? 405 : 401; raw2 = tableIndex === 5 ? 404 : 399; overtime1 = [9, 10, 11, 19, 20, 20][tableIndex]!; overtime2 = tableIndex === 5 ? 10 : 0;
        }
        return {player1Id: pair.player1Id, player2Id: pair.player2Id!, raw1, raw2, overtime1, overtime2, roundNumber, tableNumber: tableIndex + 1};
      });
      matches.push(...current); rounds.push(asRound(roundNumber, current));
    }
    if (id.startsWith("tiebreak")) {
      const shaped = shapeWitnesses(players, matches); if (!shaped) continue; matches = shaped;
    }
    const profile = profileFixture(matches, config);
    if (!profile.naturalDraws || !profile.adjustedMargins.large50Plus || !profile.scoreBands.below340 || !profile.scoreBands.above410 || profile.scoreBands.middle340To410 <= 60) continue;
    const frozenRounds: Fixture["rounds"] = [];
    for (let number = 1; number <= 6; number++) {
      const current = matches.slice((number - 1) * 10, number * 10);
      frozenRounds.push({number, matches: current, expectedStandings: calculateStandings(players, matches.slice(0, number * 10), config), pairingEvidence: pairingEvidence(players, frozenRounds, current, config)});
    }
    const fixture: Fixture = {id, title, createRequestId, rosterRequestId, seed, fixtureHash: "", config, players, rounds: frozenRounds, expectedStandings: calculateStandings(players, matches, config), witnesses: findWitnesses(players, matches, config), profile, correction: correctionFor(players, matches)};
    fixture.fixtureHash = fixtureHash(fixture); verifyFixture(fixture);
    console.log(`${id}: frozen attempt ${attempt}; ${fixture.witnesses.map(witness => witness.id).join(", ")}; SHA-256 ${fixture.fixtureHash}`);
    return fixture;
  }
  throw new Error(`Bounded fixture discovery exhausted for ${id}`);
}

mkdirSync("tests/fixtures/swiss20", {recursive: true});
for (const [id, filename, title] of [["mixed-results-20x6-v1", "mixed-results-v1.json", "Autumn Crossplay Club Swiss"], ["tiebreak-witnesses-20x6-v1", "tiebreak-witnesses-v1.json", "Crossplay Riverside Invitational"]]) {
  const fixture = build(id!, title!);
  writeFileSync(`tests/fixtures/swiss20/${filename}`, `${JSON.stringify(fixture, null, 2)}\n`);
}
