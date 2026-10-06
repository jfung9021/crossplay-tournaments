import "server-only";
import { cookies } from "next/headers";
import { currentActor, hashToken } from "@/server/auth/session";
import type { ClockActor } from "@/server/db/client";

export const matchCookieName = (matchId: string) => `crossplay_match_${matchId}`;

export async function matchSessionToken(matchId: string) {
  const token = (await cookies()).get(matchCookieName(matchId))?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export async function currentClockActor(matchId: string, organizerOnly = false): Promise<ClockActor> {
  if (!organizerOnly) {
    const token = await matchSessionToken(matchId);
    if (token) return { matchSessionHash: hashToken(token) };
  }
  return currentActor();
}

export async function setMatchSession(matchId: string, token: string) {
  (await cookies()).set(matchCookieName(matchId), token, {
    httpOnly: true, secure: process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
}
