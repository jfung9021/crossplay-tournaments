import { readDisplay } from "@/server/display/service";
import { errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const display = await readDisplay((await context.params).id);
    return Response.json(display, { headers: { "Cache-Control": "no-store", ETag: `"${display.revision}"` } });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    // Public absence has one response regardless of the browser's signed-in actor.
    if (response.status === 403 || response.status === 404) return Response.json({ error: "Tournament not yet available." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return response;
  }
}
