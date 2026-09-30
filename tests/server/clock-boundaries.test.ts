import { describe, expect, it } from "vitest";
import { clockClaimSchema, clockCommandSchema, clockPayloads } from "@/server/clocks/validation";

const id = "11111111-1111-4111-a111-111111111111";
describe("shared clock request authority", () => {
  it("does not accept client actor, invitation hash or derived score authority", () => {
    const body = { command: "issue_match_link", payload: {}, requestId: id };
    expect(clockCommandSchema.safeParse(body).success).toBe(true);
    expect(clockCommandSchema.safeParse({ ...body, actor: { userId: id } }).success).toBe(false);
    expect(clockPayloads.issue_match_link.safeParse({ inviteHash: "forged" }).success).toBe(false);
    const score = { raw1: 401, raw2: 399, expectedRevision: 0, clockVersion: 5 };
    expect(clockPayloads.submit_shared_report.safeParse(score).success).toBe(true);
    for (const field of ["overtime1", "deduction1", "adjusted1", "confirmationMethod"]) {
      expect(clockPayloads.submit_shared_report.safeParse({ ...score, [field]: 0 }).success).toBe(false);
    }
  });
  it("bounds event batches and rejects fractional, negative or unknown event fields", () => {
    const event = { sequence: 1, kind: "start", atMs: 1_800_000_000_000, elapsedMs: 0, side: 1 };
    const batch = { controllerId: id, epoch: 1, events: [event] };
    expect(clockPayloads.append_events.safeParse(batch).success).toBe(true);
    for (const patch of [{ elapsedMs: -1 }, { elapsedMs: 0.5 }, { sequence: 0 }, { side: 3 }, { usedMs: [0, 0] }]) {
      expect(clockPayloads.append_events.safeParse({ ...batch, events: [{ ...event, ...patch }] }).success).toBe(false);
    }
    expect(clockPayloads.append_events.safeParse({ ...batch, events: Array.from({ length: 101 }, () => event) }).success).toBe(false);
    expect(clockPayloads.append_events.safeParse({ ...batch, events: [] }).success).toBe(false);
  });
  it("requires a specific report, named side and reason for corrective actions", () => {
    expect(clockPayloads.acknowledge_shared_report.safeParse({ reportId: id, expectedRevision: 1, side: 2 }).success).toBe(true);
    expect(clockPayloads.acknowledge_shared_report.safeParse({ reportId: id, expectedRevision: 1 }).success).toBe(false);
    expect(clockPayloads.correct_clock.safeParse({ usedMs: [1200000, 0], activeSide: 1, reason: " " }).success).toBe(false);
    expect(clockClaimSchema.safeParse({ token: "a".repeat(43), requestId: id }).success).toBe(true);
    expect(clockClaimSchema.safeParse({ token: "not-an-invite", requestId: id }).success).toBe(false);
  });
});
