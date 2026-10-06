"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { clockError, matchClockApi } from "@/client/match-clock-api";
import type { MatchClockSnapshot } from "@/client/match-clock-api";

type Player = { id: string; name: string };

export function OrganizerMatchClock({ matchId, player1, player2, final }: { matchId: string; player1: Player; player2: Player; enabled: boolean; final: boolean }) {
  const [snapshot, setSnapshot] = useState<MatchClockSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState("correct_starter");
  const [starterId, setStarterId] = useState(player1.id);
  const [used1, setUsed1] = useState("0");
  const [used2, setUsed2] = useState("0");
  const [activeSide, setActiveSide] = useState("1");
  const [reason, setReason] = useState("");
  async function load() {
    setBusy(true); setError(null);
    try {
      const result = await matchClockApi<MatchClockSnapshot>(matchId);
      setSnapshot(result);
      setStarterId(result.start?.entrantId ?? player1.id);
      setUsed1(String((result.state?.usedMs[0] ?? 0) / 1000));
      setUsed2(String((result.state?.usedMs[1] ?? 0) / 1000));
      setActiveSide(String(result.state?.activeSide ?? 1));
    } catch (cause) { setError(clockError(cause)); }
    finally { setBusy(false); }
  }
  async function apply(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      const payload = action === "correct_clock" ? { usedMs: [Math.round(Number(used1) * 1000), Math.round(Number(used2) * 1000)], activeSide: Number(activeSide), reason } : action === "revoke_match_link" ? { reason } : { entrantId: starterId, reason };
      const result = await matchClockApi<MatchClockSnapshot>(matchId, { command: action, payload, ...(action === "correct_clock" ? { expectedClockVersion: snapshot?.state?.version } : {}) });
      setSnapshot(result); setReason(""); setNotice("Saved.");
    } catch (cause) { setError(clockError(cause)); }
    finally { setBusy(false); }
  }
  return <div className="match-bottom">
    {error && <p role="alert" className="error notice" style={{ marginTop: 12 }}>{error}</p>}
    {notice && <p role="status" className="form-note">{notice}</p>}
    <details style={{ marginTop: 12 }} onToggle={event => { if (event.currentTarget.open && !snapshot) void load(); }}>
      <summary>Clock and first-player records</summary>
      {snapshot && <div className="compact-stack">
        <p className="form-note">{snapshot.start ? `${snapshot.players.find(item => item.id === snapshot.start!.entrantId)?.name} starts · ${snapshot.start.method.replaceAll("_", " ")}${snapshot.start.played ? " · Played start recorded" : " · Not started"}` : "No start recorded."}{snapshot.state && ` Clock: ${snapshot.state.status}${snapshot.state.reviewRequired ? " · Time review required" : ""}.`}</p>
        {snapshot.start && <p className="form-note">Before this round: {player1.name} {snapshot.start.counts.firsts1} first / {snapshot.start.counts.seconds1} second; {player2.name} {snapshot.start.counts.firsts2} first / {snapshot.start.counts.seconds2} second.</p>}
        <form className="compact-stack" onSubmit={event => void apply(event)}>
          <label htmlFor={`clock-action-${matchId}`}>Action<select id={`clock-action-${matchId}`} value={action} onChange={event => setAction(event.target.value)}><option value="correct_starter">Correct first player</option><option value="record_manual_start">Record external-clock first player</option>{snapshot.state && !final && <option value="correct_clock">Review / correct used time</option>}{!final && <option value="revoke_match_link">Revoke shared device</option>}</select></label>
          {(action === "correct_starter" || action === "record_manual_start") && <label htmlFor={`clock-starter-${matchId}`}>First player<select id={`clock-starter-${matchId}`} value={starterId} onChange={event => setStarterId(event.target.value)}><option value={player1.id}>{player1.name}</option><option value={player2.id}>{player2.name}</option></select></label>}
          {action === "correct_clock" && <><div className="form-grid"><label htmlFor={`clock-used1-${matchId}`}>{player1.name}: used seconds<input id={`clock-used1-${matchId}`} type="number" required min={0} max={172800} step="0.001" value={used1} onChange={event => setUsed1(event.target.value)} /></label><label htmlFor={`clock-used2-${matchId}`}>{player2.name}: used seconds<input id={`clock-used2-${matchId}`} type="number" required min={0} max={172800} step="0.001" value={used2} onChange={event => setUsed2(event.target.value)} /></label></div><label htmlFor={`clock-active-${matchId}`}>Player to resume<select id={`clock-active-${matchId}`} value={activeSide} onChange={event => setActiveSide(event.target.value)}><option value="1">{player1.name}</option><option value="2">{player2.name}</option></select></label></>}
          <label htmlFor={`clock-reason-${matchId}`}>Reason<input id={`clock-reason-${matchId}`} required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <div className="actions"><button type="submit" className="secondary" disabled={busy}>{busy ? "Saving…" : "Save record"}</button><button type="button" className="secondary" disabled={busy} onClick={() => void load()}>Refresh</button></div>
        </form>
      </div>}
    </details>
  </div>;
}
