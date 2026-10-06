"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { clockError, matchClockApi } from "@/client/match-clock-api";
import type { MatchClockSnapshot } from "@/client/match-clock-api";
import { DurationInput } from "@/components/duration-input";
import { formatDuration, parseDuration } from "@/domain/duration";

type Player = { id: string; name: string };

export function OrganizerMatchClock({ matchId, player1, player2, final, embedded = false, initialAction = "correct_starter" }: { matchId: string; player1: Player; player2: Player; enabled: boolean; final: boolean; embedded?: boolean; initialAction?: string }) {
  const [snapshot, setSnapshot] = useState<MatchClockSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState(initialAction);
  const [starterId, setStarterId] = useState(player1.id);
  const [used1, setUsed1] = useState("0:00");
  const [used2, setUsed2] = useState("0:00");
  const [changed, setChanged] = useState<[boolean, boolean]>([false, false]);
  const [activeSide, setActiveSide] = useState("1");
  const [reason, setReason] = useState("");
  const accept = useCallback((result: MatchClockSnapshot) => {
    setSnapshot(result);
    setStarterId(result.start?.entrantId ?? player1.id);
    setUsed1(formatDuration(Math.floor((result.state?.usedMs[0] ?? 0) / 1000)));
    setUsed2(formatDuration(Math.floor((result.state?.usedMs[1] ?? 0) / 1000)));
    setChanged([false, false]);
    setActiveSide(String(result.state?.activeSide ?? 1));
  }, [player1.id]);
  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const result = await matchClockApi<MatchClockSnapshot>(matchId);
      accept(result);
    } catch (cause) { setError(clockError(cause)); }
    finally { setBusy(false); }
  }, [accept, matchId]);
  useEffect(() => { if (embedded) void Promise.resolve().then(load); }, [embedded, load]);
  useEffect(() => { void Promise.resolve().then(() => setAction(initialAction)); }, [initialAction]);
  async function apply(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      const durations = action === "correct_clock" ? [used1, used2].map((value, index) => {
        if (!changed[index]) return snapshot?.state?.usedMs[index] ?? 0;
        const seconds = parseDuration(value);
        if (seconds === null || seconds > 172800) throw new Error("Enter a duration from 0:00 to 2880:00.");
        return seconds * 1000;
      }) : undefined;
      const payload = action === "correct_clock" ? { usedMs: durations, activeSide: Number(activeSide), reason } : action === "revoke_match_link" ? { reason } : { entrantId: starterId, reason };
      const result = await matchClockApi<MatchClockSnapshot>(matchId, { command: action, payload, ...(action === "correct_clock" ? { expectedClockVersion: snapshot?.state?.version } : {}) });
      accept(result); setReason(""); setNotice("Saved.");
    } catch (cause) { setError(clockError(cause)); }
    finally { setBusy(false); }
  }
  const content = <>
    {error && <p role="alert" className="error notice" style={{ marginTop: 12 }}>{error}</p>}
    {notice && <p role="status" className="form-note">{notice}</p>}
      {snapshot && <div className="compact-stack">
        <p className="form-note">{snapshot.start ? `${snapshot.players.find(item => item.id === snapshot.start!.entrantId)?.name} starts · ${snapshot.start.method.replaceAll("_", " ")}${snapshot.start.played ? " · Played start recorded" : " · Not started"}` : "No start recorded."}{snapshot.state && ` Clock: ${snapshot.state.status}${snapshot.state.reviewRequired ? " · Time review required" : ""}.`}</p>
        {snapshot.start && <p className="form-note">Before this round: {player1.name} {snapshot.start.counts.firsts1} first / {snapshot.start.counts.seconds1} second; {player2.name} {snapshot.start.counts.firsts2} first / {snapshot.start.counts.seconds2} second.</p>}
        <form className="compact-stack" onSubmit={event => void apply(event)}>
          <label htmlFor={`clock-action-${matchId}`}>Action<select id={`clock-action-${matchId}`} value={action} onChange={event => setAction(event.target.value)}><option value="correct_starter">Correct first player</option><option value="record_manual_start">Record external-clock first player</option>{snapshot.state && !final && <option value="correct_clock">Review / correct used time</option>}{!final && <option value="revoke_match_link">Revoke shared device</option>}</select></label>
          {(action === "correct_starter" || action === "record_manual_start") && <label htmlFor={`clock-starter-${matchId}`}>First player<select id={`clock-starter-${matchId}`} value={starterId} onChange={event => setStarterId(event.target.value)}><option value={player1.id}>{player1.name}</option><option value={player2.id}>{player2.name}</option></select></label>}
          {action === "correct_clock" && <><div className="form-grid"><div><label htmlFor={`clock-used1-${matchId}`}>{player1.name}: time used (m:ss)</label><DurationInput id={`clock-used1-${matchId}`} required minSeconds={0} maxSeconds={172800} value={used1} onChange={value => { setUsed1(value); setChanged(previous => [true, previous[1]]); }} /></div><div><label htmlFor={`clock-used2-${matchId}`}>{player2.name}: time used (m:ss)</label><DurationInput id={`clock-used2-${matchId}`} required minSeconds={0} maxSeconds={172800} value={used2} onChange={value => { setUsed2(value); setChanged(previous => [previous[0], true]); }} /></div></div><label htmlFor={`clock-active-${matchId}`}>Player to resume<select id={`clock-active-${matchId}`} value={activeSide} onChange={event => setActiveSide(event.target.value)}><option value="1">{player1.name}</option><option value="2">{player2.name}</option></select></label></>}
          <label htmlFor={`clock-reason-${matchId}`}>Reason<input id={`clock-reason-${matchId}`} required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <div className="actions"><button type="submit" className="secondary" disabled={busy}>{busy ? "Saving…" : "Save record"}</button><button type="button" className="secondary" disabled={busy} onClick={() => void load()}>Refresh</button></div>
        </form>
      </div>}
  </>;
  return embedded ? <div className="compact-stack">{content}</div> : <details className="match-bottom" onToggle={event => { if (event.currentTarget.open && !snapshot) void load(); }}><summary>Organizer actions</summary>{content}</details>;
}
