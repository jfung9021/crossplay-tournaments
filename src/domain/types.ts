export type TournamentStatus = "draft" | "active" | "finished" | "archived";
export interface TournamentConfig {
  roundCount: number | null;
  penaltyIntervalSeconds: number;
  penaltyPoints: number;
  timeLimitSeconds: number | null;
}
export interface Tournament {
  id: string;
  slug: string;
  name: string;
  date: string | null;
  status: TournamentStatus;
  config: TournamentConfig;
  seed: string;
  version: number;
  createdAt: string;
  entrantCount: number;
  currentRound: number;
  correctionsOnly?: boolean;
}
export interface Entrant {
  id: string;
  name: string;
  seed: number;
  active: boolean;
}
export type OutcomeKind = "played" | "bye" | "forfeit" | "double_forfeit";
export interface ScoreInput {
  raw1: number;
  raw2: number;
  overtime1: number;
  overtime2: number;
}
export interface OfficialResult {
  raw1: number | null;
  raw2: number | null;
  overtime1: number;
  overtime2: number;
  adjusted1: number | null;
  adjusted2: number | null;
  points1: number;
  points2: number;
  difference1: number;
}
export interface MatchReport extends ScoreInput {
  id: string;
  revision: number;
  submittedBy: string;
  disputeReason: string | null;
}
export interface Match {
  id: string;
  roundNumber: number;
  tableNumber: number;
  player1Id: string;
  player2Id: string | null;
  kind: OutcomeKind;
  status: "unreported" | "awaiting_confirmation" | "disputed" | "final";
  revision: number;
  result: OfficialResult | null;
  report: MatchReport | null;
}
export interface Round {
  id: string;
  number: number;
  status: "draft" | "published" | "completed";
  engineVersion: string;
  inputHash: string;
  matches: Match[];
}
export interface Standing {
  entrantId: string;
  name: string;
  rank: number;
  matchPoints: number;
  difference: number;
  wins: number;
  draws: number;
  losses: number;
  played: number;
  active: boolean;
}
export interface AuditEvent {
  id: string;
  action: string;
  reason: string | null;
  createdAt: string;
}
export interface TournamentSnapshot {
  tournament: Tournament;
  entrants: Entrant[];
  rounds: Round[];
  standings: Standing[];
  viewer: { isOrganizer: boolean; entrantId: string | null };
  audit?: AuditEvent[];
}
export interface Pairing { player1Id: string; player2Id: string | null }
export interface PairingInput {
  entrants: Entrant[];
  rounds: Round[];
  seed: string;
  roundNumber: number;
}
export interface PairingOutput {
  pairs: Pairing[];
  engineVersion: string;
}
export type Actor = { userId: string } | { sessionHash: string } | Record<string, never>;
