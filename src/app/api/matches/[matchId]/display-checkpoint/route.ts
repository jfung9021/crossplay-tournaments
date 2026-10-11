import { currentClockActor } from "@/server/clocks/session";
import { limitClockActor } from "@/server/clocks/service";
import { ready, readClock } from "@/server/db/client";
import { DISPLAY_VERSION } from "@/server/display/service";
import { AppError, errorResponse } from "@/server/errors";
import { assertSameOrigin, jsonBody, noStore, rateLimit } from "@/server/http";
import { uuid, version } from "@/server/validation";
import { z } from "zod";

export const runtime = "nodejs";
type Context = { params: Promise<{ matchId: string }> };
const sampleSchema = z.object({
  controllerId: uuid, generation: version, epoch: version, version, sequence: version,
  sampledAtMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  uncertaintyMs: z.number().int().min(0).max(1000), elapsedMs: z.number().int().min(0).max(172_800_000),
}).strict();

async function connection(context: Context) {
  const parsed = uuid.safeParse((await context.params).matchId);
  if (!parsed.success) throw new AppError("Match not found.", 404);
  const matchId = parsed.data, actor = await currentClockActor(matchId);
  if (!Object.keys(actor).length) throw new AppError("Open this match from your tournament.", 403);
  const sql = await ready();
  try {
    const versions = await sql`select crossplay.display_version() as version`;
    if (versions[0]?.version !== DISPLAY_VERSION) return { sql, matchId, actor, available: false };
  } catch (error) { if ((error as { code?: string }).code !== "42883") throw error; return { sql, matchId, actor, available: false }; }
  return { sql, matchId, actor, available: true };
}
export async function GET(_request: Request, context: Context) {
  try {
    const { sql, matchId, actor, available } = await connection(context);
    if (!available) return noStore({ available: false });
    await readClock(actor, matchId);
    const rows = await sql`select floor(extract(epoch from clock_timestamp())*1000)::bigint as now`;
    return noStore({ available: true, serverNowMs: Number(rows[0].now) });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const sample = await jsonBody(request, sampleSchema);
    const { sql, matchId, actor, available } = await connection(context);
    if (!available) return noStore({ available: false });
    await rateLimit(request, "display-checkpoint", 1000);
    await limitClockActor(actor, matchId);
    const rows = await sql`select crossplay.display_clock_checkpoint(${sql.json(actor)}, ${matchId}::uuid, ${sql.json(sample)}) as data`;
    return noStore({ available: true, ...rows[0].data });
  } catch (error) { return errorResponse(error); }
}
