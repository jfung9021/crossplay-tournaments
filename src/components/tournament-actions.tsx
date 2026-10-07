"use client";

import { useState, type FormEvent } from "react";
import type { Tournament } from "@/domain/types";

const actions = {
  archive_tournament: { label: "Archive tournament", detail: "Hide this tournament from the public list and stop clocks and submissions. Published links stay accessible as read-only history. Keep players, settings and saved results; unsent changes on offline devices cannot be saved. You can restore it later and review unfinished clocks before continuing." },
  restore_tournament: { label: "Restore tournament", detail: "Return to the state before archiving. Unfinished clocks stay paused and may need an organizer to review their saved time." },
  reset_tournament: { label: "Reset tournament", detail: "Clear all rounds, results, clocks and private access links. Keep the current players and settings, reactivate withdrawn players, and return to an editable draft. This cannot be undone." },
  delete_tournament: { label: "Delete permanently", detail: "Permanently delete this tournament, its players, rounds, results, clocks and private access links. This cannot be undone." },
} as const;
type Action = keyof typeof actions;

export function TournamentActions({ tournament, roundCount, matchCount, command }: { tournament: Tournament; roundCount: number; matchCount: number; command: (name: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>> }) {
  const [action, setAction] = useState<Action | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destructive = action === "reset_tournament" || action === "delete_tournament";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!action) return;
    setBusy(true); setError(null);
    try { await command(action, destructive ? { confirmationName: name } : {}); setAction(null); setName(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "This action could not be completed."); }
    finally { setBusy(false); }
  }
  return <details id="tournament-actions" className="danger-zone"><summary>Tournament actions</summary>
    {!tournament.lifecycleAvailable ? <p className="muted">Tournament actions are not available yet.</p> : action ? <form className="form" onSubmit={submit}>
      <h3>{actions[action].label}</h3><p>{actions[action].detail}</p>
      <p>{tournament.entrantCount} players · {roundCount} rounds · {matchCount} matches</p>
      {destructive && <div><label htmlFor="confirmation-name">Type the tournament name to confirm</label><p className="player-name"><strong>{tournament.name}</strong></p><input id="confirmation-name" autoComplete="off" maxLength={120} value={name} onChange={event => setName(event.target.value)} required /></div>}
      {error && <p role="alert" className="notice error">{error}</p>}
      <div className="actions"><button className={destructive ? "danger" : ""} disabled={busy || destructive && name !== tournament.name}>{busy ? "Saving…" : actions[action].label}</button><button className="secondary" type="button" disabled={busy} onClick={() => { setAction(null); setName(""); setError(null); }}>Cancel</button></div>
    </form> : <div className="actions">{([tournament.status === "archived" ? "restore_tournament" : "archive_tournament", "reset_tournament", "delete_tournament"] as Action[]).map(key => <button key={key} className={key === "delete_tournament" ? "danger" : "secondary"} onClick={() => { setAction(key); setError(null); }}>{actions[key].label}</button>)}</div>}
  </details>;
}
