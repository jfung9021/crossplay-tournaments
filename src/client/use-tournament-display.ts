"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TournamentDisplay } from "@/domain/display";
import { DisplayClockStore } from "./display-clock-store";
import { timeSample } from "./server-time";

const POLL_MS = 1_000;
const TIMEOUT_MS = 3_000;
export const DISPLAY_STALE_MS = 15_000;

/** Public, single-flight reads; a display can never change tournament state. */
export function useTournamentDisplay(slug: string) {
  const [clocks] = useState(() => new DisplayClockStore());
  const [data, setData] = useState<TournamentDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [lastSuccessMs, setLastSuccessMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const retryRef = useRef<() => void>(() => {});
  const retry = useCallback(() => retryRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let sequence = 0;
    let failures = 0;
    let controller: AbortController | null = null;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    let urgent = false;
    const schedule = (delay: number) => {
      clearTimeout(scheduled);
      if (!disposed) scheduled = setTimeout(() => void read(), delay);
    };
    const read = async () => {
      if (disposed || controller) { urgent = true; return; }
      const request = ++sequence;
      const active = new AbortController();
      controller = active;
      const timeout = setTimeout(() => active.abort(), TIMEOUT_MS);
      let nextDelay = POLL_MS;
      const sent = performance.now();
      try {
        const response = await fetch(`/api/tournaments/${encodeURIComponent(slug)}/display`, { signal: active.signal, cache: "no-store" });
        if (disposed || request !== sequence) return;
        if (response.status === 404 || response.status === 403) {
          clocks.clear(); setData(null); setLastSuccessMs(null); setUnavailable(true); setError(null); failures = 0;
          return;
        }
        if (!response.ok) throw new Error("The display could not refresh.");
        const next = await response.json() as TournamentDisplay;
        if (disposed || request !== sequence) return;
        const received = performance.now(), wall = Date.now();
        clocks.receive(next.clocks ?? {}, `${next.tournament.id}:${next.tournament.runGeneration}`, timeSample(next.serverNowMs, sent, received, wall), received, wall);
        nextDelay = next.tournament.status === "active" ? Math.max(0, POLL_MS - (received - sent)) : 5_000;
        // An unchanged revision includes only a newer server timestamp. Keep the
        // visible tree stable while still recording a successful connection.
        setData(previous => previous?.revision === next.revision && previous.tournament.runGeneration === next.tournament.runGeneration ? previous : next);
        const now = Date.now();
        setLastSuccessMs(now); setNowMs(now); setUnavailable(false); setError(null); failures = 0;
      } catch {
        if (disposed || request !== sequence) return;
        failures += 1;
        nextDelay = Math.min(30_000, POLL_MS * 2 ** Math.min(failures, 5));
        setError("Connection lost");
        clocks.disconnect(performance.now(), Date.now());
      } finally {
        clearTimeout(timeout);
        if (controller === active) controller = null;
        if (!disposed && request === sequence) { schedule(urgent ? 0 : nextDelay); urgent = false; }
      }
    };
    const refresh = () => {
      if (controller) urgent = true;
      else schedule(0);
    };
    const visible = () => { clocks.disconnect(performance.now(), Date.now()); if (document.visibilityState === "visible") refresh(); };
    retryRef.current = refresh;
    schedule(0);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    const clock = setInterval(() => setNowMs(Date.now()), 1_000);
    const digits = setInterval(() => { if (document.visibilityState === "visible") clocks.tick(performance.now(), Date.now()); }, 100);
    return () => {
      disposed = true; sequence += 1; clearTimeout(scheduled); clearInterval(clock); clearInterval(digits); controller?.abort(); clocks.clear();
      window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible);
      retryRef.current = () => {};
    };
  }, [slug, clocks]);

  const ageSeconds = lastSuccessMs === null ? null : Math.max(0, Math.floor((nowMs - lastSuccessMs) / 1_000));
  return { data, clocks, error, unavailable, retry, ageSeconds, stale: lastSuccessMs !== null && nowMs - lastSuccessMs >= DISPLAY_STALE_MS };
}
