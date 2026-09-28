import { describe, expect, it } from "vitest";
import { administrativeResult, calculateScore } from "../../src/domain/scoring";
import { config } from "./fixtures";

describe("overtime scoring", () => {
  it.each([[0, 0], [9, 0], [10, 2], [11, 2], [19, 2], [20, 4]])("charges %i seconds as %i points", (seconds, deduction) => {
    expect(calculateScore({ raw1: 100, raw2: 99, overtime1: seconds, overtime2: 0 }, config).adjusted1).toBe(100 - deduction);
  });

  it("changes the winner after penalties and counts integer half-point units", () => {
    expect(calculateScore({ raw1: 401, raw2: 399, overtime1: 20, overtime2: 0 }, config)).toMatchObject({ adjusted1: 397, adjusted2: 399, points1: 0, points2: 2, difference1: -2 });
    expect(calculateScore({ raw1: 401, raw2: 399, overtime1: 10, overtime2: 0 }, config)).toMatchObject({ points1: 1, points2: 1, difference1: 0 });
  });

  it("supports custom intervals, both overtime values, zero deduction, and negative scores", () => {
    expect(calculateScore({ raw1: 1, raw2: -2, overtime1: 15, overtime2: 10 }, { ...config, penaltyIntervalSeconds: 5, penaltyPoints: 3 })).toMatchObject({ adjusted1: -8, adjusted2: -8, points1: 1, points2: 1 });
    expect(calculateScore({ raw1: -10, raw2: -9, overtime1: 86_400, overtime2: 86_400 }, { ...config, penaltyPoints: 0 })).toMatchObject({ adjusted1: -10, adjusted2: -9 });
  });

  it.each([
    { raw1: 1.5 }, { raw1: 100_001 }, { raw2: -100_001 }, { overtime1: -1 },
    { overtime2: 86_401 }, { overtime1: Number.NaN }, { raw1: Number.POSITIVE_INFINITY },
  ])("rejects invalid score inputs %j", (invalid) => {
    expect(() => calculateScore({ raw1: 0, raw2: 0, overtime1: 0, overtime2: 0, ...invalid }, config)).toThrow();
  });

  it.each([{ penaltyIntervalSeconds: 0 }, { penaltyIntervalSeconds: 3601 }, { penaltyPoints: -1 }, { penaltyPoints: 101 }])("rejects invalid rule inputs %j", (invalid) => {
    expect(() => calculateScore({ raw1: 0, raw2: 0, overtime1: 0, overtime2: 0 }, { ...config, ...invalid })).toThrow();
  });

  it("represents unplayed outcomes without scores or differential", () => {
    expect(administrativeResult("bye")).toMatchObject({ raw1: null, raw2: null, adjusted1: null, points1: 2, points2: 0, difference1: 0 });
    expect(administrativeResult("forfeit", 2)).toMatchObject({ points1: 0, points2: 2, difference1: 0 });
    expect(administrativeResult("double_forfeit")).toMatchObject({ points1: 0, points2: 0, difference1: 0 });
  });
});
