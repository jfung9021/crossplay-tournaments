import { performance } from "node:perf_hooks";
import { generatePairings, buildPairingGraphs } from "../src/domain/pairing";
import { suggestRoundCount } from "../src/domain/roster";
import { roster, simulatedRound } from "../tests/domain/fixtures";
import type { Round } from "../src/domain/types";

const entrants = roster(256);
const rounds: Round[] = [];
const timings: number[] = [];
for (let roundNumber = 1; roundNumber <= suggestRoundCount(entrants.length); roundNumber += 1) {
  const input = { entrants, rounds, seed: "capacity-benchmark-2026", roundNumber };
  const start = performance.now();
  const output = generatePairings(input);
  const elapsed = performance.now() - start;
  timings.push(elapsed);
  const coverage = new Set(output.pairs.flatMap((pair) => [pair.player1Id, pair.player2Id]));
  if (coverage.size !== 256 || coverage.has(null)) throw new Error("Invalid benchmark pairing coverage");
  const graph = buildPairingGraphs(input)[0]!;
  console.log(JSON.stringify({ players: 256, round: roundNumber, milliseconds: Math.round(elapsed * 100) / 100, edges: graph.edges.length, maxMatchingCost: graph.maxMatchingCost, engine: output.engineVersion }));
  rounds.push(simulatedRound(roundNumber, output.pairs));
}
const total = timings.reduce((sum, value) => sum + value, 0);
console.log(JSON.stringify({ players: 256, rounds: timings.length, totalMilliseconds: Math.round(total), maxRoundMilliseconds: Math.round(Math.max(...timings)), configuredMaximum: 256 }));
