"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clockError, matchClockApi, matchControllerId } from "@/client/match-clock-api";
import { useMatchEntry } from "@/client/use-match-entries";
import { resolveMatchEntryAction } from "@/client/match-entry-state";
import type { Match } from "@/domain/types";

export function StartMatch({ match, onReviewTime }: { match: Match; onReviewTime?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entry = useMatchEntry(match.id);
  let controllerId: string | null = null;
  try { controllerId = localStorage.getItem(`crossplay.clock.controller.${match.id}`); } catch { /* Reading a label never creates a controller. */ }
  const action = resolveMatchEntryAction(match, entry, controllerId);
  async function open() {
    if (action?.label === "Review time" && onReviewTime) { onReviewTime(); return; }
    setBusy(true); setError(null);
    try {
      await matchClockApi(match.id, { controllerId: matchControllerId(match.id) }, "open");
      router.push(`/match/${match.id}`);
    } catch (cause) { setError(clockError(cause)); setBusy(false); }
  }
  if (!action) return null;
  return <div className="match-bottom">
    {action.status && <p className="muted">{action.status}</p>}
    <button disabled={busy || action.disabled} onClick={() => void open()}>{busy ? "Opening…" : action.label}</button>
    {entry.error && <p role="status" className="form-note">Could not refresh match status. <button type="button" className="text-button" onClick={entry.retry}>Try again</button></p>}
    {error && <p role="alert" className="notice error">{error}</p>}
  </div>;
}
