import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: { matchSessionHash: "verified-session" } as object, version: "20261011010000", writes: vi.fn(), read: vi.fn(), limit: vi.fn() }));
vi.mock("../../src/server/clocks/session", () => ({ currentClockActor: async () => mocks.actor }));
vi.mock("../../src/server/clocks/service", () => ({ limitClockActor: mocks.limit }));
vi.mock("../../src/server/http", () => ({
  assertSameOrigin: (request: Request) => { if (request.headers.get("origin") !== "http://localhost") throw new Error("Origin rejected"); },
  jsonBody: async (request: Request, schema: { parse: (value: unknown) => unknown }) => schema.parse(await request.json()),
  noStore: (body: unknown) => Response.json(body, { headers: { "Cache-Control": "no-store" } }), rateLimit: mocks.limit,
}));
vi.mock("../../src/server/db/client", () => ({ readClock: mocks.read, ready: async () => {
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?");
    if (query.includes("display_version")) return [{ version: mocks.version }];
    if (query.includes("display_clock_checkpoint")) { mocks.writes(...values); return [{ data: { serverNowMs: 12345 } }]; }
    return [{ now: 12345 }];
  }, { json: (value: unknown) => value }); return sql;
} }));
import { GET, POST } from "../../src/app/api/matches/[matchId]/display-checkpoint/route";
const matchId = "11111111-1111-4111-a111-111111111111";
const context = { params: Promise.resolve({ matchId }) };
const sample = { controllerId: matchId, generation: 0, epoch: 1, version: 2, sequence: 2, sampledAtMs: 12345, uncertaintyMs: 100, elapsedMs: 200 };
const request = (value: unknown, origin = "http://localhost") => new Request("http://localhost/checkpoint", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(value) });
beforeEach(() => { mocks.actor = { matchSessionHash: "verified-session" }; mocks.version = "20261011010000"; mocks.writes.mockReset(); mocks.read.mockReset(); mocks.limit.mockReset(); });
describe("display checkpoint boundary", () => {
  it("passes only the server-verified actor to the function-only writer", async () => {
    const response = await POST(request(sample), context);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ available: true, serverNowMs: 12345 });
    expect(mocks.writes).toHaveBeenCalledWith(mocks.actor, matchId, sample);
  });
  it("requires authentication, same origin, and rejects forged or unbounded payloads", async () => {
    for (const value of [{ ...sample, actor: { userId: matchId } }, { ...sample, elapsedMs: -1 }, { ...sample, uncertaintyMs: 1001 }, { ...sample, usedMs: [0, 0] }]) expect((await POST(request(value), context)).ok).toBe(false);
    expect((await POST(request(sample, "http://other.example"), context)).ok).toBe(false);
    mocks.actor = {}; expect((await POST(request(sample), context)).status).toBe(403);
    expect(mocks.writes).not.toHaveBeenCalled();
  });
  it("gates old databases and verifies match read access before calibration", async () => {
    mocks.version = "20261008040000";
    expect(await (await POST(request(sample), context)).json()).toEqual({ available: false });
    expect(mocks.writes).not.toHaveBeenCalled();
    mocks.version = "20261011010000";
    const response = await GET(new Request("http://localhost/checkpoint"), context);
    expect(mocks.read).toHaveBeenCalledWith(mocks.actor, matchId);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ available: true, serverNowMs: 12345 });
  });
});
