import { currentActor } from "@/server/auth/session";
import { AppError, errorResponse } from "@/server/errors";
import { assertSameOrigin, jsonBody, noStore, rateLimit } from "@/server/http";
import { commandSchema, uuid } from "@/server/validation";
import { runCommand } from "@/server/tournaments/service";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const id = uuid.safeParse((await context.params).id);
    if (!id.success) throw new AppError("Tournament not found.", 404);
    const input = await jsonBody(request, commandSchema);
    const actor = await currentActor();
    if (!Object.keys(actor).length) throw new AppError("Sign in or use your private player link.", 403);
    await rateLimit(request, "command", 180);
    return noStore(await runCommand(actor, id.data, input.command, input.payload, input.requestId, input.expectedVersion));
  } catch (error) { return errorResponse(error); }
}
