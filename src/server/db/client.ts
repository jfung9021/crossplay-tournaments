import "server-only";
import postgres from "postgres";
import type { Actor, Tournament, TournamentSnapshot } from "@/domain/types";
import { AppError } from "@/server/errors";

export const REQUIRED_SCHEMA_VERSION = "20260928010000";
let connection: ReturnType<typeof postgres> | undefined;
let readiness: Promise<void> | undefined;

export function isDatabaseConfigured() { return Boolean(process.env.CROSSPLAY_DATABASE_URL); }

function database() {
  if (connection) return connection;
  const url = process.env.CROSSPLAY_DATABASE_URL;
  if (!url) throw new AppError("Tournament storage is not configured yet.", 503);
  const target = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (process.env.CROSSPLAY_DATABASE_SSL === "false" && !local) throw new AppError("Hosted database connections require TLS.", 503);
  connection = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, ssl: local && process.env.CROSSPLAY_DATABASE_SSL === "false" ? false : "verify-full" });
  return connection;
}

async function ready() {
  const sql = database();
  readiness ??= (async () => {
    const roles = await sql`select current_user as role`;
    if (roles[0]?.role !== "crossplay_runtime") throw new AppError("Use the dedicated Crossplay runtime database account.", 503);
    const versions = await sql`select crossplay.schema_version() as version`;
    if (versions[0]?.version !== REQUIRED_SCHEMA_VERSION) throw new AppError("The Crossplay database migration must be applied before this app can run.", 503);
  })().catch((error) => { readiness = undefined; throw error; });
  await readiness;
  return sql;
}

export async function listTournaments(actor: Actor, scope: "public" | "admin" = "public"): Promise<{ tournaments: Tournament[] }> {
  const sql = await ready();
  const rows = await sql`select crossplay.read_model(${sql.json(actor)}, null, ${scope}) as data`;
  return rows[0].data;
}

export async function readTournament(actor: Actor, id: string): Promise<TournamentSnapshot> {
  const sql = await ready();
  const rows = await sql`select crossplay.read_model(${sql.json(actor)}, ${id}, 'public') as data`;
  return rows[0].data;
}

export async function execute(actor: Actor, command: string, payload: Record<string, unknown>, requestId: string, expectedVersion?: number): Promise<Record<string, unknown>> {
  const sql = await ready();
  const rows = await sql`select crossplay.execute(${sql.json(actor)}, ${command}, ${sql.json(payload as postgres.JSONValue)}, ${requestId}::uuid, ${expectedVersion ?? null}::bigint) as data`;
  return rows[0].data;
}

export async function consumeRateLimit(bucket: string, limit: number, seconds: number) {
  const sql = await ready();
  const rows = await sql`select crossplay.consume_rate_limit(${bucket}, ${limit}, ${seconds}) as allowed`;
  if (!rows[0].allowed) throw new AppError("Too many attempts. Please wait a minute and try again.", 429);
}
