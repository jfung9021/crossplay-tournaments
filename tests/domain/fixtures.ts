import { administrativeResult, calculateScore } from "../../src/domain/scoring";
import type { Entrant, Match, OfficialResult, Pairing, Round, TournamentConfig } from "../../src/domain/types";

export const config: TournamentConfig = { roundCount: null, penaltyIntervalSeconds: 10, penaltyPoints: 2, timeLimitSeconds: null };

export function roster(count: number): Entrant[] {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `Player ${index + 1}`, seed: index, active: true }));
}

export function match(a: string, b: string | null, result?: OfficialResult, kind: Match["kind"] = b ? "played" : "bye"): Match {
  return {
    id: `${a}-${b}`, roundNumber: 1, tableNumber: 1, player1Id: a, player2Id: b, kind,
    status: "final", revision: 1, report: null,
    result: result ?? (b ? calculateScore({ raw1: 100, raw2: 100, overtime1: 0, overtime2: 0 }, config) : administrativeResult("bye")),
  };
}

export function round(number: number, matches: Match[]): Round {
  return {
    id: `round-${number}`, number, status: "completed", engineVersion: "test", inputHash: "test",
    matches: matches.map((entry, index) => ({ ...entry, id: `${number}:${entry.id}`, roundNumber: number, tableNumber: index + 1 })),
  };
}

export function simulatedRound(number: number, pairs: Pairing[]): Round {
  return round(number, pairs.map((pair, index) => match(pair.player1Id, pair.player2Id, pair.player2Id
    ? calculateScore({ raw1: 100 + ((number * 7 + index * 3) % 5), raw2: 101 + ((number + index * 2) % 5), overtime1: index % 3 * 10, overtime2: 0 }, config)
    : administrativeResult("bye"))));
}
