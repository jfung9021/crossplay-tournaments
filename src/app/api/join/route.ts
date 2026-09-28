import { z } from "zod";
import { hashToken, setPlayerSession } from "@/server/auth/session";
import { execute } from "@/server/db/client";
import { errorResponse } from "@/server/errors";
import { assertSameOrigin, jsonBody, noStore, rateLimit } from "@/server/http";
import { stableUuid, tokenFor } from "@/server/tournaments/service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { token } = await jsonBody(request, z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict());
    await rateLimit(request, "claim", 15);
    const inviteHash = hashToken(token);
    const session = tokenFor(`player-session:${token}`);
    const result = await execute({}, "claim_invite", { inviteHash, sessionHash: hashToken(session) }, stableUuid(`claim:${inviteHash}`));
    await setPlayerSession(session);
    return noStore(result);
  } catch (error) { return errorResponse(error); }
}
