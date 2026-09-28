import { currentActor } from "@/server/auth/session";
import { execute, listTournaments } from "@/server/db/client";
import { errorResponse, AppError } from "@/server/errors";
import { assertSameOrigin, jsonBody, noStore, rateLimit } from "@/server/http";
import { createSchema } from "@/server/validation";
import { createSlug, hash, stableUuid } from "@/server/tournaments/service";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope") === "admin" ? "admin" : "public";
    return noStore(await listTournaments(await currentActor(), scope));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await jsonBody(request, createSchema);
    const actor = await currentActor();
    if (!("userId" in actor)) throw new AppError("Sign in as an organizer to create a tournament.", 403);
    await rateLimit(request, "create", 20);
    const payload = { name: input.name, slug: input.slug ?? createSlug(input.name, input.requestId), date: input.date ?? null, config: input.config, seed: stableUuid(`seed:${input.requestId}`), _requestHash: hash(JSON.stringify(input)) };
    return noStore(await execute(actor, "create_tournament", payload, input.requestId), 201);
  } catch (error) { return errorResponse(error); }
}
