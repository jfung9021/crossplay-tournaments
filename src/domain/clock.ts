import type { ClockDisplay, ClockEvent, ClockRules, ClockSide, ClockState } from "./clock-types";

export type { ClockDisplay, ClockEvent, ClockEventKind, ClockRules, ClockSide, ClockState, ClockStatus } from "./clock-types";

function integer(value: number, name: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid ${name}.`);
}

export function createClockState(activeSide: ClockSide, epoch = 1): ClockState {
  if (activeSide !== 1 && activeSide !== 2) throw new Error("Invalid starting side.");
  integer(epoch, "clock epoch", 1);
  return { status: "ready", activeSide, usedMs: [0, 0], currentTurnMs: 0, epoch, sequence: 0, version: 0, anchorAtMs: null, reportSubmitted: false, reviewRequired: false };
}

/** Replays one ordered event. Transport retries are deduplicated before replay. */
export function applyClockEvent(state: ClockState, event: ClockEvent): ClockState {
  integer(event.sequence, "event sequence", 1);
  integer(event.atMs, "event timestamp");
  integer(event.elapsedMs, "elapsed milliseconds");
  if (event.sequence !== state.sequence + 1) throw new Error("Clock events must be consecutive.");
  if (state.reportSubmitted) throw new Error("A submitted clock cannot be changed.");
  if (state.reviewRequired) throw new Error("The clock needs an organizer time correction.");
  if (state.status !== "running" && event.elapsedMs !== 0) throw new Error("A stopped clock cannot accrue time.");
  const next: ClockState = { ...state, usedMs: [...state.usedMs], sequence: event.sequence, version: state.version + 1 };
  if (state.status === "running") {
    next.usedMs[state.activeSide - 1] += event.elapsedMs;
    integer(next.usedMs[state.activeSide - 1], "accumulated time");
  }
  switch (event.kind) {
    case "start":
      if (state.status !== "ready") throw new Error("This clock has already started.");
      if (event.side !== undefined && event.side !== state.activeSide) throw new Error("Start with the saved starting player.");
      next.status = "running";
      break;
    case "switch":
      if (state.status !== "running" || event.side !== state.activeSide) throw new Error("Only the running player can pass the turn.");
      next.activeSide = state.activeSide === 1 ? 2 : 1;
      break;
    case "pause":
      if (state.status !== "running") throw new Error("Only a running clock can be paused.");
      next.status = "paused";
      break;
    case "resume":
      if (state.status !== "paused" && state.status !== "ended") throw new Error("Only a stopped game can be resumed.");
      next.status = "running";
      break;
    case "end":
      if (state.status !== "running" && state.status !== "paused") throw new Error("Start the game before ending it.");
      next.status = "ended";
      break;
    case "recover":
      if (event.reviewRequired) next.reviewRequired = true;
      break;
    default:
      throw new Error("Unknown clock event.");
  }
  next.anchorAtMs = next.status === "running" ? event.atMs : null;
  // Preserve the shape of old journals so their exact replay validation still succeeds.
  if (state.currentTurnMs !== undefined) {
    next.currentTurnMs = event.kind === "start" || event.kind === "switch" ? 0
      : state.currentTurnMs + (state.status === "running" ? event.elapsedMs : 0);
    integer(next.currentTurnMs, "current turn time");
  }
  return next;
}

export function currentTurnSeconds(state: ClockState, elapsedMs = 0): number | null {
  integer(elapsedMs, "elapsed milliseconds");
  if (state.status === "ready") return 0;
  if (state.currentTurnMs === undefined) return null;
  return Math.floor((state.currentTurnMs + (state.status === "running" && !state.reviewRequired ? elapsedMs : 0)) / 1000);
}

/** Render-only projection: delayed renders never lose elapsed time. */
export function deriveClock(state: ClockState, rules: ClockRules, elapsedMs = 0): [ClockDisplay, ClockDisplay] {
  integer(rules.timeLimitSeconds, "time limit", 1);
  integer(rules.penaltyIntervalSeconds, "penalty interval", 1);
  integer(rules.penaltyPoints, "penalty points");
  integer(elapsedMs, "elapsed milliseconds");
  return state.usedMs.map((storedMs, index) => {
    const usedMs = storedMs + (state.status === "running" && !state.reviewRequired && index === state.activeSide - 1 ? elapsedMs : 0);
    const remainingMs = rules.timeLimitSeconds * 1000 - usedMs;
    const overtimeMs = Math.max(0, -remainingMs);
    return {
      usedMs, remainingMs, overtimeMs,
      overtimeSeconds: Math.floor(overtimeMs / 1000),
      displaySeconds: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : Math.floor(overtimeMs / 1000),
      isOvertime: remainingMs <= 0,
      deduction: Math.floor(overtimeMs / (rules.penaltyIntervalSeconds * 1000)) * rules.penaltyPoints,
    };
  }) as [ClockDisplay, ClockDisplay];
}
