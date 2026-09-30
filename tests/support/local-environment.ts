import { execFileSync } from "node:child_process";

export function assertLoopback(value: string, name: string): URL {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error(`${name} must use loopback.`);
  return url;
}

export function assertLocalEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const origin = assertLoopback(env.PLAYWRIGHT_BASE_URL ?? "", "Browser origin");
  if (origin.origin !== env.NEXT_PUBLIC_SITE_URL || origin.pathname !== "/") throw new Error("Browser and application origins must match exactly.");
  assertLoopback(env.NEXT_PUBLIC_SUPABASE_URL ?? "", "Auth");
  const database = assertLoopback(env.CROSSPLAY_DATABASE_URL ?? "", "Database");
  const name = database.pathname.slice(1);
  if (!/^crossplay_acceptance_[0-9a-f_]+$/.test(name) || name !== env.CROSSPLAY_ACCEPTANCE_DATABASE) throw new Error("Database must be this run's isolated acceptance database.");
  if (database.username !== "crossplay_runtime") throw new Error("The app must use crossplay_runtime.");
  if (!/^crossplay-test-[a-z0-9-]+$/.test(env.CROSSPLAY_TEST_CONTAINER ?? "")) throw new Error("An isolated Crossplay test container is required.");
  return { origin: origin.origin, database: name, container: env.CROSSPLAY_TEST_CONTAINER! };
}

export interface DatabaseEvidence {
  tournamentId: string;
  schemaVersion: string;
  status: string;
  config: Record<string, unknown>;
  frozenConfig: Record<string, unknown>;
  counts: { entrants: number; rounds: number; matches: number; official: number; duplicateAssignments: number; duplicateOpponents: number };
  rounds: { number: number; status: string; engineVersion: string; inputHash: string; inputVersion: number; inputSnapshot: unknown }[];
  officialResults: { matchId: string; roundNumber: number; player1Id: string; player2Id: string | null; revisionId: string; revision: number; kind: string; result: Record<string, number | null>; rules: Record<string, unknown>; reason: string | null }[];
  audit: { action: string; reason: string | null }[];
}

/** Read-only evidence, no auth actors, reports, invitation or session credentials. */
export function readDatabaseEvidence(tournamentId: string): DatabaseEvidence {
  const { database, container } = assertLocalEnvironment();
  if (!/^[0-9a-f-]{36}$/.test(tournamentId)) throw new Error("Invalid tournament identity.");
  const sql = `begin read only;
    select jsonb_build_object(
      'tournamentId',t.id,'schemaVersion',crossplay.schema_version(),'status',t.status,'config',t.config,'frozenConfig',t.frozen_config,
      'counts',jsonb_build_object(
        'entrants',(select count(*) from crossplay.entrants where tournament_id=t.id),
        'rounds',(select count(*) from crossplay.rounds where tournament_id=t.id),
        'matches',(select count(*) from crossplay.matches where tournament_id=t.id),
        'official',(select count(*) from crossplay.matches where tournament_id=t.id and official_revision_id is not null),
        'duplicateAssignments',(select count(*) from (select round_id,entrant_id from crossplay.match_sides where tournament_id=t.id group by round_id,entrant_id having count(*)>1) d),
        'duplicateOpponents',(select count(*) from (select least(a.entrant_id,b.entrant_id),greatest(a.entrant_id,b.entrant_id) from crossplay.match_sides a join crossplay.match_sides b on a.tournament_id=b.tournament_id and a.match_id=b.match_id and a.side=1 and b.side=2 where a.tournament_id=t.id group by 1,2 having count(*)>1) d)),
      'rounds',coalesce((select jsonb_agg(jsonb_build_object('number',r.number,'status',r.status,'engineVersion',r.engine_version,'inputHash',r.input_hash,'inputVersion',r.input_version,'inputSnapshot',r.input_snapshot) order by r.number) from crossplay.rounds r where r.tournament_id=t.id),'[]'::jsonb),
      'officialResults',coalesce((select jsonb_agg(jsonb_build_object('matchId',m.id,'roundNumber',r.number,'player1Id',a.entrant_id,'player2Id',b.entrant_id,'revisionId',v.id,'revision',v.revision,'kind',v.kind,'result',v.result,'rules',v.rules,'reason',v.reason) order by r.number,m.table_number) from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id join crossplay.result_revisions v on v.tournament_id=m.tournament_id and v.match_id=m.id and v.id=m.official_revision_id join crossplay.match_sides a on a.tournament_id=m.tournament_id and a.match_id=m.id and a.side=1 left join crossplay.match_sides b on b.tournament_id=m.tournament_id and b.match_id=m.id and b.side=2 where m.tournament_id=t.id),'[]'::jsonb),
      'audit',coalesce((select jsonb_agg(jsonb_build_object('action',action,'reason',reason) order by created_at) from crossplay.audit_events where tournament_id=t.id),'[]'::jsonb)
    ) from crossplay.tournaments t where t.id='${tournamentId}'::uuid;
    commit;`;
  const output = execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", windowsHide: true });
  if (!output.trim()) throw new Error("Evidence tournament is missing.");
  return JSON.parse(output);
}

async function controlLocalApp(action: string): Promise<void> {
  assertLocalEnvironment();
  const url = assertLoopback(process.env.CROSSPLAY_TEST_CONTROL_URL ?? "", "Runner control");
  const response = await fetch(new URL(`/${action}`, url), { method: "POST", headers: { Authorization: `Bearer ${process.env.CROSSPLAY_TEST_CONTROL_TOKEN}` }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Local restart failed: ${response.status}`);
}

export const restartLocalApp = () => controlLocalApp("restart");
export const checkpointLocalDatabase = () => controlLocalApp("checkpoint");
export const restoreLocalDatabase = () => controlLocalApp("restore");
