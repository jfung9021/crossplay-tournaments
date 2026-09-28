import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import type { Actor } from "@/domain/types";
import { AppError } from "@/server/errors";

export const PLAYER_COOKIE = "crossplay_player";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const authConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export async function authClient() {
  if (!authConfigured()) throw new AppError("Organizer sign-in is not configured yet.", 503);
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() { return jar.getAll(); },
      setAll(values) { for (const { name, value, options } of values) jar.set(name, value, { ...options, secure: process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? process.env.NODE_ENV === "production" }); },
    },
  });
}

export async function verifiedUser() {
  if (!authConfigured()) return null;
  const client = await authClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : undefined };
}

export async function currentActor(): Promise<Actor> {
  const user = await verifiedUser();
  if (user) return { userId: user.id };
  const token = (await cookies()).get(PLAYER_COOKIE)?.value;
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) return { sessionHash: hashToken(token) };
  return {};
}

export async function setPlayerSession(token: string) {
  (await cookies()).set(PLAYER_COOKIE, token, { httpOnly: true, secure: process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
