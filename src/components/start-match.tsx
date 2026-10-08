"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clockError, matchClockApi, matchControllerId } from "@/client/match-clock-api";
import { useMatchEntry } from "@/client/use-match-entries";
import { resolveMatchEntryAction } from "@/client/match-entry-state";
import type { Match, TournamentSnapshot } from "@/domain/types";
import { matchLocation } from "@/domain/tables";
import { rememberTableMatch, tableDeviceId, useTableDevice } from "@/client/table-device";

export function StartMatch({ match, tournament, onReviewTime }: { match: Match; tournament?: TournamentSnapshot; onReviewTime?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entry = useMatchEntry(match.id);
  const device = useTableDevice();
  const location = tournament ? matchLocation(tournament, match) : undefined;
  const managed = !!tournament?.tables?.enabled;
  const assigned = tournament?.tables?.devices?.some(duty => duty.deviceId === device.id && duty.tableNumber === location?.tableNumber && duty.generation === (tournament.tournament.runGeneration ?? 0));
  let controllerId: string | null = null;
  try { controllerId = localStorage.getItem(`crossplay.clock.controller.${match.id}`); } catch { /* Reading a label never creates a controller. */ }
  const action = resolveMatchEntryAction(match, entry, controllerId);
  async function open() {
    if (action?.label === "Review time" && onReviewTime) { onReviewTime(); return; }
    setBusy(true); setError(null);
    try {
      await matchClockApi(match.id, { controllerId: matchControllerId(match.id), ...(managed ? { deviceId: tableDeviceId(), expectedOperationsVersion: tournament!.tables!.version } : {}) }, "open");
      if (managed) rememberTableMatch(tournament!.tournament.id, match.id);
      router.push(`/match/${match.id}`);
    } catch (cause) { setError(clockError(cause)); setBusy(false); }
  }
  if (!action) return null;
  if (managed && !location?.ready) return <p className="notice">Waiting for the earlier match at Table {location?.tableNumber}. Its result must be final before this match can start.</p>;
  if (managed && !assigned) return <div className="match-bottom"><p className="form-note">Use the assigned table device to start this match.</p><div className="actions"><Link href={`/t/${tournament!.tournament.slug}/table`}>My table</Link>{entry.snapshot?.state && <Link href={`/match/${match.id}`}>View match</Link>}</div></div>;
  return <div className="match-bottom">
    {action.status && <p className="muted">{action.status}</p>}
    <button disabled={busy || action.disabled} onClick={() => void open()}>{busy ? "Opening…" : action.label}</button>
    {entry.error && <p role="status" className="form-note">Could not refresh match status. <button type="button" className="text-button" onClick={entry.retry}>Try again</button></p>}
    {error && <p role="alert" className="notice error">{error}</p>}
  </div>;
}
