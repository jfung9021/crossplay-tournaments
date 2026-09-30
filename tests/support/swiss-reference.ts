import { createHash } from "node:crypto";

// Deliberately independent: no production scoring, standings, pairing or graph helpers.
export interface ReferencePlayer { id: string; name: string; seed: number; active: boolean }
export interface ReferenceConfig { roundCount: number | null; penaltyIntervalSeconds: number; penaltyPoints: number; timeLimitSeconds: number | null }
export interface ReferenceMatch {
  player1Id: string; player2Id: string; raw1: number; raw2: number; overtime1: number; overtime2: number;
  status?: "final" | "awaiting_confirmation" | "disputed"; roundNumber?: number; tableNumber?: number;
}
export interface ReferenceStanding {
  entrantId: string; name: string; rank: number; matchPoints: number; pointUnits: number; difference: number;
  rawDifference: number; totalRaw: number; wins: number; draws: number; losses: number; played: number; active: boolean; opponentPoints: number;
}
export interface Witness { id: string; playerIds: string[]; explanation: string; values: Record<string, number | string> }
export interface PairingEvidence {
  legal: true; optimal: true; actualGap: number; actualFloat: number; minimumGap: number; minimumFloat: number; checkedMasks: number;
  players: { id: string; pointUnits: number; previousOpponents: string[]; upFloats: number; downFloats: number; lastFloat: number }[];
  pairs: { player1Id: string; player2Id: string; gap: number; floatCost: number }[];
}
export interface FixtureRound { number: number; matches: ReferenceMatch[]; expectedStandings: ReferenceStanding[]; pairingEvidence: PairingEvidence }
export interface Fixture {
  id: string; title: string; createRequestId: string; rosterRequestId: string; seed: string; fixtureHash: string;
  config: ReferenceConfig; players: ReferencePlayer[]; rounds: FixtureRound[]; expectedStandings: ReferenceStanding[];
  witnesses: Witness[]; profile: ReturnType<typeof profileFixture>;
  correction: { roundNumber: number; matchIndex: number; score: {raw1: number; raw2: number; overtime1: number; overtime2: number}; expectedStandings: ReferenceStanding[]; witness: {beforeFirstId: string; afterFirstId: string} };
}

export function calculateScore(input: Pick<ReferenceMatch, "raw1" | "raw2" | "overtime1" | "overtime2">, config: ReferenceConfig) {
  if (!Number.isInteger(config.penaltyIntervalSeconds) || config.penaltyIntervalSeconds < 1 || !Number.isInteger(config.penaltyPoints) || config.penaltyPoints < 0) throw new Error("Reference penalty configuration is invalid");
  for (const field of ["raw1", "raw2", "overtime1", "overtime2"] as const) {
    if (!Number.isSafeInteger(input[field]) || (field.startsWith("overtime") && input[field] < 0)) throw new Error(`Reference ${field} is invalid`);
  }
  const deduction1 = Math.trunc(input.overtime1 / config.penaltyIntervalSeconds) * config.penaltyPoints;
  const deduction2 = Math.trunc(input.overtime2 / config.penaltyIntervalSeconds) * config.penaltyPoints;
  const adjusted1 = input.raw1 - deduction1;
  const adjusted2 = input.raw2 - deduction2;
  const difference1 = adjusted1 - adjusted2;
  const points1 = adjusted1 > adjusted2 ? 2 : adjusted1 < adjusted2 ? 0 : 1;
  return { raw1: input.raw1, raw2: input.raw2, overtime1: input.overtime1, overtime2: input.overtime2, deduction1, deduction2, adjusted1, adjusted2, difference1, points1, points2: 2 - points1 };
}

export function calculateStandings(players: readonly ReferencePlayer[], matches: readonly ReferenceMatch[], config: ReferenceConfig): ReferenceStanding[] {
  const rows = new Map(players.map(player => [player.id, {entrantId: player.id, name: player.name, rank: 0, matchPoints: 0, pointUnits: 0, difference: 0, rawDifference: 0, totalRaw: 0, wins: 0, draws: 0, losses: 0, played: 0, active: player.active, opponentPoints: 0}]));
  const official = matches.filter(match => !match.status || match.status === "final");
  for (const match of official) {
    const score = calculateScore(match, config);
    const a = rows.get(match.player1Id); const b = rows.get(match.player2Id);
    if (!a || !b || a === b) throw new Error("Reference ledger has an unknown player or self pairing");
    for (const [row, units, difference, rawDifference, raw] of [[a, score.points1, score.difference1, match.raw1 - match.raw2, match.raw1], [b, score.points2, -score.difference1, match.raw2 - match.raw1, match.raw2]] as const) {
      row.pointUnits += units; row.difference += difference; row.rawDifference += rawDifference; row.totalRaw += raw; row.played++;
      if (units === 2) row.wins++; else if (units === 1) row.draws++; else row.losses++;
    }
  }
  for (const match of official) {
    rows.get(match.player1Id)!.opponentPoints += rows.get(match.player2Id)!.pointUnits / 2;
    rows.get(match.player2Id)!.opponentPoints += rows.get(match.player1Id)!.pointUnits / 2;
  }
  const seeds = new Map(players.map(player => [player.id, player.seed]));
  const result: ReferenceStanding[] = [...rows.values()].sort((a, b) => b.pointUnits - a.pointUnits || b.difference - a.difference || seeds.get(a.entrantId)! - seeds.get(b.entrantId)! || a.entrantId.localeCompare(b.entrantId));
  result.forEach((row, index) => {
    row.matchPoints = row.pointUnits / 2;
    const previous = result[index - 1];
    row.rank = previous && previous.pointUnits === row.pointUnits && previous.difference === row.difference ? previous.rank : index + 1;
  });
  return result;
}

export function assertStandings(actual: readonly { entrantId: string; name?: string; rank: number; matchPoints: number; difference: number; wins?: number; draws?: number; losses?: number; played?: number; active?: boolean }[], expected: readonly ReferenceStanding[]): void {
  if (actual.length !== expected.length) throw new Error(`Standings row count: expected ${expected.length}, observed ${actual.length}`);
  for (const [index, target] of expected.entries()) {
    const row = actual[index]!;
    if (row.entrantId !== target.entrantId) throw new Error(`Standings order at row ${index + 1}: expected ${target.entrantId}, observed ${row.entrantId}; points before adjusted differential`);
    for (const key of ["rank", "matchPoints", "difference", "wins", "draws", "losses", "played", "active", "name"] as const) {
      if (row[key] !== undefined && row[key] !== target[key]) throw new Error(`Standings ${target.entrantId} ${key}: expected ${target[key]}, observed ${row[key]}`);
    }
  }
}

const pairKey = (a: string, b: string) => [a, b].sort().join(":");
export function pairingEvidence(players: readonly ReferencePlayer[], priorRounds: readonly Pick<FixtureRound, "number" | "matches">[], chosenPairs: readonly {player1Id: string; player2Id: string | null}[], config: ReferenceConfig): PairingEvidence {
  if (players.length > 20 || players.length % 2 || players.some(player => !player.active)) throw new Error("This independent matcher is bounded to even, fully active fields of at most 20 players");
  const states = players.map(player => ({id: player.id, pointUnits: 0, previousOpponents: [] as string[], upFloats: 0, downFloats: 0, lastFloat: 0}));
  const byId = new Map(states.map(state => [state.id, state]));
  const previousPairs = new Set<string>();
  for (const round of [...priorRounds].sort((a, b) => a.number - b.number)) {
    const additions: [typeof states[number], number][] = [];
    for (const match of round.matches) {
      if (match.status && match.status !== "final") throw new Error("Pairing history contains a nonofficial result");
      const a = byId.get(match.player1Id)!; const b = byId.get(match.player2Id)!;
      if (!a || !b || a === b) throw new Error("Invalid previous pairing");
      const key = pairKey(a.id, b.id);
      if (previousPairs.has(key)) throw new Error(`Previous opponent repeated: ${key}`);
      previousPairs.add(key); a.previousOpponents.push(b.id); b.previousOpponents.push(a.id);
      for (const [state, other] of [[a, b], [b, a]]) {
        state!.lastFloat = Math.sign(other!.pointUnits - state!.pointUnits);
        if (state!.lastFloat === 1) state!.upFloats++;
        if (state!.lastFloat === -1) state!.downFloats++;
      }
      const score = calculateScore(match, config); additions.push([a, score.points1], [b, score.points2]);
    }
    for (const [state, points] of additions) state.pointUnits += points;
  }
  const cost = (i: number, j: number): [number, number] => {
    const a = states[i]!; const b = states[j]!;
    const gap = Math.abs(a.pointUnits - b.pointUnits);
    let float = 0;
    for (const [state, other] of [[a, b], [b, a]]) {
      const direction = Math.sign(other!.pointUnits - state!.pointUnits);
      if (direction) float += 2 * Math.min(direction === 1 ? state!.upFloats : state!.downFloats, 3) + (state!.lastFloat === direction ? 2 : 0);
    }
    return [gap, float];
  };
  const costs = states.map((a, i) => states.map((b, j) => i === j || previousPairs.has(pairKey(a.id, b.id)) ? null : cost(i, j)));
  const gaps = new Float64Array(1 << states.length).fill(-1); const floats = new Float64Array(1 << states.length).fill(-1);
  gaps[0] = 0; floats[0] = 0; let checkedMasks = 0;
  function minimum(mask: number): [number, number] {
    if (gaps[mask] !== -1) return [gaps[mask]!, floats[mask]!];
    checkedMasks++;
    const firstBit = mask & -mask; const first = 31 - Math.clz32(firstBit); const rest = mask ^ firstBit;
    let bestGap = Infinity; let bestFloat = Infinity;
    for (let candidates = rest; candidates; candidates &= candidates - 1) {
      const bit = candidates & -candidates; const second = 31 - Math.clz32(bit); const edge = costs[first]![second];
      if (!edge) continue;
      const next = minimum(rest ^ bit); const gap = next[0] + edge[0]; const float = next[1] + edge[1];
      if (gap < bestGap || (gap === bestGap && float < bestFloat)) { bestGap = gap; bestFloat = float; }
    }
    gaps[mask] = bestGap; floats[mask] = bestFloat; return [bestGap, bestFloat];
  }
  const [minimumGap, minimumFloat] = minimum((1 << states.length) - 1);
  if (!Number.isFinite(minimumGap)) throw new Error("No legal perfect matching exists");
  const seen = new Set<string>(); let actualGap = 0; let actualFloat = 0;
  const pairs = chosenPairs.map(pair => {
    const i = states.findIndex(state => state.id === pair.player1Id); const j = states.findIndex(state => state.id === pair.player2Id);
    if (i < 0 || j < 0 || i === j || seen.has(pair.player1Id) || seen.has(pair.player2Id!)) throw new Error("Pairing must cover each active player exactly once with no bye");
    const edge = costs[i]![j]; if (!edge) throw new Error(`Repeated opponent: ${pairKey(pair.player1Id, pair.player2Id!)}`);
    seen.add(pair.player1Id); seen.add(pair.player2Id!); actualGap += edge[0]; actualFloat += edge[1];
    return {player1Id: pair.player1Id, player2Id: pair.player2Id!, gap: edge[0], floatCost: edge[1]};
  });
  if (seen.size !== players.length) throw new Error("Pairing omits active players");
  if (actualGap !== minimumGap || actualFloat !== minimumFloat) throw new Error(`Pairing cost (${actualGap}, ${actualFloat}) differs from independent minimum (${minimumGap}, ${minimumFloat})`);
  return {legal: true, optimal: true, minimumGap, minimumFloat, actualGap, actualFloat, checkedMasks, players: states, pairs};
}

export function profileFixture(matches: readonly ReferenceMatch[], config: ReferenceConfig) {
  const scores = matches.flatMap(match => [match.raw1, match.raw2]); const overtime = matches.flatMap(match => [match.overtime1, match.overtime2]);
  const results = matches.map(match => calculateScore(match, config));
  return {scoreCount: scores.length, minimumRaw: Math.min(...scores), maximumRaw: Math.max(...scores), withinTypicalRange: scores.every(score => score >= 300 && score <= 450), scoreBands: {below340: scores.filter(score => score < 340).length, middle340To410: scores.filter(score => score >= 340 && score <= 410).length, above410: scores.filter(score => score > 410).length}, uniqueRawScores: new Set(scores).size, adjustedMargins: {draw: results.filter(score => score.difference1 === 0).length, narrow1To10: results.filter(score => Math.abs(score.difference1) >= 1 && Math.abs(score.difference1) <= 10).length, moderate11To49: results.filter(score => Math.abs(score.difference1) >= 11 && Math.abs(score.difference1) <= 49).length, large50Plus: results.filter(score => Math.abs(score.difference1) >= 50).length}, zeroOvertime: overtime.filter(value => !value).length, nonzeroOvertime: overtime.filter(value => value > 0).length, maximumOvertime: Math.max(...overtime), overtimeValues: [...new Set(overtime)].sort((a, b) => a - b), bothPlayersOvertime: matches.filter(match => match.overtime1 > 0 && match.overtime2 > 0).length, naturalDraws: matches.filter((match, index) => match.raw1 === match.raw2 && results[index]!.difference1 === 0).length, overtimeDraws: matches.filter((match, index) => match.raw1 !== match.raw2 && results[index]!.difference1 === 0).length, overtimeReversals: matches.filter((match, index) => Math.sign(match.raw1 - match.raw2) * Math.sign(results[index]!.difference1) === -1).length};
}

export function findWitnesses(players: readonly ReferencePlayer[], matches: readonly ReferenceMatch[], config: ReferenceConfig): Witness[] {
  const rows = calculateStandings(players, matches, config); const witnesses: Witness[] = [];
  const add = (id: string, predicate: (a: ReferenceStanding, b: ReferenceStanding) => boolean, explanation: string) => {
    for (const a of rows) for (const b of rows) if (a !== b && predicate(a, b)) {
      witnesses.push({id, playerIds: [a.entrantId, b.entrantId], explanation, values: {pointsA: a.matchPoints, pointsB: b.matchPoints, differenceA: a.difference, differenceB: b.difference, rawDifferenceA: a.rawDifference, rawDifferenceB: b.rawDifference, rankA: a.rank, rankB: b.rank, totalRawA: a.totalRaw, totalRawB: b.totalRaw, opponentPointsA: a.opponentPoints, opponentPointsB: b.opponentPoints}}); return;
    }
  };
  add("TB-01", (a, b) => a.pointUnits === b.pointUnits && a.difference > b.difference, "Equal match points: higher cumulative adjusted differential ranks first.");
  add("TB-02", (a, b) => a.pointUnits > b.pointUnits && a.difference < b.difference, "Match points take priority over differential.");
  add("TB-03", (a, b) => a.pointUnits === b.pointUnits && a.difference === b.difference && a.totalRaw !== b.totalRaw, "Equal match points and differential share competition rank despite different raw totals, names and seeds.");
  add("TB-04", (a, b) => a.pointUnits === b.pointUnits && a.difference < 0 && b.difference < a.difference, "Two negative differentials are ordered numerically, with the less negative first.");
  add("TB-05", (a, b) => a.pointUnits === b.pointUnits && a.difference > b.difference && a.rawDifference < b.rawDifference, "Overtime-adjusted differential reverses the raw-differential order.");
  const margins = (id: string) => matches.filter(match => match.player1Id === id || match.player2Id === id).map(match => calculateScore(match, config).difference1 * (match.player1Id === id ? 1 : -1));
  add("TB-06", (a, b) => {
    const am = margins(a.entrantId); const bm = margins(b.entrantId);
    return a.pointUnits < b.pointUnits && a.difference > b.difference && am.some(margin => margin >= 60) && am.filter(margin => margin < 0).length >= 2 && am.filter(margin => margin < 0).every(margin => margin >= -15) && bm.filter(margin => margin > 0).length >= 3 && bm.filter(margin => margin > 0).every(margin => margin <= 25);
  }, "A large win and narrow losses accumulate, but several narrow wins still earn higher match-point priority.");
  add("TB-09", (a, b) => a.pointUnits === b.pointUnits && a.difference === b.difference && a.opponentPoints !== b.opponentPoints && matches.some(match => ((match.player1Id === a.entrantId && match.player2Id === b.entrantId) || (match.player2Id === a.entrantId && match.player1Id === b.entrantId)) && calculateScore(match, config).difference1 !== 0), "An exact standings tie includes a decisive head-to-head result and different opponent points; neither separates the rank.");
  return witnesses;
}

export function fixtureHash(fixture: Omit<Fixture, "fixtureHash"> | Fixture): string {
  const value = {...fixture} as Partial<Fixture>; delete value.fixtureHash;
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function verifyFixture(fixture: Fixture): void {
  if (fixtureHash(fixture) !== fixture.fixtureHash) throw new Error("Frozen fixture hash mismatch");
  if (fixture.players.length !== 20 || fixture.rounds.length !== 6 || fixture.rounds.some(round => round.matches.length !== 10)) throw new Error("Fixture must contain 20 players, six rounds and ten matches per round");
  const matches = fixture.rounds.flatMap(round => round.matches); const profile = profileFixture(matches, fixture.config);
  if (!profile.withinTypicalRange || profile.scoreCount !== 120 || profile.zeroOvertime <= profile.nonzeroOvertime || profile.scoreBands.middle340To410 <= 60 || profile.uniqueRawScores < 30 || !profile.scoreBands.below340 || !profile.scoreBands.above410 || !profile.naturalDraws || !profile.overtimeReversals || !profile.overtimeDraws) throw new Error("Fixture lacks required realistic score/ overtime variation");
  if (JSON.stringify(profile) !== JSON.stringify(fixture.profile)) throw new Error("Fixture profile mismatch");
  for (const seconds of [9, 10, 11, 19, 20]) if (!profile.overtimeValues.includes(seconds)) throw new Error(`Fixture lacks ${seconds}s overtime boundary`);
  for (const [index, round] of fixture.rounds.entries()) {
    const expected = calculateStandings(fixture.players, fixture.rounds.slice(0, index + 1).flatMap(item => item.matches), fixture.config);
    assertStandings(round.expectedStandings, expected);
    const evidence = pairingEvidence(fixture.players, fixture.rounds.slice(0, index), round.matches, fixture.config);
    if (JSON.stringify(evidence) !== JSON.stringify(round.pairingEvidence)) throw new Error(`Round ${round.number} frozen pairing evidence differs`);
  }
  const standings = calculateStandings(fixture.players, matches, fixture.config); assertStandings(fixture.expectedStandings, standings);
  if (standings.some(row => row.played !== 6 || row.wins + row.draws + row.losses !== 6) || standings.reduce((sum, row) => sum + row.matchPoints, 0) !== 60 || standings.reduce((sum, row) => sum + row.difference, 0) !== 0) throw new Error("Fixture conservation or six-result invariant failed");
  if (fixture.id.startsWith("tiebreak")) {
    const witnesses = findWitnesses(fixture.players, matches, fixture.config);
    for (const id of ["TB-01", "TB-02", "TB-03", "TB-04", "TB-05", "TB-06", "TB-09"]) if (!witnesses.some(witness => witness.id === id)) throw new Error(`Fixture is missing required witness ${id}`);
    if (JSON.stringify(witnesses) !== JSON.stringify(fixture.witnesses)) throw new Error("Frozen tiebreak witness values differ");
  }
}
