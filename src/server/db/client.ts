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
  const ca = process.env.CROSSPLAY_DATABASE_CA?.replace(/\\n/g, "\n");
  connection = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, ssl: local && process.env.CROSSPLAY_DATABASE_SSL === "false" ? false : ca ? { ca, rejectUnauthorized: true } : "verify-full" });
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
  if (["archive_tournament", "restore_tournament", "reset_tournament", "delete_tournament"].includes(command)) {
    try {
      const versions = await sql`select crossplay.lifecycle_version() as version`;
      if (versions[0]?.version !== "20261008010000") throw new AppError("Tournament actions are not available yet.", 503);
    } catch (error) {
      if ((error as { code?: string }).code === "42883") throw new AppError("Tournament actions are not available yet.", 503);
      throw error;
    }
  }
  const rows = await sql`select crossplay.execute(${sql.json(actor)}, ${command}, ${sql.json(payload as postgres.JSONValue)}, ${requestId}::uuid, ${expectedVersion ?? null}::bigint) as data`;
  return rows[0].data;
}

export async function consumeRateLimit(bucket: string, limit: number, seconds: number) {
  const sql = await ready();
  const rows = await sql`select crossplay.consume_rate_limit(${bucket}, ${limit}, ${seconds}) as allowed`;
  if (!rows[0].allowed) throw new AppError("Too many attempts. Please wait 1:00 and try again.", 429);
}

export type ClockActor = Actor | { matchSessionHash: string };
export const REQUIRED_CLOCK_VERSION = "20260930020000";
let clockReadiness: Promise<void> | undefined;

async function clockReady() {
  const sql = await ready();
  clockReadiness ??= (async () => {
    const rows = await sql`select crossplay.clock_version() as version`;
    if (rows[0]?.version !== REQUIRED_CLOCK_VERSION) throw new AppError("Match clocks are not available yet.", 503);
  })().catch((error) => { clockReadiness = undefined; throw error; });
  await clockReadiness;
  return sql;
}

export async function readClock(actor: ClockActor, matchId: string): Promise<Record<string, unknown>> {
  const sql = await clockReady();
  const rows = await sql`select crossplay.clock_read(${sql.json(actor)}, ${matchId}::uuid) as data`;
  return rows[0].data;
}

export async function executeClock(actor: ClockActor, command: string, payload: Record<string, unknown>, requestId: string, expectedVersion?: number): Promise<Record<string, unknown>> {
  const sql = await clockReady();
  const rows = await sql`select crossplay.clock_execute(${sql.json(actor)}, ${command}, ${sql.json(payload as postgres.JSONValue)}, ${requestId}::uuid, ${expectedVersion ?? null}::bigint) as data`;
  return rows[0].data;
}

export async function openOrganizerMatch(actor: Actor, matchId: string, sessionHash: string, inviteHash: string, controllerId: string, requestIds: { issue: string; claim: string; controller: string }): Promise<{ sessionCreated: boolean; snapshot: Record<string, unknown> }> {
  const sql = await clockReady();
  const result = await sql.begin(async tx => {
    // Serialize entry through controller reservation so two devices cannot replace one another's ready clock.
    await tx`select pg_advisory_xact_lock(hashtextextended(${`match-entry:${matchId}`}, 0))`;
    const read = await tx`select crossplay.clock_read(${tx.json(actor)}, ${matchId}::uuid) as data`;
    const current = read[0].data;
    if (!current.isOrganizer) throw new AppError("An organizer account is required to start this match.", 403);
    if (current.state && current.controllerId) {
      try {
        // A retry can recover its committed session even when the original cookie response was lost.
        const snapshot = await tx.savepoint(async retry => {
          const rows = await retry`select crossplay.clock_read(${retry.json({ matchSessionHash: sessionHash })}, ${matchId}::uuid) as data`;
          return rows[0].data;
        });
        return { sessionCreated: true, snapshot };
      } catch (error) {
        if ((error as { message?: string }).message !== "FORBIDDEN") throw error;
        return { sessionCreated: false, snapshot: current };
      }
    }
    const executeEntry = async (entryActor: ClockActor, command: string, payload: Record<string, unknown>, id: string) => {
      const rows = await tx`select crossplay.clock_execute(${tx.json(entryActor)}, ${command}, ${tx.json({ ...payload, matchId } as postgres.JSONValue)}, ${id}::uuid, null::bigint) as data`;
      return rows[0].data;
    };
    await executeEntry(actor, "issue_match_link", { inviteHash }, requestIds.issue);
    await executeEntry({}, "claim_match_link", { inviteHash, sessionHash }, requestIds.claim);
    const snapshot = await executeEntry({ matchSessionHash: sessionHash }, "claim_clock", { controllerId }, requestIds.controller);
    return { sessionCreated: true, snapshot };
  });
  return result as { sessionCreated: boolean; snapshot: Record<string, unknown> };
}
