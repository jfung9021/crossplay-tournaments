"use client";

import { useEffect, useRef, useState } from "react";
import type { Entrant, Tournament } from "@/domain/types";

type Command = (name: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function IndividualPlayerAccess({ entrants, tournament, command }: { entrants: Entrant[]; tournament: Tournament; command: Command }) {
  const eligible = entrants.filter(entrant => entrant.active);
  if ((tournament.status !== "draft" && tournament.status !== "active") || eligible.length === 0) return null;

  return <details className="panel">
    <summary>Individual player access</summary>
    <PlayerInvitation
      key={`${tournament.id}:${tournament.status}:${eligible.map(entrant => entrant.id).join(",")}`}
      entrants={eligible}
      tournamentId={tournament.id}
      command={command}
    />
  </details>;
}

function PlayerInvitation({ entrants, tournamentId, command }: { entrants: Entrant[]; tournamentId: string; command: Command }) {
  const [entrantId, setEntrantId] = useState("");
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const selected = entrants.find(entrant => entrant.id === entrantId);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  function selectPlayer(next: string) {
    generation.current += 1;
    setEntrantId(next);
    setInvite(null);
    setCopied(false);
    setBusy(false);
    setError(null);
  }

  async function createInvitation() {
    if (!selected || busy) return;
    const request = ++generation.current;
    setBusy(true);
    setInvite(null);
    setCopied(false);
    setError(null);
    try {
      const result = await command("issue_invite", { entrantId: selected.id });
      if (!mounted.current || generation.current !== request) return;
      if (typeof result.inviteUrl !== "string" || !result.inviteUrl) throw new Error("The player link was not returned. Try again.");
      setInvite(result.inviteUrl);
    } catch (cause) {
      if (mounted.current && generation.current === request) setError(cause instanceof Error ? cause.message : "Could not create the player link.");
    } finally {
      if (mounted.current && generation.current === request) setBusy(false);
    }
  }

  async function copyInvitation() {
    if (!invite) return;
    const request = generation.current;
    try {
      await navigator.clipboard.writeText(invite);
      if (mounted.current && generation.current === request) { setCopied(true); setError(null); }
    } catch {
      if (mounted.current && generation.current === request) {
        inputRef.current?.select();
        setError("Select and copy the player link.");
      }
    }
  }

  return <div className="compact-stack section-space">
    <p className="muted">Optional: let players report from their own devices. Shared table devices do not need these links.</p>
    <div>
      <label htmlFor={`access-player-${tournamentId}`}>Player</label>
      <select id={`access-player-${tournamentId}`} value={entrantId} onChange={event => selectPlayer(event.target.value)}>
        <option value="">Choose a player</option>
        {entrants.map(entrant => <option value={entrant.id} key={entrant.id}>{entrant.name}</option>)}
      </select>
    </div>
    <p className="form-note">Creating a player link replaces that player’s earlier links and sessions.</p>
    <div><button type="button" className="secondary" disabled={busy || !selected} onClick={() => void createInvitation()}>{busy ? "Creating…" : "Create or replace player link"}</button></div>
    {invite && selected && <div>
      <label htmlFor={`access-invite-${tournamentId}`}>Private player link for {selected.name}</label>
      <div className="invite">
        <input ref={inputRef} id={`access-invite-${tournamentId}`} value={invite} readOnly onFocus={event => event.target.select()} />
        <button type="button" className="secondary" onClick={() => void copyInvitation()}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>}
    {error && <p className="notice error" role="alert">{error}</p>}
  </div>;
}
