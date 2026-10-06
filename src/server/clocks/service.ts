import "server-only";
import { createHmac } from "node:crypto";
import { consumeRateLimit, executeClock, type ClockActor } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { clockPayloads, type ClockCommand } from "./validation";

export async function limitClockActor(actor: ClockActor, matchId: string) {
  const secret = process.env.CROSSPLAY_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new AppError("Request protection is not configured yet.", 503);
  const bucket = createHmac("sha256", secret).update(`clock:${matchId}:${JSON.stringify(actor)}`).digest("hex");
  await consumeRateLimit(bucket, 360, 60);
}

export async function runClockCommand(actor: ClockActor, matchId: string, command: ClockCommand, rawPayload: Record<string, unknown>, requestId: string, expectedVersion?: number) {
  const parsed = clockPayloads[command].safeParse(rawPayload);
  if (!parsed.success) throw new AppError(parsed.error.issues.map((issue) => issue.message).join(" "));
  if (["append_events", "correct_clock"].includes(command) && expectedVersion === undefined) throw new AppError("Refresh this clock before making changes.", 409);
  const payload: Record<string, unknown> = { ...parsed.data, matchId };
  return executeClock(actor, command, payload, requestId, expectedVersion);
}
