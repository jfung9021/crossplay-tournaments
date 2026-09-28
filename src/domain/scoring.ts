import type { OfficialResult, OutcomeKind, ScoreInput, TournamentConfig } from "./types";

export const MAX_SCORE = 100_000;
export const MAX_OVERTIME_SECONDS = 86_400;
export const MAX_PENALTY_INTERVAL_SECONDS = 3_600;
export const MAX_PENALTY_POINTS = 100;

function integerInRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a whole number between ${minimum} and ${maximum}.`);
  }
}

export function validateTournamentConfig(config: TournamentConfig): void {
  integerInRange(config.penaltyIntervalSeconds, 1, MAX_PENALTY_INTERVAL_SECONDS, "Penalty interval");
  integerInRange(config.penaltyPoints, 0, MAX_PENALTY_POINTS, "Penalty points");
  if (config.roundCount !== null) integerInRange(config.roundCount, 1, 255, "Rounds");
  if (config.timeLimitSeconds !== null) integerInRange(config.timeLimitSeconds, 1, 86_400, "Time limit");
}

/** Completed overtime intervals are charged; adjusted scores have no zero floor. */
export function calculateScore(input: ScoreInput, config: TournamentConfig): OfficialResult {
  validateTournamentConfig(config);
  integerInRange(input.raw1, -MAX_SCORE, MAX_SCORE, "First score");
  integerInRange(input.raw2, -MAX_SCORE, MAX_SCORE, "Second score");
  integerInRange(input.overtime1, 0, MAX_OVERTIME_SECONDS, "First overtime");
  integerInRange(input.overtime2, 0, MAX_OVERTIME_SECONDS, "Second overtime");
  const adjusted1 = input.raw1 - Math.floor(input.overtime1 / config.penaltyIntervalSeconds) * config.penaltyPoints;
  const adjusted2 = input.raw2 - Math.floor(input.overtime2 / config.penaltyIntervalSeconds) * config.penaltyPoints;
  const difference1 = adjusted1 - adjusted2;
  return {
    ...input,
    adjusted1,
    adjusted2,
    points1: difference1 > 0 ? 2 : difference1 === 0 ? 1 : 0,
    points2: difference1 < 0 ? 2 : difference1 === 0 ? 1 : 0,
    difference1,
  };
}

export function administrativeResult(kind: Exclude<OutcomeKind, "played">, winnerSide: 1 | 2 = 1): OfficialResult {
  return {
    raw1: null, raw2: null, overtime1: 0, overtime2: 0,
    adjusted1: null, adjusted2: null, difference1: 0,
    points1: kind === "bye" || (kind === "forfeit" && winnerSide === 1) ? 2 : 0,
    points2: kind === "forfeit" && winnerSide === 2 ? 2 : 0,
  };
}
