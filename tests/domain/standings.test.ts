import { describe, expect, it } from "vitest";
import { administrativeResult, calculateScore } from "../../src/domain/scoring";
import { calculateStandings } from "../../src/domain/standings";
import { config, match, roster, round } from "./fixtures";

describe("standings", () => {
  it("sorts match points before adjusted differential, with shared ranks for exact ties", () => {
    const rounds = [round(1, [
      match("p0", "p1", calculateScore({ raw1: 401, raw2: 399, overtime1: 20, overtime2: 0 }, config)),
      match("p2", "p3", administrativeResult("forfeit", 1), "forfeit"),
    ])];
    const standings = calculateStandings(roster(4), rounds);
    expect(standings.map((row) => [row.entrantId, row.matchPoints, row.difference, row.rank])).toEqual([
      ["p1", 1, 2, 1], ["p2", 1, 0, 2], ["p3", 0, 0, 3], ["p0", 0, -2, 4],
    ]);
    const tied = calculateStandings(roster(4), [round(1, [match("p0", "p1"), match("p2", "p3")])]);
    expect(tied.map((row) => row.rank)).toEqual([1, 1, 1, 1]);
    expect(tied.every((row) => row.matchPoints === 0.5 && row.draws === 1)).toBe(true);
  });

  it("adds cumulative opposite differences and ignores pending reports and drafts", () => {
    const official = round(1, [match("p0", "p1", calculateScore({ raw1: 110, raw2: 100, overtime1: 0, overtime2: 0 }, config))]);
    const pending = round(2, [{ ...match("p0", "p1"), status: "awaiting_confirmation", result: null }]);
    const draft = { ...round(3, [match("p0", "p1")]), status: "draft" as const };
    const rows = calculateStandings(roster(2), [official, pending, draft]);
    expect(rows.map((row) => row.difference)).toEqual([10, -10]);
    expect(rows.reduce((sum, row) => sum + row.difference, 0)).toBe(0);
    expect(rows.map((row) => row.played)).toEqual([1, 1]);
  });

  it("keeps withdrawn players and gives unplayed outcomes zero differential", () => {
    const entrants = roster(3);
    entrants[0]!.active = false;
    const rows = calculateStandings(entrants, [round(1, [match("p0", "p1", administrativeResult("double_forfeit"), "double_forfeit"), match("p2", null)])]);
    expect(rows[0]).toMatchObject({ entrantId: "p2", matchPoints: 1, difference: 0 });
    expect(rows.find((row) => row.entrantId === "p0")).toMatchObject({ active: false, matchPoints: 0, difference: 0 });
  });
});
