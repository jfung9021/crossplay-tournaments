import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSameOrigin, jsonBody } from "@/server/http";
import { commandSchema, commandPayloads, createSchema } from "@/server/validation";
import { errorResponse } from "@/server/errors";

afterEach(() => vi.unstubAllEnvs());

describe("request authority boundaries", () => {
  it("allows only the configured browser origin for cookie mutations", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://crossplay.example");
    expect(() => assertSameOrigin(new Request("https://crossplay.example/api/auth", { headers: { Origin: "https://crossplay.example" } }))).not.toThrow();
    for (const origin of [undefined, "https://attacker.example", "null"]) {
      expect(() => assertSameOrigin(new Request("https://crossplay.example/api/auth", { headers: origin ? { Origin: origin } : {} }))).toThrow();
    }
    expect(() => assertSameOrigin(new Request("https://crossplay.example/api/auth", { headers: { Origin: "https://crossplay.example", "Sec-Fetch-Site": "cross-site" } }))).toThrow();
  });

  it("rejects browser-supplied actor and derived pairing fields", () => {
    const input = { command: "generate_round", payload: {}, requestId: "11111111-1111-4111-a111-111111111111", expectedVersion: 1 };
    expect(commandSchema.safeParse(input).success).toBe(true);
    expect(commandSchema.safeParse({ ...input, actor: { userId: "owner" } }).success).toBe(false);
    expect(commandPayloads.generate_round.safeParse({ pairs: [{ player1Id: "victim" }] }).success).toBe(false);
    expect(commandPayloads.generate_round.safeParse({ _requestHash: "forged" }).success).toBe(false);
  });

  it("requires played inputs and a forfeit winner", () => {
    const base = { matchId: "11111111-1111-4111-a111-111111111111", expectedRevision: 1 };
    expect(commandPayloads.finalize_result.safeParse({ ...base, kind: "played" }).success).toBe(false);
    expect(commandPayloads.finalize_result.safeParse({ ...base, kind: "forfeit" }).success).toBe(false);
    expect(commandPayloads.finalize_result.safeParse({ ...base, kind: "double_forfeit", reason: "Both absent" }).success).toBe(true);
  });

  it("rejects invalid intervals, fractional/negative overtime and unknown config fields", () => {
    const base = { matchId: "11111111-1111-4111-a111-111111111111", expectedRevision: 1, raw1: 10, raw2: 20, overtime1: 0, overtime2: 0 };
    for (const overtime1 of [-1, 0.5, 86401]) expect(commandPayloads.submit_report.safeParse({ ...base, overtime1 }).success).toBe(false);
    const tournament = { name: "Test", requestId: base.matchId, config: { roundCount: null, penaltyPoints: 2, penaltyIntervalSeconds: 10, timeLimitSeconds: null } };
    expect(createSchema.safeParse(tournament).success).toBe(true);
    expect(createSchema.safeParse({ ...tournament, config: { ...tournament.config, penaltyIntervalSeconds: 0 } }).success).toBe(false);
    expect(createSchema.safeParse({ ...tournament, config: { ...tournament.config, tiebreaker: "head_to_head" } }).success).toBe(false);
  });

  it("maps database conflict and access errors without exposing internals", async () => {
    expect(errorResponse({ code: "P0001", message: "STALE_REVISION" }).status).toBe(409);
    expect(errorResponse({ code: "P0001", message: "FORBIDDEN" }).status).toBe(403);
    expect(errorResponse({ code: "P0001", message: "NOT_FOUND" }).status).toBe(404);
    const response = errorResponse({ code: "P0001", message: "query contains a private secret" });
    expect(await response.text()).not.toContain("private secret");
  });

  it("rejects oversized bodies before validation", async () => {
    const request = new Request("https://crossplay.example/api/tournaments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x".repeat(65537) }) });
    await expect(jsonBody(request, createSchema)).rejects.toMatchObject({ status: 413 });
  });
});
