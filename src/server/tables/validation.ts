import { z } from "zod";
import { uuid, version } from "@/server/validation";
const number = z.number().int().min(1).max(128);
const reason = z.string().trim().min(1).max(1000);
export const tablePayloads = {
  configure_tables: z.object({ numbers: z.array(number).min(1).max(128).refine(values => new Set(values).size === values.length) }).strict(),
  assign_device: z.object({ deviceId: uuid, label: z.string().trim().min(1).max(80), tableNumber: number }).strict(),
  retire_device: z.object({ deviceId: uuid }).strict(),
  set_table_available: z.object({ tableNumber: number, available: z.boolean() }).strict(),
  move_match: z.object({ matchId: uuid, targetTable: number, reason }).strict(),
  close_table: z.object({ tableNumber: number, targetTable: number, reason }).strict(),
  reorder_queue: z.object({ matchId: uuid }).strict(),
};
export type TableCommand = keyof typeof tablePayloads;
export const tableCommandSchema = z.object({
  command: z.enum(Object.keys(tablePayloads) as [TableCommand, ...TableCommand[]]),
  payload: z.record(z.string(), z.unknown()), requestId: uuid, expectedVersion: version,
}).strict();
