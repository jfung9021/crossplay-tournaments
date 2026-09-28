import blossom from "edmonds-blossom-fixed";
import { MAX_PLAYERS } from "./roster";
import type { Entrant, Match, PairingInput, PairingOutput, Round } from "./types";

export const PAIRING_ENGINE_VERSION = "crossplay-swiss-1.0.0/blossom-1.0.1";
const MAX_FLOAT_EDGE_COST = 16;

export class PairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PairingError";
  }
}

interface PlayerState {
  entrant: Entrant;
  points: number;
  opponents: Set<string>;
  byeIneligible: boolean;
  upFloats: number;
  downFloats: number;
  lastFloat: -1 | 0 | 1;
}

interface CostEdge {
  a: number;
  b: number;
  cost: number;
}

export interface PairingGraph {
  /** Canonical vertex order; the final vertex is the bye when one is needed. */
  playerIds: string[];
  vertexCount: number;
  edges: CostEdge[];
  maxMatchingCost: number;
  byePointGroup: number | null;
}

function hash(value: string): number {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 16_777_619);
  }
  return result >>> 0;
}

function stringCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function publishedRounds(input: PairingInput): Round[] {
  const rounds = input.rounds.filter((round) => round.status !== "draft").sort((a, b) => a.number - b.number);
  if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1 || input.roundNumber > 255 ||
      input.roundNumber !== (rounds.at(-1)?.number ?? 0) + 1) {
    throw new PairingError("Generate the next scheduled round in order.");
  }
  if (rounds.some((round) => round.matches.some((match) => match.status !== "final" || !match.result))) {
    throw new PairingError("Resolve every match in the current round before creating the next round.");
  }
  return rounds;
}

function statesFromHistory(input: PairingInput): PlayerState[] {
  if (input.entrants.length > MAX_PLAYERS) throw new PairingError(`A tournament supports at most ${MAX_PLAYERS} players.`);
  const states = new Map<string, PlayerState>();
  for (const entrant of input.entrants) {
    if (states.has(entrant.id)) throw new PairingError("The roster contains a duplicate player ID.");
    states.set(entrant.id, { entrant, points: 0, opponents: new Set(), byeIneligible: false, upFloats: 0, downFloats: 0, lastFloat: 0 });
  }
  for (const round of publishedRounds(input)) {
    const assigned = new Set<string>();
    const completed: { state: PlayerState; points: number }[] = [];
    for (const match of round.matches) {
      const first = states.get(match.player1Id);
      const second = match.player2Id ? states.get(match.player2Id) : undefined;
      if (!first || (match.player2Id && !second)) throw new PairingError("A previous round contains a player outside the roster.");
      for (const side of [first, second]) {
        if (!side) continue;
        if (assigned.has(side.entrant.id)) throw new PairingError("A previous round assigns the same player twice.");
        assigned.add(side.entrant.id);
      }
      if (second) {
        first.opponents.add(second.entrant.id);
        second.opponents.add(first.entrant.id);
        recordFloat(first, second.points);
        recordFloat(second, first.points);
      } else {
        first.lastFloat = 0;
      }
      recordAdministrativeWin(first, match, match.result!.points1);
      completed.push({ state: first, points: match.result!.points1 });
      if (second) {
        recordAdministrativeWin(second, match, match.result!.points2);
        completed.push({ state: second, points: match.result!.points2 });
      }
    }
    for (const result of completed) result.state.points += result.points;
  }
  return [...states.values()].filter((state) => state.entrant.active).sort((a, b) =>
    a.entrant.seed - b.entrant.seed ||
    hash(`${input.seed}:${a.entrant.id}`) - hash(`${input.seed}:${b.entrant.id}`) ||
    stringCompare(a.entrant.id, b.entrant.id));
}

function recordFloat(state: PlayerState, opponentPoints: number): void {
  state.lastFloat = state.points < opponentPoints ? 1 : state.points > opponentPoints ? -1 : 0;
  if (state.lastFloat === 1) state.upFloats += 1;
  if (state.lastFloat === -1) state.downFloats += 1;
}

function recordAdministrativeWin(state: PlayerState, match: Match, points: number): void {
  if (match.kind === "bye" || (match.kind !== "played" && points === 2)) state.byeIneligible = true;
}

function floatCost(state: PlayerState, opponentPoints: number): number {
  const direction = state.points < opponentPoints ? 1 : state.points > opponentPoints ? -1 : 0;
  if (!direction) return 0;
  const count = direction === 1 ? state.upFloats : state.downFloats;
  return Math.min(count, 3) * 2 + (state.lastFloat === direction ? 2 : 0);
}

/**
 * Builds candidate graphs for the first feasible eligible bye score group.
 * Costs are lexicographic over the WHOLE matching: total score gap, then
 * bounded repeat-float cost, then seeded order. Floats cap at three previous
 * occurrences, plus a last-round repeat penalty. This keeps all solver dual
 * arithmetic safely integral even for the 256-player / 255-round bounds.
 * Public for independent solver-oracle verification; application uses generatePairings.
 */
export function buildPairingGraphs(input: PairingInput): PairingGraph[] {
  const states = statesFromHistory(input);
  if (states.length < 2) throw new PairingError("At least two active players are needed. Correct attendance or finish the tournament early.");
  const odd = states.length % 2 === 1;
  const vertexCount = states.length + (odd ? 1 : 0);
  const pairCount = vertexCount / 2;
  const maxSeedEdgeCost = vertexCount * vertexCount - 1;
  const maxSeedMatchingCost = pairCount * maxSeedEdgeCost;
  const floatMultiplier = maxSeedMatchingCost + 1;
  const gapMultiplier = pairCount * MAX_FLOAT_EDGE_COST * floatMultiplier + maxSeedMatchingCost + 1;
  const maxGap = Math.max(...states.map((state) => state.points)) - Math.min(...states.map((state) => state.points));
  const maxMatchingCost = pairCount * maxGap * gapMultiplier + pairCount * MAX_FLOAT_EDGE_COST * floatMultiplier + maxSeedMatchingCost;
  // Blossom uses doubled dual quantities. Retain a further factor-of-two margin.
  if (!Number.isSafeInteger(maxMatchingCost) || maxMatchingCost > Number.MAX_SAFE_INTEGER / 4) {
    throw new PairingError("Pairing costs exceed the verified numeric limits.");
  }
  const opponentEdges: CostEdge[] = [];
  for (let a = 0; a < states.length; a += 1) {
    for (let b = a + 1; b < states.length; b += 1) {
      const first = states[a]!;
      const second = states[b]!;
      if (first.opponents.has(second.entrant.id)) continue;
      const gap = Math.abs(first.points - second.points);
      const floats = floatCost(first, second.points) + floatCost(second, first.points);
      const seeded = (b - a) * vertexCount + hash(`${input.seed}:${first.entrant.id}:${second.entrant.id}`) % vertexCount;
      opponentEdges.push({ a, b, cost: gap * gapMultiplier + floats * floatMultiplier + seeded });
    }
  }
  const byeGroups: (number | null)[] = odd
    ? [...new Set(states.filter((state) => !state.byeIneligible).map((state) => state.points))].sort((a, b) => a - b)
    : [null];
  if (!byeGroups.length) throw new PairingError("No active player is eligible for a bye: each has already received an unplayed win. Correct attendance or finish early.");
  return byeGroups.map((byePointGroup) => {
    const edges = [...opponentEdges];
    if (odd) {
      states.forEach((state, index) => {
        if (!state.byeIneligible && state.points === byePointGroup) {
          edges.push({ a: index, b: states.length, cost: hash(`${input.seed}:bye:${state.entrant.id}`) % vertexCount });
        }
      });
    }
    return { playerIds: states.map((state) => state.entrant.id), vertexCount, edges, maxMatchingCost, byePointGroup };
  });
}

function solveGraph(graph: PairingGraph): number[] | null {
  if (!graph.edges.length) return null;
  const maxEdgeCost = Math.max(...graph.edges.map((edge) => edge.cost));
  const mate = blossom(graph.edges.map((edge) => [edge.a, edge.b, maxEdgeCost - edge.cost + 1]), true);
  // The package derives vertex count from edges, so verify the expected count
  // separately; an isolated last vertex must never silently disappear.
  if (mate.length !== graph.vertexCount) return null;
  const legal = new Set(graph.edges.map((edge) => `${edge.a}:${edge.b}`));
  for (let index = 0; index < graph.vertexCount; index += 1) {
    const other = mate[index];
    if (other === undefined || other < 0 || other >= graph.vertexCount || other === index ||
        mate[other] !== index || !legal.has(`${Math.min(index, other)}:${Math.max(index, other)}`)) return null;
  }
  return mate;
}

export function generatePairings(input: PairingInput): PairingOutput {
  for (const graph of buildPairingGraphs(input)) {
    const mate = solveGraph(graph);
    if (!mate) continue;
    const pairs: PairingOutput["pairs"] = [];
    for (let index = 0; index < graph.playerIds.length; index += 1) {
      const other = mate[index]!;
      if (index < other) pairs.push({ player1Id: graph.playerIds[index]!, player2Id: graph.playerIds[other] ?? null });
    }
    return { pairs, engineVersion: PAIRING_ENGINE_VERSION };
  }
  throw new PairingError("No complete round is possible without repeat opponents or an ineligible bye. Correct attendance or finish the tournament early.");
}
