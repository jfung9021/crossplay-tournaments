export type ClockSide = 1 | 2;
export type ClockStatus = "ready" | "running" | "paused" | "ended";
export type ClockEventKind = "start" | "switch" | "pause" | "resume" | "end" | "recover";

export interface ClockRules {
  timeLimitSeconds: number;
  penaltyIntervalSeconds: number;
  penaltyPoints: number;
}

/** The active side is retained while stopped so resuming never changes the turn. */
export interface ClockState {
  status: ClockStatus;
  activeSide: ClockSide;
  usedMs: [number, number];
  epoch: number;
  sequence: number;
  version: number;
  anchorAtMs: number | null;
  reportSubmitted: boolean;
  reviewRequired: boolean;
}

/** Durations are integer milliseconds, measured at the gesture, not at receipt. */
export interface ClockEvent {
  sequence: number;
  kind: ClockEventKind;
  atMs: number;
  elapsedMs: number;
  side?: ClockSide;
  reviewRequired?: boolean;
}

export interface ClockDisplay {
  usedMs: number;
  remainingMs: number;
  overtimeMs: number;
  overtimeSeconds: number;
  displaySeconds: number;
  isOvertime: boolean;
  deduction: number;
}
