import { currentActor, hashToken } from "@/server/auth/session";
import { limitClockActor } from "@/server/clocks/service";
import { matchSessionToken, setMatchSession } from "@/server/clocks/session";
import { matchEntrySchema } from "@/server/clocks/validation";
import { enterTableMatch, openOrganizerMatch, readClock } from "@/server/db/client";
import { AppError, errorResponse } from "@/server/errors";
import { assertSameOrigin, jsonBody, noStore, rateLimit } from "@/server/http";
import { stableUuid, tokenFor } from "@/server/tournaments/service";
import { uuid } from "@/server/validation";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    assertSameOrigin(request);
    const parsed = uuid.safeParse((await context.params).matchId);
    if (!parsed.success) throw new AppError("Match not found.", 404);
    const matchId = parsed.data;
    const { requestId, controllerId, ...input } = await jsonBody(request, matchEntrySchema);
    const actor = await currentActor();
    if (!("userId" in actor)) throw new AppError("Sign in as an organizer to start this match.", 403);
    await rateLimit(request, "match-open", 120);
    await limitClockActor(actor, matchId);
    const authorized = await readClock(actor, matchId);
    if (!authorized.isOrganizer) throw new AppError("An organizer account is required to start this match.", 403);
    const existing = await matchSessionToken(matchId);
    const session = tokenFor(`match-entry:${matchId}:${JSON.stringify(actor)}:${requestId}`);
    const inviteHash = hashToken(tokenFor(`match-entry-invite:${matchId}:${JSON.stringify(actor)}:${requestId}`));
    if (authorized.tablesEnabled) {
      if (!input.deviceId || input.expectedOperationsVersion === undefined) throw new AppError("Open My table and assign this device before starting a match.", 409);
      const result = await enterTableMatch(actor, { ...input, matchId, controllerId, sessionHash: hashToken(session), inviteHash, existingHash: existing ? hashToken(existing) : null }, requestId);
      if (result.sessionCreated) await setMatchSession(matchId, session);
      return noStore(result.snapshot);
    }
    if (input.mode && input.mode !== "open") throw new AppError("Enable table management before changing devices.", 409);
    if (existing) {
      try { return noStore(await readClock({ matchSessionHash: hashToken(existing) }, matchId)); }
      catch (error) { if ((error as { message?: string }).message !== "FORBIDDEN") throw error; }
    }
    const key = (phase: string) => stableUuid(`match-entry:${matchId}:${JSON.stringify(actor)}:${requestId}:${phase}`);
    const result = await openOrganizerMatch(actor, matchId, hashToken(session), inviteHash, controllerId, { issue: key("issue"), claim: key("claim"), controller: key("controller") });
    if (result.sessionCreated) await setMatchSession(matchId, session);
    return noStore(result.snapshot);
  } catch (error) { return errorResponse(error); }
}
