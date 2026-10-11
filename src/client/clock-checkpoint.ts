import type { ClockJournalSnapshot } from "./clock-storage";
import { serverTime, timeSample, type TimeSample } from "./server-time";

export interface CheckpointSource { local: ClockJournalSnapshot; controllerId: string; generation: number }
/** Best-effort spectator samples. No journal entries, persistent retries, or official writes. */
export function createCheckpointPublisher(matchId: string, source: () => CheckpointSource | null) {
  let anchor: TimeSample | null = null, active: AbortController | null = null, disposed = false, retryAt = 0;
  const path = `/api/matches/${encodeURIComponent(matchId)}/display-checkpoint`;
  const exchange = async (body?: object) => {
    const sent = performance.now();
    const response = await fetch(path, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal: active!.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) throw new Error("Checkpoint unavailable");
    const result = await response.json() as { available: boolean; serverNowMs?: number };
    if (!result.available) { retryAt = performance.now() + 30_000; anchor = null; return false; }
    anchor = timeSample(result.serverNowMs!, sent, performance.now(), Date.now());
    return true;
  };
  const publish = async () => {
    if (disposed || active || performance.now() < retryAt || document.visibilityState !== "visible" || !navigator.onLine) return;
    if (!source()) return;
    active = new AbortController();
    const timeout = setTimeout(() => active?.abort(), 1500);
    try {
      if (!serverTime(anchor, performance.now(), Date.now()) && !await exchange()) return;
      // Recapture AFTER calibration: gestures during the request invalidate the old sample.
      const current = source(), time = serverTime(anchor, performance.now(), Date.now());
      if (disposed || document.visibilityState !== "visible" || !current || !time || time.uncertaintyMs > 500) return;
      const { local, controllerId, generation } = current;
      if (local.pendingCount || local.controllerConflict || local.recoveryPending || local.reviewRequired || local.state.reportSubmitted) return;
      await exchange({ controllerId, generation, epoch: local.state.epoch, version: local.state.version, sequence: local.state.sequence,
        sampledAtMs: Math.floor(time.nowMs), uncertaintyMs: Math.ceil(time.uncertaintyMs), elapsedMs: Math.floor(local.elapsedMs) });
    } catch { anchor = null; /* Telemetry cannot interrupt the controlling phone. */ }
    finally { clearTimeout(timeout); active = null; }
  };
  return { publish, dispose: () => { disposed = true; active?.abort(); }, invalidate: () => { anchor = null; active?.abort(); } };
}
