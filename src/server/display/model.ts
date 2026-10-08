import "server-only";
import { createHash } from "node:crypto";
import type { DisplayMatch, TournamentDisplay } from "@/domain/display";
import { calculateStandings } from "@/domain/standings";
import { matchLocation, physicalTable } from "@/domain/tables";
import type { Match, TournamentSnapshot } from "@/domain/types";
import { AppError } from "@/server/errors";

export type DisplayMetadata = Record<string, { status: DisplayMatch["status"]; completedAt: string | null }>;
const clockStatuses = new Set<DisplayMatch["status"]>(["ready", "playing", "paused", "reporting", "awaiting_confirmation", "organizer_review", "final", "outstanding", "queued"]);

/** The last boundary is an allowlist, even if an upstream source is privileged. */
export function buildDisplay(snapshot: TournamentSnapshot, metadata: DisplayMetadata | null, serverNowMs: number): TournamentDisplay {
  const published = snapshot.rounds.filter(round => round.status !== "draft").sort((a, b) => a.number - b.number);
  if (snapshot.tournament.status === "draft" || snapshot.tournament.status === "archived" && snapshot.tournament.archivedFromStatus === "draft" || !published.length) {
    throw new AppError("Tournament not yet available.", 404);
  }
  const entrants = new Map(snapshot.entrants.map(entrant => [entrant.id, entrant]));
  function project(match: Match): DisplayMatch {
    const location = matchLocation(snapshot, match);
    const clock = metadata?.[match.id];
    let status: DisplayMatch["status"] = "outstanding";
    if (match.status === "final") status = "final";
    else if (match.status === "disputed") status = "organizer_review";
    else if (clock?.status === "organizer_review") status = "organizer_review";
    else if (match.status === "awaiting_confirmation") status = "awaiting_confirmation";
    else if (snapshot.tournament.status === "active") {
      if (location && !location.ready) status = "queued";
      else if (clock && clockStatuses.has(clock.status) && clock.status !== "final") status = clock.status;
    }
    const result = match.status === "final" ? match.result : null;
    const player = (id: string) => ({ id, name: entrants.get(id)?.name ?? "Player" });
    return {
      id: match.id, roundNumber: match.roundNumber, tableNumber: match.player2Id ? physicalTable(snapshot, match) : null,
      queueOrder: location?.queueOrder ?? 1, player1: player(match.player1Id), player2: match.player2Id ? player(match.player2Id) : null,
      kind: match.kind, status, result: result ? { adjusted1: result.adjusted1, adjusted2: result.adjusted2, points1: result.points1, points2: result.points2 } : null,
      completedAt: result ? clock?.completedAt ?? null : null,
    };
  }
  const current = published.at(-1)!;
  const matches = current.matches.map(project).sort((a, b) => (a.tableNumber ?? Number.MAX_SAFE_INTEGER) - (b.tableNumber ?? Number.MAX_SAFE_INTEGER) || a.queueOrder - b.queueOrder || a.id.localeCompare(b.id));
  const latestResult = published.flatMap(round => round.matches).filter(match => match.player2Id && match.status === "final" && match.result).map(project)
    .filter(match => match.completedAt !== null).sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!) || a.id.localeCompare(b.id))[0] ?? null;
  const body = {
    clockStatusAvailable: metadata !== null,
    tournament: { id: snapshot.tournament.id, slug: snapshot.tournament.slug, name: snapshot.tournament.name, status: snapshot.tournament.status,
      roundCount: snapshot.tournament.config.roundCount, currentRound: current.number, runGeneration: snapshot.tournament.runGeneration ?? 0 },
    round: { number: current.number, totalMatches: matches.filter(match => match.player2).length, finalMatches: matches.filter(match => match.player2 && match.status === "final").length,
      matches: matches.filter(match => match.player2), byes: matches.filter(match => !match.player2) },
    standings: calculateStandings(snapshot.entrants, published), latestResult,
  };
  return { ...body, revision: createHash("sha256").update(JSON.stringify(body)).digest("hex"), serverNowMs };
}
