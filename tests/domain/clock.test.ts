import { describe, expect, it } from "vitest";
import { applyClockEvent, createClockState, deriveClock, type ClockEventKind, type ClockSide, type ClockState } from "../../src/domain/clock";

const rules = { timeLimitSeconds: 1200, penaltyIntervalSeconds: 10, penaltyPoints: 2 };
function action(state: ClockState, kind: ClockEventKind, elapsedMs = 0, side?: ClockSide): ClockState {
  return applyClockEvent(state, { sequence: state.sequence + 1, kind, elapsedMs, atMs: 1_800_000_000_000 + state.sequence * 100, side });
}

describe("shared clock state machine", () => {
  it("starts the saved side separately from ready and conserves time across rapid turns", () => {
    let state = createClockState(2);
    expect(deriveClock(state, rules).map(side => side.displaySeconds)).toEqual([1200, 1200]);
    expect(() => action(state, "start", 0, 1)).toThrow("saved starting player");
    state = action(state, "start");
    state = action(state, "switch", 1234, 2);
    state = action(state, "switch", 7, 1);
    state = action(state, "switch", 1, 2);
    state = action(state, "end", 8);
    expect(state.usedMs).toEqual([15, 1235]);
    expect(state.usedMs[0] + state.usedMs[1]).toBe(1250);
    expect(state.activeSide).toBe(1);
    expect(state.status).toBe("ended");
  });

  it.each([[9999, 0, 9], [10000, 2, 10], [19999, 2, 19], [20000, 4, 20]])("charges completed overtime intervals at %i milliseconds", (overtime, deduction, seconds) => {
    const state = action(action(createClockState(1), "start"), "end", 1_200_000 + overtime);
    const [display] = deriveClock(state, rules, 500_000);
    expect(display).toMatchObject({ deduction, overtimeSeconds: seconds, displaySeconds: seconds });
  });

  it("rounds remaining time up, treats zero as overtime, and never auto-ends", () => {
    const state = action(createClockState(1), "start");
    expect(deriveClock(state, rules, 1)[0].displaySeconds).toBe(1200);
    expect(deriveClock(state, rules, 1_199_999)[0].displaySeconds).toBe(1);
    expect(deriveClock(state, rules, 1_200_000)[0]).toMatchObject({ isOvertime: true, displaySeconds: 0, deduction: 0 });
    expect(state.status).toBe("running");
  });

  it("sums 3 + 3 + 4 second overtime turns before rounding", () => {
    let state = action(createClockState(1), "start");
    for (const [elapsed, side] of [[1_203_000, 1], [25, 2], [3000, 1], [30, 2], [4000, 1]] as const) state = action(state, "switch", elapsed, side);
    expect(state.usedMs).toEqual([1_210_000, 55]);
    expect(deriveClock(state, rules)[0].deduction).toBe(2);
  });

  it("supports custom 3/15 and zero penalty values", () => {
    const state = action(action(createClockState(1), "start"), "end", 1_230_000);
    expect(deriveClock(state, { ...rules, penaltyIntervalSeconds: 15, penaltyPoints: 3 })[0].deduction).toBe(6);
    expect(deriveClock(state, { ...rules, penaltyPoints: 0 })[0].deduction).toBe(0);
  });

  it("pauses and ends without charging stopped time and resumes the same side", () => {
    let state = action(action(createClockState(2), "start"), "pause", 5321);
    expect(deriveClock(state, rules, 90_000).map(row => row.usedMs)).toEqual([0, 5321]);
    state = action(state, "resume");
    state = action(state, "end", 79);
    expect(state.usedMs).toEqual([0, 5400]);
    state = action(state, "resume");
    expect(state.activeSide).toBe(2);
    expect(() => action({ ...state, reportSubmitted: true }, "end", 1)).toThrow("submitted clock");
  });

  it("rejects invalid transitions, inactive serialized taps, gaps, backwards and fractional time", () => {
    const ready = createClockState(1); const running = action(ready, "start");
    expect(() => action(ready, "end")).toThrow();
    expect(() => action(running, "start")).toThrow();
    expect(() => action(running, "switch", 5, 2)).toThrow("running player");
    expect(() => action(running, "pause", -1)).toThrow();
    expect(() => action(running, "pause", 0.5)).toThrow();
    expect(() => applyClockEvent(running, { kind: "pause", sequence: 3, elapsedMs: 0, atMs: 1 })).toThrow("consecutive");
    expect(() => action(action(running, "pause", 1), "resume", 20)).toThrow("stopped clock");
  });

  it("preserves uncertain totals and freezes controls for organizer review", () => {
    const running = action(createClockState(1), "start");
    const review = applyClockEvent(running, { kind: "recover", sequence: 2, elapsedMs: 0, atMs: 100, reviewRequired: true });
    expect(deriveClock(review, rules, 99999)[0].usedMs).toBe(0);
    expect(() => action(review, "end", 1)).toThrow("organizer time correction");
  });

  it("yields the specified realistic 401–399 score handoff without timing score-entry delay", () => {
    let state = action(createClockState(1), "start");
    state = action(state, "switch", 1_220_000, 1);
    state = action(state, "end", 1_190_000);
    const display = deriveClock(state, rules, 60_000);
    const adjusted = [401 - display[0].deduction, 399 - display[1].deduction];
    expect(adjusted).toEqual([397, 399]);
    expect(adjusted[0] - adjusted[1]).toBe(-2);
  });
});
