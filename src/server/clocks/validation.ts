import { z } from "zod";
import { score, uuid, version } from "@/server/validation";

const side = z.union([z.literal(1), z.literal(2)]);
const milliseconds = z.number().int().min(0).max(172_800_000);
const reason = z.string().trim().min(1).max(1000);
export const clockEventSchema = z.object({
  sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  kind: z.enum(["start", "switch", "pause", "resume", "end", "recover"]),
  atMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  elapsedMs: milliseconds,
  side: side.optional(),
  reviewRequired: z.boolean().optional(),
}).strict();
export const clockPayloads = {
  issue_match_link: z.object({}).strict(),
  claim_clock: z.object({ controllerId: uuid }).strict(),
  append_events: z.object({ controllerId: uuid, epoch: version, events: z.array(clockEventSchema).min(1).max(100) }).strict(),
  submit_shared_report: z.object({ raw1: score, raw2: score, expectedRevision: version, clockVersion: version }).strict(),
  acknowledge_shared_report: z.object({ reportId: uuid, expectedRevision: version, side }).strict(),
  dispute_shared_report: z.object({ reportId: uuid, expectedRevision: version, reason }).strict(),
  revoke_match_link: z.object({ reason }).strict(),
  takeover_clock: z.object({ controllerId: uuid, reason }).strict(),
  correct_clock: z.object({ usedMs: z.tuple([milliseconds, milliseconds]), activeSide: side, reason }).strict(),
  correct_starter: z.object({ entrantId: uuid, reason }).strict(),
  record_manual_start: z.object({ entrantId: uuid, reason }).strict(),
} as const;
export type ClockCommand = keyof typeof clockPayloads;
export const clockCommandSchema = z.object({
  command: z.enum(Object.keys(clockPayloads) as [ClockCommand, ...ClockCommand[]]),
  payload: z.record(z.string(), z.unknown()).default({}),
  requestId: uuid,
  expectedClockVersion: version.optional(),
}).strict();
export const clockClaimSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), requestId: uuid }).strict();
export const organizerClockCommands = new Set<ClockCommand>(["issue_match_link", "revoke_match_link", "takeover_clock", "correct_clock", "correct_starter", "record_manual_start"]);
