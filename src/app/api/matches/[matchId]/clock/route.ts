import { currentClockActor } from "@/server/clocks/session";
import { limitClockActor, runClockCommand } from "@/server/clocks/service";
import { clockCommandSchema, organizerClockCommands } from "@/server/clocks/validation";
import { readClock } from "@/server/db/client";
import { AppError, errorResponse } from "@/server/errors";
import { assertSameOrigin, jsonBody, noStore, rateLimit } from "@/server/http";
import { uuid } from "@/server/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ matchId: string }> };
async function matchIdFrom(context: Context) {
  const parsed = uuid.safeParse((await context.params).matchId);
  if (!parsed.success) throw new AppError("Match not found.", 404);
  return parsed.data;
}
export async function GET(_request: Request, context: Context) {
  try {
    const matchId = await matchIdFrom(context);
    return noStore(await readClock(await currentClockActor(matchId), matchId));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const matchId = await matchIdFrom(context);
    const input = await jsonBody(request, clockCommandSchema);
    const actor = await currentClockActor(matchId, organizerClockCommands.has(input.command));
    if (!Object.keys(actor).length) throw new AppError("Sign in and open this match from your tournament.", 403);
    // Table controllers have their own budget; shared Wi-Fi must support ten active tables.
    await rateLimit(request, "clock", 1000);
    await limitClockActor(actor, matchId);
    return noStore(await runClockCommand(actor, matchId, input.command, input.payload, input.requestId, input.expectedClockVersion));
  } catch (error) { return errorResponse(error); }
}
