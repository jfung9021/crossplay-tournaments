import { z } from "zod";

export const uuid = z.string().uuid();
export const version = z.number().int().nonnegative();
export const score = z.number().int().min(-100000).max(100000);
export const overtime = z.number().int().min(0).max(86400);
export const configSchema = z.object({
  roundCount: z.number().int().min(1).max(255).nullable(),
  penaltyIntervalSeconds: z.number().int().min(1).max(3600),
  penaltyPoints: z.number().int().min(0).max(100),
  timeLimitSeconds: z.number().int().min(1).max(86400).nullable(),
}).strict();
export const nameSchema = z.string().trim().min(1).max(120);
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(80);
export const dateSchema = z.iso.date().nullable();
export const createSchema = z.object({ name: nameSchema, slug: slugSchema.optional(), date: dateSchema.optional(), config: configSchema, requestId: uuid }).strict();
const matchBase = { matchId: uuid, expectedRevision: version };
const scoreFields = { raw1: score, raw2: score, overtime1: overtime, overtime2: overtime };
export const commandPayloads = {
  copy_tournament: z.object({ name: nameSchema, slug: slugSchema.optional() }).strict(),
  update_settings: z.object({ name: nameSchema, date: dateSchema, config: configSchema }).strict(),
  add_entrants: z.object({ names: z.string().min(1).max(30000) }).strict(),
  update_entrant: z.object({ entrantId: uuid, name: z.string().trim().min(1).max(160) }).strict(),
  remove_entrant: z.object({ entrantId: uuid }).strict(),
  withdraw_entrant: z.object({ entrantId: uuid }).strict(),
  generate_round: z.object({}).strict(),
  publish_round: z.object({ roundId: uuid }).strict(),
  submit_report: z.object({ ...matchBase, ...scoreFields }).strict(),
  confirm_report: z.object({ ...matchBase, reportId: uuid }).strict(),
  dispute_report: z.object({ ...matchBase, reportId: uuid, reason: z.string().trim().min(1).max(1000) }).strict(),
  finalize_result: z.object({ ...matchBase, kind: z.enum(["played", "forfeit", "double_forfeit"]), raw1: score.optional(), raw2: score.optional(), overtime1: overtime.optional(), overtime2: overtime.optional(), winnerId: uuid.optional(), reason: z.string().trim().max(1000).optional() }).strict().superRefine((data, ctx) => {
    if (data.kind === "played" && [data.raw1, data.raw2, data.overtime1, data.overtime2].some((value) => value === undefined)) ctx.addIssue({ code: "custom", message: "Enter both scores and overtime values." });
    if (data.kind === "forfeit" && !data.winnerId) ctx.addIssue({ code: "custom", message: "Choose the forfeit winner." });
  }),
  finish_tournament: z.object({ reason: z.string().trim().max(1000).optional() }).strict(),
  reopen_tournament: z.object({ reason: z.string().trim().min(1).max(1000) }).strict(),
  archive_tournament: z.object({}).strict(),
  issue_invite: z.object({ entrantId: uuid }).strict(),
} as const;
export type Command = keyof typeof commandPayloads;
export const commandSchema = z.object({ command: z.enum(Object.keys(commandPayloads) as [Command, ...Command[]]), payload: z.record(z.string(), z.unknown()).default({}), requestId: uuid, expectedVersion: version.optional() }).strict();
