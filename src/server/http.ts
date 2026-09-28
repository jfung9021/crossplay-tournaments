import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/server/errors";
import { consumeRateLimit } from "@/server/db/client";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : new URL(request.url).origin;
  if (!origin || origin !== expected) throw new AppError("This request must come from the tournament website.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("Cross-site requests are not allowed.", 403);
}

export async function jsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError("Send a JSON request.", 400);
  if (Number(request.headers.get("content-length") ?? 0) > 65536) throw new AppError("This request is too large.", 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > 65536) throw new AppError("This request is too large.", 413);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new AppError("The request is not valid JSON."); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "Input"}: ${issue.message}`).slice(0, 3).join(" "));
  return parsed.data;
}

export async function rateLimit(request: Request, operation: string, limit = 60) {
  const secret = process.env.CROSSPLAY_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new AppError("Request protection is not configured yet.", 503);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const bucket = createHmac("sha256", secret).update(`${operation}:${ip}`).digest("hex");
  await consumeRateLimit(bucket, limit, 60);
}

export function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
