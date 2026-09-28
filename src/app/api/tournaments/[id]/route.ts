import { currentActor } from "@/server/auth/session";
import { snapshot } from "@/server/tournaments/service";
import { errorResponse } from "@/server/errors";
import { noStore } from "@/server/http";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return noStore(await snapshot(await currentActor(), (await context.params).id)); }
  catch (error) { return errorResponse(error); }
}
