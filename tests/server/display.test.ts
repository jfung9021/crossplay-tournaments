import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Match, TournamentSnapshot } from "../../src/domain/types";
import { buildDisplay, type DisplayMetadata } from "../../src/server/display/model";

const db = vi.hoisted(() => ({ mode: "available", source: null as unknown, reads: vi.fn(), queries: [] as { query: string; values: unknown[] }[] }));
vi.mock("../../src/server/db/client", () => ({
  readTournament: db.reads,
  ready: async () => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?"); db.queries.push({ query, values });
    if (query.includes("display_version")) {
      if (db.mode === "absent") throw { code: "42883" };
      if (db.mode === "failed") throw { code: "08006" };
      return [{ version: db.mode === "different" ? "future-version" : "20261008040000" }];
    }
    if (db.mode === "private") throw { message: "NOT_FOUND" };
    if (db.mode === "forbidden") throw { message: "FORBIDDEN" };
    return [{ data: db.source }];
  },
}));
import { GET } from "../../src/app/api/tournaments/[id]/display/route";
import { readDisplay } from "../../src/server/display/service";

function fixture(): TournamentSnapshot {
  return {
    tournament: { id: "event", slug: "public-cup", name: "Public Cup", date: null, status: "active", config: { roundCount: 3, timeLimitSeconds: 1200, penaltyIntervalSeconds: 10, penaltyPoints: 2 }, seed: "PRIVATE_TOURNAMENT_SEED", version: 3, createdAt: "2026-10-08", entrantCount: 5, currentRound: 1, runGeneration: 2 },
    entrants: Array.from({ length: 5 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, seed: i, active: i !== 4 })),
    rounds: [{ id: "r1", number: 1, status: "published", engineVersion: "private-engine", inputHash: "PRIVATE_INPUT_HASH", matches: [
      { id: "m1", roundNumber: 1, tableNumber: 3, player1Id: "p1", player2Id: "p2", kind: "played", status: "unreported", revision: 0, result: null, report: null },
      { id: "m2", roundNumber: 1, tableNumber: 1, player1Id: "p3", player2Id: "p4", kind: "played", status: "unreported", revision: 0, result: null, report: null },
      { id: "bye", roundNumber: 1, tableNumber: 2, player1Id: "p5", player2Id: null, kind: "bye", status: "final", revision: 1, result: { raw1: null, raw2: null, overtime1: 0, overtime2: 0, adjusted1: null, adjusted2: null, points1: 2, points2: 0, difference1: 0 }, report: null },
    ] }], standings: [], viewer: { isOrganizer: true, entrantId: "PRIVATE_VIEWER" }, audit: [{ id: "audit", action: "private", reason: "PRIVATE_REASON", createdAt: "now" }],
    tables: { available: true, enabled: true, version: 1, tables: [{ number: 1, available: true }], devices: [{ deviceId: "PRIVATE_DEVICE", label: "PRIVATE_LABEL", tableNumber: 1, generation: 2 }], locations: [
      { matchId: "m1", tableNumber: 1, originalTableNumber: 3, queueOrder: 1, ready: true },
      { matchId: "m2", tableNumber: 1, originalTableNumber: 1, queueOrder: 2, ready: false },
    ] },
  };
}
function final(match: Match, points1 = 1, points2 = 1) {
  match.status = "final";
  match.result = { raw1: 400, raw2: 400, overtime1: 0, overtime2: 0, adjusted1: 400, adjusted2: 400, points1, points2, difference1: 0 };
}
beforeEach(() => { db.mode = "available"; db.queries = []; db.reads.mockReset(); db.source = { snapshot: fixture(), matches: {}, serverNowMs: 12345 }; });

describe("public display shaping", () => {
  it("allowlists public values even with an organizer-shaped source, hiding pending scores and drafts", () => {
    const source = fixture();
    source.rounds[0].matches[0].report = { id: "PRIVATE_REPORT", revision: 1, submittedBy: "PRIVATE_ACTOR", raw1: 98765, raw2: 87654, overtime1: 1, overtime2: 2, disputeReason: "PRIVATE_DISPUTE" };
    source.rounds.push({ ...source.rounds[0], id: "PRIVATE_DRAFT", number: 2, status: "draft", matches: [{ ...source.rounds[0].matches[0], id: "PRIVATE_DRAFT_MATCH" }] });
    const display = buildDisplay(source, { m1: { status: "playing", completedAt: null } }, 100);
    const json = JSON.stringify(display);
    for (const privateValue of ["PRIVATE_", "98765", "87654", "engineVersion", "inputHash", "raw1", "report", "devices", "viewer", "audit", "originalTableNumber"]) expect(json).not.toContain(privateValue);
    expect(display.round?.matches.map(match => [match.id, match.tableNumber, match.status])).toEqual([["m1", 1, "playing"], ["m2", 1, "queued"]]);
    expect(display.round).toMatchObject({ number: 1, totalMatches: 2, finalMatches: 0, byes: [{ id: "bye", tableNumber: null }] });
    expect(display.standings.find(row => row.entrantId === "p5")).toMatchObject({ rank: 1, active: false, matchPoints: 1 });
  });

  it("uses official precedence, shared-rank standings and timestamps for the latest result", () => {
    const source = fixture(); final(source.rounds[0].matches[0]); final(source.rounds[0].matches[1]);
    const metadata: DisplayMetadata = { m1: { status: "playing", completedAt: "2026-10-08T10:00:00Z" }, m2: { status: "final", completedAt: "2026-10-08T11:00:00Z" }, bye: { status: "final", completedAt: "2026-10-08T12:00:00Z" } };
    const display = buildDisplay(source, metadata, 1);
    expect(display.round?.finalMatches).toBe(2);
    expect(display.round?.matches[0].status).toBe("final");
    expect(display.latestResult?.id).toBe("m2");
    expect(display.standings.filter(row => row.entrantId !== "p5").map(row => row.rank)).toEqual([2, 2, 2, 2]);
    expect(display.round?.matches[0].result).toEqual({ adjusted1: 400, adjusted2: 400, points1: 1, points2: 1 });
  });

  it("shows saved clock states, report precedence and coarse archived/fallback states", () => {
    const source = fixture();
    for (const status of ["ready", "playing", "paused", "reporting"] as const) expect(buildDisplay(source, { m1: { status, completedAt: null } }, 1).round?.matches[0].status).toBe(status);
    source.rounds[0].matches[0].status = "awaiting_confirmation";
    expect(buildDisplay(source, { m1: { status: "playing", completedAt: null } }, 1).round?.matches[0].status).toBe("awaiting_confirmation");
    expect(buildDisplay(source, { m1: { status: "organizer_review", completedAt: null } }, 1).round?.matches[0].status).toBe("organizer_review");
    source.rounds[0].matches[0].status = "unreported";
    source.tournament.status = "archived"; source.tournament.archivedFromStatus = "active";
    expect(buildDisplay(source, { m1: { status: "playing", completedAt: null } }, 1).round?.matches[0].status).toBe("outstanding");
    source.tournament.status = "active";
    expect(buildDisplay(source, null, 1)).toMatchObject({ clockStatusAvailable: false, round: { matches: [{ status: "outstanding" }, { status: "queued" }] }, latestResult: null });
  });

  it("keeps revisions stable across time and private changes but changes them for visible clock, location, result or generation changes", () => {
    const source = fixture(); const metadata: DisplayMetadata = { m1: { status: "ready", completedAt: null } };
    const revision = buildDisplay(source, metadata, 1).revision;
    source.tournament.version++; source.audit![0].reason = "another private reason";
    expect(buildDisplay(source, metadata, 50000).revision).toBe(revision);
    metadata.m1.status = "playing";
    expect(buildDisplay(source, metadata, 50000).revision).not.toBe(revision);
    metadata.m1.status = "ready"; source.tables!.locations[0].tableNumber = 9;
    expect(buildDisplay(source, metadata, 1).revision).not.toBe(revision);
    source.tables!.locations[0].tableNumber = 1; source.tournament.runGeneration!++;
    expect(buildDisplay(source, metadata, 1).revision).not.toBe(revision);
    source.tournament.runGeneration!--; final(source.rounds[0].matches[0]);
    expect(buildDisplay(source, metadata, 1).revision).not.toBe(revision);
  });

  it("does not reveal a private draft or event with no published round", () => {
    const source = fixture(); source.tournament.status = "draft";
    expect(() => buildDisplay(source, null, 1)).toThrow("not yet available");
    source.tournament.status = "active"; source.rounds = [];
    expect(() => buildDisplay(source, null, 1)).toThrow("not yet available");
  });
});

describe("display endpoint and capability", () => {
  it("ignores organizer cookies, exposes stable ETag and always prevents caching", async () => {
    const response = await GET(new Request("http://localhost/api/tournaments/public-cup/display", { headers: { cookie: "organizer=PRIVATE_COOKIE" } }), { params: Promise.resolve({ id: "public-cup" }) });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json(); expect(response.headers.get("etag")).toBe(`"${body.revision}"`); expect(body.serverNowMs).toBe(12345);
    expect(db.queries.at(-1)?.values).toEqual(["public-cup"]); expect(db.reads).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("PRIVATE_");
  });
  it.each(["absent", "different"])("uses only an anonymous public read when capability is %s", async mode => {
    db.mode = mode; db.reads.mockResolvedValue(fixture());
    const display = await readDisplay("public-cup");
    expect(db.reads).toHaveBeenCalledWith({}, "public-cup"); expect(display.clockStatusAvailable).toBe(false);
    expect(db.queries.some(query => query.query.includes("display_read"))).toBe(false);
  });
  it.each(["private", "forbidden"])("clears publicly unavailable data with the same 404 for %s", async mode => {
    db.mode = mode;
    const response = await GET(new Request("http://localhost/"), { params: Promise.resolve({ id: "private-name" }) });
    expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Tournament not yet available." });
  });
  it("does not mistake a failed database connection for an absent capability", async () => {
    db.mode = "failed"; await expect(readDisplay("cup")).rejects.toMatchObject({ code: "08006" }); expect(db.reads).not.toHaveBeenCalled();
  });
});
