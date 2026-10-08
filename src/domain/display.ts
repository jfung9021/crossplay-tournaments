import type { OutcomeKind, Standing, TournamentStatus } from "./types";

export interface DisplayMatch {
  id: string;
  roundNumber: number;
  tableNumber: number | null;
  queueOrder: number;
  player1: { id: string; name: string };
  player2: { id: string; name: string } | null;
  kind: OutcomeKind;
  status: "ready" | "playing" | "paused" | "reporting" | "awaiting_confirmation" | "organizer_review" | "final" | "outstanding" | "queued";
  result: { adjusted1: number | null; adjusted2: number | null; points1: number; points2: number } | null;
  completedAt: string | null;
}

export interface TournamentDisplay {
  revision: string;
  serverNowMs: number;
  clockStatusAvailable: boolean;
  tournament: { id: string; slug: string; name: string; status: TournamentStatus; roundCount: number | null; currentRound: number; runGeneration: number };
  round: { number: number; totalMatches: number; finalMatches: number; matches: DisplayMatch[]; byes: DisplayMatch[] } | null;
  standings: Standing[];
  latestResult: DisplayMatch | null;
}
