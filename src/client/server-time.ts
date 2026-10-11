export interface TimeSample { serverMs: number; monoMs: number; wallMs: number; uncertaintyMs: number }
export function timeSample(serverMs: number, sent: number, received: number, wallMs: number): TimeSample {
  const uncertaintyMs = Math.max(0, received - sent) / 2 + 1;
  return { serverMs: serverMs + uncertaintyMs - 1, monoMs: received, wallMs, uncertaintyMs };
}
/** Monotonic interpolation within one browser; wall time detects sleep or adjustment only. */
export function serverTime(sample: TimeSample | null, monoMs: number, wallMs: number) {
  if (!sample) return null;
  const elapsed = monoMs - sample.monoMs;
  if (elapsed < 0 || elapsed > 30_000 || Math.abs(wallMs - sample.wallMs - elapsed) > 1_000) return null;
  return { nowMs: sample.serverMs + elapsed, uncertaintyMs: sample.uncertaintyMs + elapsed * .001 };
}
