import { describe, expect, it } from "vitest";
import { maximumRoundCount, normalizePlayerName, parsePlayerNames, suggestRoundCount, validateRoundCount } from "../../src/domain/roster";

describe("bulk roster", () => {
  it("trims CRLF input, ignores blank lines and keeps Unicode labels", () => {
    expect(parsePlayerNames("  Alice \r\n\r\n 太郎 \r\nZoë ")).toEqual({ names: ["Alice", "太郎", "Zoë"], count: 3, errors: [] });
  });

  it("identifies normalized duplicates at their original lines", () => {
    const parsed = parsePlayerNames("Alice\n\nＡＬＩＣＥ\nBob\nSTRASSE", ["Straße", "bob"]);
    expect(parsed.names).toEqual(["Alice"]);
    expect(parsed.errors.map((issue) => issue.line)).toEqual([3, 4, 5]);
    expect(normalizePlayerName("Éva")).toBe(normalizePlayerName("E\u0301VA"));
    expect(normalizePlayerName("ος")).toBe(normalizePlayerName("ΟΣ"));
  });

  it("validates capacity and names", () => {
    expect(parsePlayerNames("x".repeat(81)).errors[0]?.line).toBe(1);
    expect(parsePlayerNames("Alice\u0000").errors).toHaveLength(1);
    expect(parsePlayerNames("Extra", Array.from({ length: 256 }, (_, i) => `Player ${i}`)).errors[0]?.line).toBe(0);
  });
});

describe("round count", () => {
  it.each([[2, 1], [3, 2], [5, 3], [8, 3], [16, 4], [33, 6], [128, 7], [256, 8]])("suggests rounds for %i players", (count, rounds) => {
    expect(suggestRoundCount(count)).toBe(rounds);
    expect(validateRoundCount(count, rounds)).toBeNull();
  });

  it("checks structural limits", () => {
    expect(maximumRoundCount(2)).toBe(1);
    expect(maximumRoundCount(3)).toBe(3);
    expect(validateRoundCount(2, 2)).toBeTruthy();
    expect(validateRoundCount(3, 4)).toBeTruthy();
    expect(validateRoundCount(1, 1)).toBeTruthy();
    expect(validateRoundCount(257, 8)).toBeTruthy();
  });
});
