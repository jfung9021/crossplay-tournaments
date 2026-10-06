"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clockError, matchClockApi, matchControllerId } from "@/client/match-clock-api";
import type { MatchClockSnapshot } from "@/client/match-clock-api";

export function StartMatch({ matchId, reported }: { matchId: string; reported: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasClock, setHasClock] = useState(false);
  useEffect(() => {
    if (!reported) return;
    let active = true;
    void matchClockApi<MatchClockSnapshot>(matchId).then(value => { if (active) setHasClock(!!value.state); }).catch(() => {});
    return () => { active = false; };
  }, [matchId, reported]);
  async function open() {
    setBusy(true); setError(null);
    try {
      await matchClockApi(matchId, { controllerId: matchControllerId(matchId) }, "open");
      router.push(`/match/${matchId}`);
    } catch (cause) { setError(clockError(cause)); setBusy(false); }
  }
  if (reported && !hasClock) return null;
  return <div className="match-bottom">
    <button disabled={busy} onClick={() => void open()}>{busy ? "Opening…" : reported ? "Open Match" : "Start Match"}</button>
    {error && <p role="alert" className="notice error">{error}</p>}
  </div>;
}
