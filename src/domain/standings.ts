import type { Entrant, Round, Standing } from "./types";

/** Draft pairings and unconfirmed reports never contribute to official standings. */
export function calculateStandings(entrants: readonly Entrant[], rounds: readonly Round[]): Standing[] {
  const byId = new Map<string, Standing>(entrants.map((entrant) => [entrant.id, {
    entrantId: entrant.id, name: entrant.name, rank: 0, matchPoints: 0,
    difference: 0, wins: 0, draws: 0, losses: 0, played: 0, active: entrant.active,
  }]));
  for (const round of rounds) {
    if (round.status === "draft") continue;
    for (const match of round.matches) {
      if (match.status !== "final" || !match.result) continue;
      const result = match.result;
      const sides = [
        { id: match.player1Id, points: result.points1, difference: result.difference1 },
        { id: match.player2Id, points: result.points2, difference: -result.difference1 },
      ];
      for (const side of sides) {
        if (!side.id) continue;
        const standing = byId.get(side.id);
        if (!standing) throw new Error("A result references a player outside this tournament.");
        standing.matchPoints += side.points / 2;
        // Administrative outcomes always have zero difference, even if malformed
        // historic data contains a score. Played inputs are the only source.
        if (match.kind === "played") standing.difference += side.difference;
        standing.played += 1;
        if (side.points === 2) standing.wins += 1;
        else if (side.points === 1) standing.draws += 1;
        else standing.losses += 1;
      }
    }
  }
  const seedOrder = new Map(entrants.map((entrant) => [entrant.id, entrant.seed]));
  const rows = [...byId.values()].sort((a, b) =>
    b.matchPoints - a.matchPoints || b.difference - a.difference ||
    (seedOrder.get(a.entrantId)! - seedOrder.get(b.entrantId)!) ||
    (a.entrantId < b.entrantId ? -1 : a.entrantId > b.entrantId ? 1 : 0));
  for (const [index, row] of rows.entries()) {
    const previous = rows[index - 1];
    row.rank = previous && previous.matchPoints === row.matchPoints && previous.difference === row.difference
      ? previous.rank : index + 1;
  }
  return rows;
}
