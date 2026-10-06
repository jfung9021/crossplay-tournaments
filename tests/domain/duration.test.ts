import { describe, expect, it } from "vitest";
import { deriveClock, createClockState } from "../../src/domain/clock";
import { durationValidationMessage, formatDuration, parseDuration } from "../../src/domain/duration";

describe("duration presentation", () => {
  it.each([[0, "0:00"], [10, "0:10"], [564, "9:24"], [1200, "20:00"], [3599, "59:59"], [3600, "60:00"], [86400, "1440:00"], [172800, "2880:00"]])("round-trips %i seconds as %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
    expect(parseDuration(text)).toBe(seconds);
  });

  it("normalizes surrounding whitespace and leading minute zeroes", () => {
    expect(formatDuration(parseDuration("  009:24 \n")!)).toBe("9:24");
    expect(parseDuration("00:00")).toBe(0);
    expect(parseDuration(formatDuration(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each(["", "   ", "20", "9:4", "9:60", "9:99", ":24", "-1:00", "+0:10", "1.5:00", "1:00.5", "1:00:00", "1 :00", "1: 00", "NaN:00", "9007199254740991:00", "150119987579016:32"])("rejects ambiguous or invalid duration %j", text => {
    expect(parseDuration(text)).toBeNull();
  });

  it.each([-1, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid whole seconds %s without choosing a rounding policy", seconds => {
    expect(() => formatDuration(seconds)).toThrow(RangeError);
  });

  it("keeps optional blank values distinct from zero and validates required values", () => {
    expect(durationValidationMessage(" ")).toBeNull();
    expect(durationValidationMessage(" ", { required: true })).toBe("Enter a duration in m:ss.");
    expect(durationValidationMessage("20", { required: true })).toBe("Use m:ss, for example 9:24.");
  });

  it.each([
    ["app time", 1, 86400],
    ["penalty interval", 1, 3600],
    ["manual overtime", 0, 86400],
    ["organizer time used", 0, 172800],
  ])("accepts both %s bounds and rejects values outside them", (_name, minSeconds, maxSeconds) => {
    const constraints = { required: true, minSeconds, maxSeconds };
    expect(durationValidationMessage(formatDuration(minSeconds), constraints)).toBeNull();
    expect(durationValidationMessage(formatDuration(maxSeconds), constraints)).toBeNull();
    const message = `Enter a duration from ${formatDuration(minSeconds)} to ${formatDuration(maxSeconds)}.`;
    expect(durationValidationMessage(formatDuration(maxSeconds + 1), constraints)).toBe(message);
    if (minSeconds > 0) expect(durationValidationMessage(formatDuration(minSeconds - 1), constraints)).toBe(message);
  });

  it("formats one-sided constraint messages as durations", () => {
    expect(durationValidationMessage("0:00", { minSeconds: 1 })).toBe("Enter at least 0:01.");
    expect(durationValidationMessage("60:01", { maxSeconds: 3600 })).toBe("Enter no more than 60:00.");
  });

  it("preserves domain rounding and penalties at a fractional overtime boundary", () => {
    const state = { ...createClockState(1), status: "running" as const };
    const rules = { timeLimitSeconds: 1200, penaltyIntervalSeconds: 10, penaltyPoints: 2 };
    expect(formatDuration(deriveClock(state, rules, 1)[0].displaySeconds)).toBe("20:00");
    const before = deriveClock(state, rules, 1_209_999)[0];
    expect(`+${formatDuration(before.displaySeconds)}`).toBe("+0:09");
    expect(before.deduction).toBe(0);
    const boundary = deriveClock(state, rules, 1_210_000)[0];
    expect(`+${formatDuration(boundary.displaySeconds)}`).toBe("+0:10");
    expect(boundary.deduction).toBe(2);
  });
});
