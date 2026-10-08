import { currentActor } from "@/server/auth/session";
import { executeTable } from "@/server/db/client";
import { AppError, errorResponse } from "@/server/errors";
import { assertSameOrigin, jsonBody, noStore, rateLimit } from "@/server/http";
import { tableCommandSchema, tablePayloads } from "@/server/tables/validation";
import { uuid } from "@/server/validation";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const id = uuid.safeParse((await context.params).id);
    if (!id.success) throw new AppError("Tournament not found.", 404);
    const actor = await currentActor();
    if (!("userId" in actor)) throw new AppError("Sign in as an organizer to manage tables.", 403);
    const input = await jsonBody(request, tableCommandSchema);
    const payload = tablePayloads[input.command].safeParse(input.payload);
    if (!payload.success) throw new AppError("Check the table details before continuing.");
    await rateLimit(request, "table-command", 120);
    return noStore(await executeTable(actor, input.command, { ...payload.data, tournamentId: id.data }, input.requestId, input.expectedVersion));
  } catch (error) { return errorResponse(error); }
}
