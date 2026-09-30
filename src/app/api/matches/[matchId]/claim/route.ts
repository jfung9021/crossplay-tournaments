import { hashToken } from "@/server/auth/session";
import { setMatchSession } from "@/server/clocks/session";
import { clockClaimSchema } from "@/server/clocks/validation";
import { executeClock } from "@/server/db/client";
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
    const { token } = await jsonBody(request, clockClaimSchema);
    await rateLimit(request, "match-claim", 120);
    const inviteHash = hashToken(token);
    const session = tokenFor(`match-session:${matchId}:${token}`);
    const result = await executeClock({}, "claim_match_link", { matchId, inviteHash, sessionHash: hashToken(session) }, stableUuid(`match-claim:${matchId}:${inviteHash}`));
    await setMatchSession(matchId, session);
    return noStore(result);
  } catch (error) { return errorResponse(error); }
}
