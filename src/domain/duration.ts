/** Formats whole seconds without applying clock-specific rounding. */
export function formatDuration(seconds: number): string {
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new RangeError("Duration must be a nonnegative whole number of seconds.");
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Accepts minutes and two seconds digits; minutes may exceed 59. */
export function parseDuration(text: string): number | null {
  const match = /^(\d+):([0-5]\d)$/.exec(text.trim());
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

export interface DurationConstraints {
  required?: boolean;
  minSeconds?: number;
  maxSeconds?: number;
}

/** A blank optional input remains blank; its caller chooses whether it means zero. */
export function durationValidationMessage(text: string, { required = false, minSeconds, maxSeconds }: DurationConstraints = {}): string | null {
  if (!text.trim()) return required ? "Enter a duration in m:ss." : null;
  const seconds = parseDuration(text);
  if (seconds === null) return "Use m:ss, for example 9:24.";
  if (minSeconds !== undefined && seconds < minSeconds || maxSeconds !== undefined && seconds > maxSeconds) {
    if (minSeconds !== undefined && maxSeconds !== undefined) return `Enter a duration from ${formatDuration(minSeconds)} to ${formatDuration(maxSeconds)}.`;
    if (minSeconds !== undefined) return `Enter at least ${formatDuration(minSeconds)}.`;
    return `Enter no more than ${formatDuration(maxSeconds!)}.`;
  }
  return null;
}
