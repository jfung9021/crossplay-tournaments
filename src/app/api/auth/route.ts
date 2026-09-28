import { cookies } from "next/headers";
import { z } from "zod";
import { authClient, authConfigured, PLAYER_COOKIE, verifiedUser } from "@/server/auth/session";
import { isDatabaseConfigured, listTournaments } from "@/server/db/client";
import { AppError, errorResponse } from "@/server/errors";
import { assertSameOrigin, jsonBody, noStore, rateLimit } from "@/server/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    const configured = authConfigured() && isDatabaseConfigured();
    const user = await verifiedUser();
    if (!user) return noStore({ authenticated: false, isOrganizer: false, configured });
    let isOrganizer = false;
    try { await listTournaments({ userId: user.id }, "admin"); isOrganizer = true; } catch { /* An existing shared Auth account does not grant organizer access. */ }
    return noStore({ authenticated: true, email: user.email, isOrganizer, configured });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await jsonBody(request, z.object({ email: z.email().max(254), password: z.string().min(1).max(512) }).strict());
    await rateLimit(request, "login", 12);
    const client = await authClient();
    const { data, error } = await client.auth.signInWithPassword(body);
    if (error || !data.user) throw new AppError("The email or password is incorrect.", 401);
    try { await listTournaments({ userId: data.user.id }, "admin"); }
    catch {
      await client.auth.signOut({ scope: "local" });
      throw new AppError("This account has not been given organizer access.", 403);
    }
    return noStore({ authenticated: true, isOrganizer: true, email: data.user.email });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    if (authConfigured()) await (await authClient()).auth.signOut({ scope: "local" });
    (await cookies()).delete(PLAYER_COOKIE);
    return noStore({ ok: true });
  } catch (error) { return errorResponse(error); }
}
