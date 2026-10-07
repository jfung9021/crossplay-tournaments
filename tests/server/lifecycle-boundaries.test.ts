import { describe, expect, it } from "vitest";
import { commandSchema, commandPayloads } from "../../src/server/validation";
import { errorResponse } from "../../src/server/errors";

describe("tournament lifecycle command boundaries", () => {
  const request = { requestId: "11111111-1111-4111-a111-111111111111", expectedVersion: 4 };
  it("requires an exact, untrimmed name for irreversible actions and rejects actor injection", () => {
    for (const command of ["reset_tournament", "delete_tournament"] as const) {
      expect(commandPayloads[command].safeParse({}).success).toBe(false);
      expect(commandPayloads[command].safeParse({ confirmationName: "Cup", actor: {} }).success).toBe(false);
      const parsed = commandSchema.parse({ ...request, command, payload: { confirmationName: " Cup " } });
      expect(parsed.payload.confirmationName).toBe(" Cup ");
      expect(commandSchema.safeParse({ ...request, command, actor: {}, payload: {} }).success).toBe(false);
    }
  });
  it("returns explicit lifecycle errors without exposing SQL or inputs", async () => {
    for (const [code, status] of [["STALE_ACTION", 409], ["TOURNAMENT_ARCHIVED", 409], ["CONFIRMATION_REQUIRED", 400]] as const) {
      const response = errorResponse({ message: code, query: "private SQL" });
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.code).toBe(code); expect(JSON.stringify(body)).not.toContain("private SQL");
    }
  });
});
