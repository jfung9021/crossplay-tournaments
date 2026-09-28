import { describe, expect, it } from "vitest";
import { buildPairingGraphs, generatePairings, type PairingGraph } from "../../src/domain/pairing";
import { administrativeResult } from "../../src/domain/scoring";
import { suggestRoundCount } from "../../src/domain/roster";
import type { PairingInput, Round } from "../../src/domain/types";
import { match, roster, round, simulatedRound } from "./fixtures";

function inputWithLegalEdges(count: number, legal: [number, number][], seed = "fixture"): PairingInput {
  const allowed = new Set(legal.map(([a, b]) => `${a}:${b}`));
  const rounds: Round[] = [];
  for (let a = 0; a < count; a += 1) {
    for (let b = a + 1; b < count; b += 1) {
      if (!allowed.has(`${a}:${b}`)) rounds.push(round(rounds.length + 1, [match(`p${a}`, `p${b}`, administrativeResult("double_forfeit"), "double_forfeit")]));
    }
  }
  return { entrants: roster(count), rounds, seed, roundNumber: rounds.length + 1 };
}

function bruteForceMinimum(graph: PairingGraph): number | null {
  const costs = new Map(graph.edges.map((edge) => [`${edge.a}:${edge.b}`, edge.cost]));
  function search(remaining: number[]): number {
    if (!remaining.length) return 0;
    const first = remaining[0]!;
    let best = Infinity;
    for (let index = 1; index < remaining.length; index += 1) {
      const cost = costs.get(`${first}:${remaining[index]}`);
      if (cost !== undefined) best = Math.min(best, cost + search(remaining.filter((_, current) => current !== 0 && current !== index)));
    }
    return best;
  }
  const cost = search(Array.from({ length: graph.vertexCount }, (_, index) => index));
  return Number.isFinite(cost) ? cost : null;
}

describe("complete legal Swiss pairing", () => {
  it("finds the full matching where greedy adjacent pairing gets stranded", () => {
    const output = generatePairings(inputWithLegalEdges(4, [[0, 1], [0, 2], [1, 3]]));
    expect(output.pairs).toEqual([{ player1Id: "p0", player2Id: "p2" }, { player1Id: "p1", player2Id: "p3" }]);
  });

  it("selects the bye together with opponents so an early candidate cannot strand the field", () => {
    const output = generatePairings(inputWithLegalEdges(5, [[0, 2], [3, 4]]));
    expect(output.pairs).toContainEqual({ player1Id: "p1", player2Id: null });
    expect(output.pairs).toHaveLength(3);
  });

  it("detects an isolated last vertex instead of accepting the solver's smaller graph", () => {
    expect(() => generatePairings(inputWithLegalEdges(4, [[0, 1], [1, 2]]))).toThrow(/No complete round/);
  });

  it("does not repeat byes, full-win forfeits, or forfeited opponents", () => {
    const output = generatePairings({ entrants: roster(3), rounds: [round(1, [match("p0", null), match("p1", "p2", administrativeResult("forfeit"), "forfeit")])], seed: "bye", roundNumber: 2 });
    expect(output.pairs).toContainEqual({ player1Id: "p2", player2Id: null });
    expect(output.pairs).toContainEqual({ player1Id: "p0", player2Id: "p1" });
  });

  it("refuses an extra bye when every player has already received an unplayed win", () => {
    const rounds = [round(1, [match("p0", null)]), round(2, [match("p1", null)]), round(3, [match("p2", null)])];
    expect(() => generatePairings({ entrants: roster(3), rounds, seed: "none", roundNumber: 4 })).toThrow(/No active player is eligible for a bye/);
  });

  it("prefers same-score groups", () => {
    const history = round(1, [0, 1, 2, 3].map((index) => match(`p${index}`, `p${index + 4}`, administrativeResult("forfeit"), "forfeit")));
    const output = generatePairings({ entrants: roster(8), rounds: [history], seed: "groups", roundNumber: 2 });
    for (const pair of output.pairs) expect(Number(pair.player1Id.slice(1)) < 4).toBe(Number(pair.player2Id!.slice(1)) < 4);
  });

  it("keeps the lowest feasible eligible bye group", () => {
    const history = round(1, [match("p0", "p1", administrativeResult("forfeit"), "forfeit"), match("p2", "p3"), match("p4", null)]);
    const output = generatePairings({ entrants: roster(5), rounds: [history], seed: "low-bye", roundNumber: 2 });
    expect(output.pairs).toContainEqual({ player1Id: "p1", player2Id: null });
  });

  it("avoids a repeated upward float when an equally close fresh float is available", () => {
    const entrants = roster(8);
    entrants[6]!.active = false;
    entrants[7]!.active = false;
    const rounds = [
      round(1, [match("p3", "p6", administrativeResult("forfeit"), "forfeit")]),
      round(2, [match("p0", "p3", administrativeResult("double_forfeit"), "double_forfeit")]),
      round(3, [match("p4", "p7", administrativeResult("forfeit"), "forfeit"), match("p5", "p6", administrativeResult("forfeit"), "forfeit")]),
    ];
    const output = generatePairings({ entrants, rounds, seed: "fair-float", roundNumber: 4 });
    const crossGroup = output.pairs.filter((pair) => Number(pair.player1Id.slice(1)) < 3 && Number(pair.player2Id!.slice(1)) >= 3);
    expect(crossGroup).toHaveLength(1);
    expect(crossGroup[0]!.player1Id).not.toBe("p0");
    expect(crossGroup[0]!.player2Id).not.toBe("p3");
  });

  it("rejects unresolved rounds and excludes withdrawn players", () => {
    const entrants = roster(8);
    const first = simulatedRound(1, generatePairings({ entrants, rounds: [], seed: "withdraw", roundNumber: 1 }).pairs);
    expect(() => generatePairings({ entrants, rounds: [{ ...first, matches: first.matches.map((entry) => ({ ...entry, status: "disputed" })) }], seed: "withdraw", roundNumber: 2 })).toThrow(/Resolve every match/);
    entrants[0]!.active = false;
    const output = generatePairings({ entrants, rounds: [first], seed: "withdraw", roundNumber: 2 });
    expect(output.pairs.flatMap((pair) => [pair.player1Id, pair.player2Id])).not.toContain("p0");
    expect(output.pairs.filter((pair) => pair.player2Id === null)).toHaveLength(1);
  });

  it("matches a brute-force minimum cost oracle for bounded small graphs", () => {
    let random = 192_837;
    for (let count = 2; count <= 8; count += 1) {
      for (let sample = 0; sample < 12; sample += 1) {
        const legal: [number, number][] = [];
        for (let a = 0; a < count; a += 1) for (let b = a + 1; b < count; b += 1) {
          random = Math.imul(random, 1_664_525) + 1_013_904_223 | 0;
          if ((random >>> 0) % 4 !== 0) legal.push([a, b]);
        }
        const input = inputWithLegalEdges(count, legal, `oracle-${sample}`);
        const graphs = buildPairingGraphs(input);
        const expected = graphs.map((graph) => ({ graph, cost: bruteForceMinimum(graph) })).find((entry) => entry.cost !== null);
        if (!expected) {
          expect(() => generatePairings(input)).toThrow(/No complete round/);
          continue;
        }
        const output = generatePairings(input);
        const costs = new Map(expected.graph.edges.map((edge) => [`${edge.a}:${edge.b}`, edge.cost]));
        const actual = output.pairs.reduce((total, pair) => {
          const a = expected.graph.playerIds.indexOf(pair.player1Id);
          const b = pair.player2Id === null ? expected.graph.vertexCount - 1 : expected.graph.playerIds.indexOf(pair.player2Id);
          return total + costs.get(`${Math.min(a, b)}:${Math.max(a, b)}`)!;
        }, 0);
        expect(actual).toBe(expected.cost);
        expect(generatePairings({ ...input, entrants: [...input.entrants].reverse(), rounds: [...input.rounds].reverse() })).toEqual(output);
      }
    }
  });

  it("matches the weighted oracle after scores and float history accumulate", () => {
    for (const count of [5, 6, 7, 8]) {
      const entrants = roster(count);
      const rounds: Round[] = [];
      for (let number = 1; number <= 3; number += 1) {
        const input = { entrants, rounds, seed: `weighted-oracle-${count}`, roundNumber: number };
        const expected = buildPairingGraphs(input).map((graph) => ({ graph, cost: bruteForceMinimum(graph) })).find((entry) => entry.cost !== null)!;
        const output = generatePairings(input);
        const costs = new Map(expected.graph.edges.map((edge) => [`${edge.a}:${edge.b}`, edge.cost]));
        const actual = output.pairs.reduce((total, pair) => {
          const a = expected.graph.playerIds.indexOf(pair.player1Id);
          const b = pair.player2Id === null ? expected.graph.vertexCount - 1 : expected.graph.playerIds.indexOf(pair.player2Id);
          return total + costs.get(`${Math.min(a, b)}:${Math.max(a, b)}`)!;
        }, 0);
        expect(actual).toBe(expected.cost);
        rounds.push(simulatedRound(number, output.pairs));
      }
    }
  });

  it.each([2, 3, 5, 8, 16, 33, 128, 256])("completes %i-player suggested rounds with legal deterministic assignments", (count) => {
    const entrants = roster(count);
    const rounds: Round[] = [];
    const opponents = new Set<string>();
    const byes = new Set<string>();
    for (let number = 1; number <= suggestRoundCount(count); number += 1) {
      const input = { entrants, rounds, seed: `simulation-${count}`, roundNumber: number };
      const output = generatePairings(input);
      expect(generatePairings(input)).toEqual(output);
      const assigned = output.pairs.flatMap((pair) => pair.player2Id ? [pair.player1Id, pair.player2Id] : [pair.player1Id]);
      expect(new Set(assigned).size).toBe(count);
      expect(assigned).toHaveLength(count);
      expect(output.pairs.filter((pair) => !pair.player2Id)).toHaveLength(count % 2);
      for (const pair of output.pairs) {
        if (!pair.player2Id) {
          expect(byes.has(pair.player1Id)).toBe(false);
          byes.add(pair.player1Id);
        } else {
          const key = [pair.player1Id, pair.player2Id].sort().join(":");
          expect(opponents.has(key)).toBe(false);
          opponents.add(key);
        }
      }
      rounds.push(simulatedRound(number, output.pairs));
    }
  }, 30_000);
});
