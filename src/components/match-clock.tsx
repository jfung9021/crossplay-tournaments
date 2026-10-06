"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClockJournal, acquireClockTabLock } from "@/client/clock-storage";
import type { ClockJournalSnapshot } from "@/client/clock-storage";
import { ClockApiError, clockError, matchClockApi, matchControllerId } from "@/client/match-clock-api";
import type { MatchClockSnapshot } from "@/client/match-clock-api";
import { deriveClock } from "@/domain/clock";
import type { ClockEventKind, ClockSide } from "@/domain/clock-types";
import { SharedMatchReport } from "@/components/shared-match-report";
import { OrganizerMatchClock } from "@/components/organizer-match-clock";
import styles from "./match-clock.module.css";

function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }

export function MatchClockPage({ matchId }: { matchId: string }) {
  const [snapshot, setSnapshot] = useState<MatchClockSnapshot | null>(null);
  const snapshotRef = useRef<MatchClockSnapshot | null>(null);
  const journal = useRef<ClockJournal | null>(null);
  const controller = useRef<string | null>(null);
  const releaseLock = useRef<(() => void) | null>(null);
  const initializing = useRef<Promise<void> | null>(null);
  const flushing = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [wakeUnavailable, setWakeUnavailable] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [faceToFace, setFaceToFace] = useState(false);
  const [local, setLocal] = useState<ClockJournalSnapshot | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const refreshClock = useCallback(() => { setLocal(journal.current?.getSnapshot() ?? null); setNowMs(Date.now()); }, []);

  const acceptSnapshot = useCallback((next: MatchClockSnapshot) => {
    snapshotRef.current = next;
    if (mounted.current) setSnapshot(next);
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (flushing.current) return flushing.current;
    const adapter = journal.current;
    if (!adapter || !controller.current || adapter.getSnapshot().controllerConflict) return false;
    const work = async () => {
      try {
        while (adapter.getPendingEvents().length) {
          const events = adapter.getPendingEvents().slice(0, 100);
          let next: MatchClockSnapshot;
          try {
            next = await matchClockApi<MatchClockSnapshot>(matchId, { command: "append_events", payload: { controllerId: controller.current, epoch: adapter.getSnapshot().state.epoch, events }, expectedClockVersion: adapter.getAcceptedVersion() });
          } catch (cause) {
            if (!(cause instanceof ClockApiError) || cause.status !== 409) throw cause;
            const latest = await matchClockApi<MatchClockSnapshot>(matchId);
            const acceptedSequence = events[0].sequence - 1;
            const savedPrefix = latest.state && latest.controllerId === controller.current && latest.state.epoch === adapter.getSnapshot().state.epoch && latest.state.sequence > acceptedSequence && latest.state.version - adapter.getAcceptedVersion() === latest.state.sequence - acceptedSequence;
            if (!savedPrefix || !latest.state) throw cause;
            adapter.acknowledge(latest.state, latest.serverNowMs); acceptSnapshot(latest);
            continue;
          }
          if (!next.state) throw new Error("The match clock is unavailable.");
          adapter.acknowledge(next.state, next.serverNowMs);
          acceptSnapshot(next);
          if (adapter.getSnapshot().controllerConflict) throw new ClockApiError("Another device controls this clock. Ask the organizer for help.", 409);
        }
        if (mounted.current) setSaveFailed(false);
        return true;
      } catch (cause) {
        if (cause instanceof ClockApiError && [401, 403, 409, 410].includes(cause.status)) {
          adapter.setControllerConflict();
          if (mounted.current) { setReadonly(true); setError(clockError(cause)); }
        } else if (mounted.current) { setSaveFailed(true); if (!(cause instanceof ClockApiError && cause.status === 0)) setError(clockError(cause)); }
        return false;
      } finally { if (mounted.current) refreshClock(); }
    };
    const promise = work(); flushing.current = promise;
    try { return await promise; } finally { if (flushing.current === promise) flushing.current = null; }
  }, [matchId, acceptSnapshot, refreshClock]);

  const initialize = useCallback(async () => {
    if (initializing.current) return initializing.current;
    const work = async () => {
      setError(null); setLoading(true);
      try {
        let next = await matchClockApi<MatchClockSnapshot>(matchId);
        acceptSnapshot(next);
        if (!next.canControl || next.isOrganizer || next.matchStatus === "final") { setReadonly(true); return; }
        const id = matchControllerId(matchId); controller.current = id;
        if (!releaseLock.current) releaseLock.current = await acquireClockTabLock(matchId, () => { journal.current?.setControllerConflict(); setReadonly(true); });
        if (!releaseLock.current) { setReadonly(true); setError("This clock is open in another tab, or this browser cannot safely control it. Close the other tab and try again."); return; }
        next = await matchClockApi<MatchClockSnapshot>(matchId, { command: "claim_clock", payload: { controllerId: id } });
        acceptSnapshot(next);
        if (!next.state) throw new Error("The organizer has not enabled a clock for this match.");
        journal.current = new ClockJournal({ key: `${matchId}.${next.state.epoch}`, state: next.state, serverNowMs: next.serverNowMs });
        setReadonly(journal.current.getSnapshot().controllerConflict);
        refreshClock();
        void flush();
      } catch (cause) { setError(clockError(cause)); setReadonly(true); }
      finally { setLoading(false); }
    };
    const promise = work(); initializing.current = promise;
    try { await promise; } finally { if (initializing.current === promise) initializing.current = null; }
  }, [acceptSnapshot, flush, matchId, refreshClock]);

  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(initialize);
    return () => { mounted.current = false; releaseLock.current?.(); releaseLock.current = null; };
  }, [initialize]);

  useEffect(() => {
    const timer = window.setInterval(refreshClock, 100);
    const saving = window.setInterval(() => { if (journal.current?.getPendingEvents().length && navigator.onLine && !journal.current.getSnapshot().controllerConflict) void flush(); }, 1000);
    const reconcile = async () => {
      try {
        const next = await matchClockApi<MatchClockSnapshot>(matchId);
        acceptSnapshot(next);
        if (journal.current && next.state) {
          const previous = journal.current.getSnapshot();
          if (next.state.epoch > previous.state.epoch && !previous.pendingCount && next.canControl && next.controllerId === controller.current && releaseLock.current) {
            journal.current = new ClockJournal({ key: `${matchId}.${next.state.epoch}`, state: next.state, serverNowMs: next.serverNowMs });
            setReadonly(false); setError(null);
          } else journal.current.acknowledge(next.state, next.serverNowMs);
          if (journal.current.getSnapshot().controllerConflict) { setReadonly(true); setError("The clock changed. Reload to use the organizer-reviewed time."); }
          else { journal.current.setHidden(false, next.serverNowMs); await flush(); }
        }
      } catch (cause) { if (cause instanceof ClockApiError && [401, 403, 410].includes(cause.status)) { journal.current?.setControllerConflict(); setReadonly(true); setError(clockError(cause)); } }
      refreshClock();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") { journal.current?.setHidden(true); void flush(); }
      else if (navigator.onLine) void reconcile();
    };
    const online = () => void reconcile();
    const polling = window.setInterval(() => { if (document.visibilityState === "visible" && (readonly || snapshotRef.current?.state?.reportSubmitted)) void reconcile(); }, 10000);
    document.addEventListener("visibilitychange", visibility); window.addEventListener("online", online);
    return () => { window.clearInterval(timer); window.clearInterval(saving); window.clearInterval(polling); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", online); };
  }, [acceptSnapshot, flush, matchId, readonly, refreshClock]);

  const state = local?.state ?? snapshot?.state;
  const status = state?.status;
  useEffect(() => {
    if (status !== "running" || readonly) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;
    const request = async () => {
      if (document.visibilityState !== "visible" || sentinel && !sentinel.released) return;
      try {
        if (!("wakeLock" in navigator)) { setWakeUnavailable(true); return; }
        sentinel = await navigator.wakeLock.request("screen");
        if (disposed) { await sentinel.release(); return; }
        setWakeUnavailable(false);
        sentinel.addEventListener("release", () => { if (!disposed) setWakeUnavailable(true); });
      } catch { if (!disposed) setWakeUnavailable(true); }
    };
    void request(); document.addEventListener("visibilitychange", request);
    return () => { disposed = true; document.removeEventListener("visibilitychange", request); void sentinel?.release().catch(() => {}); };
  }, [status, readonly]);

  function act(kind: ClockEventKind, side?: ClockSide, gestureId?: string) {
    try {
      if (!journal.current || readonly) return;
      journal.current.act(kind, side, gestureId);
      setError(null); refreshClock();
      if (kind !== "switch") void flush();
    } catch (cause) { setError(clockError(cause)); }
  }

  async function reportCommand(command: string, payload: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const saved = await flush();
      const current = journal.current?.getSnapshot();
      if (!saved || !current || current.pendingCount || current.recoveryPending || current.reviewRequired) throw new Error("Save and verify the ended clock before reporting.");
      const next = await matchClockApi<MatchClockSnapshot>(matchId, { command, payload: { ...payload, ...(command === "submit_shared_report" ? { clockVersion: current.state.version } : {}) } });
      if (next.state) journal.current?.acknowledge(next.state, next.serverNowMs);
      acceptSnapshot(next);
    } catch (cause) { setError(clockError(cause)); throw cause; }
    finally { setBusy(false); }
  }

  if (loading || !snapshot || !state || snapshot.rules.timeLimitSeconds === null) return <div data-match-screen className={styles.shell}><section className={styles.entry}><h1>Match timer</h1>{loading ? <p role="status">Opening match…</p> : <>{error && <p role="alert">{error}</p>}{!error && <p>Open your tournament and choose Start Match.</p>}<button onClick={() => void initialize()}>Try again</button></>}{snapshot?.isOrganizer && <OrganizerMatchClock matchId={matchId} player1={snapshot.players[0]} player2={snapshot.players[1]} enabled={snapshot.rules.timeLimitSeconds !== null} final={snapshot.matchStatus === "final"} />}</section></div>;
  const elapsedMs = local?.elapsedMs ?? (state.status === "running" && state.anchorAtMs !== null ? Math.max(0, nowMs - state.anchorAtMs) : 0);
  const display = deriveClock(state, { ...snapshot.rules, timeLimitSeconds: snapshot.rules.timeLimitSeconds }, Math.floor(elapsedMs));
  const canWrite = !readonly && !local?.controllerConflict && !state.reviewRequired && !local?.recoveryPending;
  const waiting = !!local?.pendingCount || !!local?.recoveryPending || saveFailed;
  const showReport = state.status === "ended" || state.reportSubmitted || snapshot.matchStatus === "final";
  const ordered = flipped ? [snapshot.players[1], snapshot.players[0]] : snapshot.players;
  const isReady = state.status === "ready";
  const stopped = isReady || state.status === "paused";
  const starterName = snapshot.players[state.activeSide - 1].name;
  const panel = (index: number) => {
    const player = ordered[index]; const value = display[player.side - 1];
    const active = state.status === "running" && state.activeSide === player.side;
    return <button type="button" className={`${styles.clockPanel} ${index === 0 ? styles.upper : ""} ${active ? styles.active : ""} ${value.isOvertime ? styles.overtime : ""}`} aria-label={`${player.name} clock${active ? ", tap to pass turn" : ""}`} aria-disabled={!canWrite || !active} onClick={event => { if (canWrite && active) act("switch", player.side, `click:${event.timeStamp}:${player.side}`); }} data-side={player.side} data-active={active}>
      <span className={styles.panelContents}><span className={styles.name}>{player.name}</span><span className={styles.state}>{value.isOvertime ? active ? "Overtime · Running" : "Overtime" : active ? "Running" : state.status === "paused" ? "Paused" : ""}</span><span className={styles.timer} aria-hidden="true">{value.isOvertime ? "+" : ""}{formatTime(value.displaySeconds)}</span><span className="sr-only">{formatTime(value.displaySeconds)}{value.isOvertime ? " overtime" : " remaining"}</span><span className={styles.penalty}>{value.isOvertime ? `−${value.deduction} points` : ""}</span></span>
    </button>;
  };
  return <div data-match-screen className={styles.shell}>
    {showReport ? <SharedMatchReport key={`${snapshot.report?.id ?? "unreported"}:${snapshot.report?.revision ?? snapshot.matchRevision}`} snapshot={snapshot} display={display} canWrite={canWrite} waiting={waiting} busy={busy} error={error ?? (state.reviewRequired ? "Ask the organizer to review the clock before reporting." : null)} onCommand={reportCommand} onResume={() => act("resume")} onReload={local?.controllerConflict ? () => void initialize() : undefined} /> : <div className={`${styles.screen} ${faceToFace ? styles.faceToFace : ""}`}>
      {panel(0)}
      <div className={styles.controls}>
        <div className="sr-only" role="status" aria-live="polite">{state.status === "running" ? `${starterName} running` : state.status}. {snapshot.players[0].name}: {display[0].deduction} points deducted. {snapshot.players[1].name}: {display[1].deduction} points deducted.</div>
        {isReady && <p><strong>{starterName} starts</strong></p>}
        {state.status === "paused" && <p>Paused</p>}
        {readonly && <p className={styles.status}>Read-only · Clock on another device</p>}
        {state.reviewRequired && <p role="alert" className={styles.error}>Ask the organizer to review the time.</p>}
        {local?.recoveryPending && <p role="status" className={styles.status}>Reconnect to verify the clock.</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {local?.controllerConflict && <button className="secondary" onClick={() => void initialize()}>Reload clock</button>}
        <div className={styles.actions}>{isReady ? <button disabled={!canWrite || busy} onClick={() => act("start", state.activeSide)}>Start Timer</button> : <><button className="secondary" disabled={!canWrite || busy} onClick={() => act(state.status === "paused" ? "resume" : "pause")}>{state.status === "paused" ? "Resume" : "Pause"}</button><button className={display.some(value => value.isOvertime) ? styles.endHighlight : ""} disabled={!canWrite || busy} onClick={() => act("end")}>End game</button></>}</div>
        <Link href={`/t/${snapshot.tournamentId}`} style={{ fontSize: 13 }}>Tournament</Link>
        {stopped && <div className={styles.tools}><button onClick={() => setFlipped(value => !value)}>Flip sides</button><button className={styles.facing} aria-pressed={faceToFace} onClick={() => setFaceToFace(value => !value)}>Face to face {faceToFace ? "on" : "off"}</button></div>}
        {saveFailed && <p className={styles.status} role="status">Waiting to save</p>}
        {wakeUnavailable && state.status === "running" && <p className={styles.status}>Keep this screen awake</p>}
      </div>
      {panel(1)}
    </div>}
    {snapshot.isOrganizer && <section className={styles.report}><OrganizerMatchClock matchId={matchId} player1={snapshot.players[0]} player2={snapshot.players[1]} enabled={true} final={snapshot.matchStatus === "final"} /></section>}
  </div>;
}
