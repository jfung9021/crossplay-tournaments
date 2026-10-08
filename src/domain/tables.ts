import type { Match, TournamentSnapshot } from "./types";
export function matchLocation(snapshot: TournamentSnapshot, match: Pick<Match, "id">) {
  return snapshot.tables?.locations.find(location => location.matchId === match.id);
}
export function physicalTable(snapshot: TournamentSnapshot, match: Pick<Match, "id" | "tableNumber">) {
  return matchLocation(snapshot, match)?.tableNumber ?? match.tableNumber;
}
export function tableQueue(snapshot: TournamentSnapshot, table: number, roundNumber?: number) {
  const round = roundNumber === undefined ? snapshot.rounds.filter(round => round.status !== "draft").at(-1) : snapshot.rounds.find(round => round.number === roundNumber);
  return (round?.matches ?? []).filter(match => match.player2Id && physicalTable(snapshot, match) === table)
    .sort((a, b) => (matchLocation(snapshot, a)?.queueOrder ?? a.tableNumber) - (matchLocation(snapshot, b)?.queueOrder ?? b.tableNumber));
}
