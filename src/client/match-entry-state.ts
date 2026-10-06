import type { MatchClockSnapshot } from "./match-clock-api";
import type { Match } from "@/domain/types";

export interface MatchEntryRead {
  snapshot: MatchClockSnapshot | null;
  loading: boolean;
  error: string | null;
}

export interface MatchEntryAction {
  label: "Start Match" | "Continue match" | "Report scores" | "Review scores" | "Review time" | "View match" | "Open match";
  status: string | null;
  disabled?: boolean;
}

/** Card labels describe the latest known state; only /open can grant control. */
export function resolveMatchEntryAction(match: Pick<Match, "status" | "player2Id">, entry: MatchEntryRead, controllerId: string | null): MatchEntryAction | null {
  const snapshot = entry.snapshot;
  if (!match.player2Id || match.status === "final" || snapshot?.matchStatus === "final") return null;
  const reported = match.status === "awaiting_confirmation" || match.status === "disputed" || snapshot?.matchStatus === "awaiting_confirmation" || snapshot?.matchStatus === "disputed";
  // Individual and organizer reports retain their existing result-review path,
  // even if a clock was previously created for this match.
  if (reported && snapshot?.report?.confirmationMethod !== "shared_device") return null;
  if (!snapshot) return { label: "Open match", status: entry.loading ? "Checking match…" : null, disabled: entry.loading };
  if (snapshot.controllerId && (snapshot.controllerId !== controllerId || !snapshot.canControl)) return { label: "View match", status: "Clock on another device" };
  if (snapshot.state?.reviewRequired) return { label: "Review time", status: "Time review needed" };
  if (reported) return { label: "Review scores", status: match.status === "disputed" || snapshot.matchStatus === "disputed" ? "Needs organizer review" : "Awaiting confirmation" };
  if (!snapshot.state) return { label: "Start Match", status: null };
  switch (snapshot.state.status) {
    case "ready": return { label: "Start Match", status: "Ready" };
    case "running": return { label: "Continue match", status: "In progress" };
    case "paused": return { label: "Continue match", status: "Paused" };
    case "ended": return { label: "Report scores", status: "Game ended" };
  }
}
