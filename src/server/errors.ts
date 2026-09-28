export class AppError extends Error {
  constructor(message: string, public status = 400, public issues?: { line: number; message: string }[]) {
    super(message);
    this.name = "AppError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) return Response.json({ error: error.message, ...(error.issues ? { issues: error.issues } : {}) }, { status: error.status });
  const database = error as { code?: string; message?: string };
  const message = database?.message ?? "";
  const messages: Record<string, [number, string]> = {
    FORBIDDEN: [403, "You do not have access to this action."],
    NOT_FOUND: [404, "Tournament or match not found."],
    STALE_VERSION: [409, "This tournament changed. Refresh and try again."],
    STALE_PAIRINGS: [409, "These pairings are out of date. Generate a new round preview."],
    STALE_REVISION: [409, "This result changed. Refresh before submitting again."],
    STALE_REPORT: [409, "This report changed. Review the latest scores before confirming."],
    IDEMPOTENCY_MISMATCH: [409, "This request was already used for different data. Refresh and try again."],
    INVALID_INVITE: [400, "This player link has expired or was already used. Ask the organizer for a new link."],
    TOURNAMENT_CLOSED: [400, "This tournament is finished."],
    TOURNAMENT_NOT_ACTIVE: [400, "This tournament is not active."],
    TOURNAMENT_NOT_FINISHED: [400, "Finish the tournament first."],
    RULES_LOCKED: [400, "Tournament rules are locked after play starts."],
    ROSTER_LOCKED: [400, "The roster is locked. You can withdraw players from future rounds."],
    CAPACITY_EXCEEDED: [400, "A tournament supports up to 256 players."],
    INSUFFICIENT_PLAYERS: [400, "Add at least two active players."],
    TOO_MANY_ROUNDS: [400, "There are too many rounds for this player count without rematches."],
    UNRESOLVED_MATCHES: [409, "Resolve every match in the current round first."],
    INVALID_ROUND: [400, "All scheduled rounds have been played, or this round is out of order."],
    INCOMPLETE_PAIRINGS: [400, "The pairings do not cover every active player."],
    DUPLICATE_ASSIGNMENT: [400, "A player cannot be paired twice in one round."],
    REPEATED_BYE: [400, "This player has already received a full-point unplayed win."],
    REPEATED_OPPONENT: [400, "These players have already been paired."],
    INVALID_ENTRANT: [400, "Choose an active player from this tournament."],
    RESULT_LOCKED: [400, "This result requires an organizer to make changes."],
    OPPONENT_REQUIRED: [403, "Your opponent must confirm this result."],
    REASON_REQUIRED: [400, "Enter a reason for this change."],
    EARLY_FINISH_REASON_REQUIRED: [400, "Enter a reason to finish before all scheduled rounds."],
    CORRECTIONS_ONLY: [400, "This tournament is reopened for result corrections only."],
  };
  if (messages[message]) return Response.json({ error: messages[message][1] }, { status: messages[message][0] });
  if (database?.code === "42501") return Response.json({ error: "You do not have access to this action." }, { status: 403 });
  if (database?.code === "40001" || /^(conflict|stale)/i.test(message)) return Response.json({ error: "This tournament changed. Refresh and try again." }, { status: 409 });
  if (database?.code === "P0002" || /^not found/i.test(message)) return Response.json({ error: "Tournament or match not found." }, { status: 404 });
  if (database?.code === "23505") return Response.json({ error: "This entry already exists. Refresh and check the names." }, { status: 409 });
  if (database?.code === "22023" || database?.code === "P0001") return Response.json({ error: "Check the submitted values. This action is not available with those inputs." }, { status: 400 });
  if (database?.code === "23503" || database?.code === "23514") return Response.json({ error: "The submitted data does not match this tournament." }, { status: 400 });
  // Never include query text, connection strings, tokens, or input data in errors/logs.
  console.error("Crossplay request failed", { code: database?.code ?? "unknown", type: error instanceof Error ? error.name : "unknown" });
  return Response.json({ error: "The request could not be completed. Try again shortly." }, { status: 503 });
}
