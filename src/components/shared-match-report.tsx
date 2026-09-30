"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { MatchClockSnapshot } from "@/client/match-clock-api";
import type { ClockDisplay } from "@/domain/clock-types";
import styles from "./match-clock.module.css";

export type SharedReportCommand = (command: string, payload: Record<string, unknown>) => Promise<void>;

export function SharedMatchReport({ snapshot, display, canWrite, waiting, busy, error, onCommand, onResume, onReload }: { snapshot: MatchClockSnapshot; display: [ClockDisplay, ClockDisplay]; canWrite: boolean; waiting: boolean; busy: boolean; error: string | null; onCommand: SharedReportCommand; onResume: () => void; onReload?: () => void }) {
  const [editing, setEditing] = useState(!snapshot.report);
  const [raw1, setRaw1] = useState(snapshot.report?.raw1.toString() ?? "");
  const [raw2, setRaw2] = useState(snapshot.report?.raw2.toString() ?? "");
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const values = [raw1, raw2];
  const report = snapshot.report;
  const final = snapshot.matchStatus === "final";
  const disputed = snapshot.matchStatus === "disputed";
  const valid = values.every(value => value.trim() !== "" && Number.isInteger(Number(value)) && Number(value) >= -100000 && Number(value) <= 100000);
  const disabled = busy || waiting || !canWrite;
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onCommand("submit_shared_report", { raw1: Number(raw1), raw2: Number(raw2), expectedRevision: snapshot.matchRevision, clockVersion: snapshot.state?.version }); setEditing(false); }
    catch { /* The owning screen keeps errors alongside the preserved inputs. */ }
  }
  const adjusted = final && snapshot.result ? [snapshot.result.adjusted1, snapshot.result.adjusted2] : report && !editing ? [report.adjusted1, report.adjusted2] : values.map((value, index) => value === "" ? null : Number(value) - display[index].deduction);
  const recorded = final && snapshot.result ? snapshot.result : report;
  const summaries = snapshot.players.map((player, index) => {
    const raw = recorded ? player.side === 1 ? recorded.raw1 : recorded.raw2 : null;
    const overtime = recorded ? player.side === 1 ? recorded.overtime1 : recorded.overtime2 : display[index].overtimeSeconds;
    const score = adjusted[index];
    return { raw, overtime, deduction: raw !== null && score !== null ? raw - score : display[index].deduction };
  });
  return <section className={styles.report} aria-label="Match scores">
    <div className={styles.reportHeader}><p className="eyebrow">Round {snapshot.roundNumber} · Table {snapshot.tableNumber}</p><h1>{final ? "Match complete" : disputed ? "Organizer review" : editing ? "Report scores" : "Review scores"}</h1>{final && <p>{snapshot.officialConfirmationMethod === "shared_device" ? "Both players confirmed." : snapshot.officialConfirmationMethod === "organizer" ? "Organizer finalized." : "Result recorded."}</p>}</div>
    {waiting && <p className={styles.reportNotice} role="status">Waiting to save the clock. Reconnect before reporting.</p>}
    {error && <p className={`${styles.reportNotice} ${styles.error}`} role="alert">{error}</p>}
    {onReload && <button className="secondary" onClick={onReload}>Reload clock</button>}
    {disputed && <p className={styles.reportNotice}>The organizer will review this result.{report?.disputeReason && ` ${report.disputeReason}`}</p>}
    {editing && !final && !disputed ? <form onSubmit={event => void submit(event)}>
      <div className={styles.reportCards}>{snapshot.players.map((player, index) => <div className={styles.reportCard} key={player.id}>
        <h2>{player.name}</h2><label htmlFor={`raw-score-${player.side}`}>Game score</label><input id={`raw-score-${player.side}`} aria-label={`${player.name} game score`} type="number" inputMode="numeric" min={-100000} max={100000} step={1} required value={values[index]} onChange={event => index === 0 ? setRaw1(event.target.value) : setRaw2(event.target.value)} />
        <p>{display[index].overtimeSeconds}s overtime · −{display[index].deduction} points</p>{values[index] !== "" && <p>Final score <strong>{adjusted[index]}</strong></p>}
      </div>)}</div>
      <div className={styles.reportActions}><button type="submit" disabled={disabled || !valid}>{busy ? "Saving…" : "Review scores"}</button>{report && <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel edit</button>}</div>
      {!report && <div className={styles.reportActions}><button type="button" className="secondary" disabled={busy || !canWrite} onClick={onResume}>Resume game</button></div>}
    </form> : <>
      <div className={styles.reportCards}>{snapshot.players.map((player, index) => <div className={styles.reportCard} key={player.id}>
        <h2>{player.name}</h2><div className={styles.finalScore}>{adjusted[index] ?? "—"}</div><p>{summaries[index].raw ?? "—"} game score · −{summaries[index].deduction} points</p><p>{summaries[index].overtime}s overtime</p>
        {!final && !disputed && report && <button className={`${styles.reviewButton} ${report.acknowledgedSides.includes(player.side) ? "secondary" : ""}`} disabled={disabled || report.acknowledgedSides.includes(player.side)} onClick={() => void onCommand("acknowledge_shared_report", { reportId: report.id, expectedRevision: snapshot.matchRevision, side: player.side }).catch(() => {})}>{report.acknowledgedSides.includes(player.side) ? `${player.name} confirmed` : `${player.name}: agree`}</button>}
      </div>)}</div>
      {!final && !disputed && report && <div className={styles.reportActions}><button className="secondary" disabled={disabled} onClick={() => { setRaw1(String(report.raw1)); setRaw2(String(report.raw2)); setEditing(true); }}>Edit scores</button><button className="secondary" disabled={disabled} onClick={() => setDisputing(true)}>Report issue</button></div>}
    </>}
    {disputing && report && <form className="compact-stack section-space" onSubmit={event => { event.preventDefault(); void onCommand("dispute_shared_report", { reportId: report.id, expectedRevision: snapshot.matchRevision, reason }).then(() => setDisputing(false)).catch(() => {}); }}><label htmlFor="shared-dispute">What needs to change?</label><textarea id="shared-dispute" required rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /><div className={styles.reportActions}><button disabled={disabled}>Send to organizer</button><button type="button" className="secondary" disabled={busy} onClick={() => setDisputing(false)}>Cancel</button></div></form>}
  </section>;
}
