import { describe, expect, it } from "vitest";
import { resolveMatchEntryAction, type MatchEntryRead } from "../../src/client/match-entry-state";
import type { MatchClockSnapshot } from "../../src/client/match-clock-api";
import { createClockState } from "../../src/domain/clock";
import type { Match } from "../../src/domain/types";
import { parseTablePreference, tablePreferenceKey } from "../../src/components/table-selector";

const unreported: Pick<Match, "status" | "player2Id"> = { status: "unreported", player2Id: "player-2" };
const base: MatchClockSnapshot = {
  tournamentId: "event", matchId: "match", tournamentName: "Event", roundNumber: 1, tableNumber: 1,
  matchStatus: "unreported", matchRevision: 0,
  players: [{ id: "player-1", name: "One", side: 1 }, { id: "player-2", name: "Two", side: 2 }],
  rules: { timeLimitSeconds: 1200, penaltyIntervalSeconds: 10, penaltyPoints: 2, roundCount: 6 },
  state: null, controllerId: null, start: null, report: null, result: null, officialConfirmationMethod: null,
  canControl: true, isOrganizer: false, serverNowMs: 0,
};
const sharedReport = { id: "report", revision: 1, raw1: 401, raw2: 399, overtime1: 0, overtime2: 0, adjusted1: 401, adjusted2: 399, acknowledgedSides: [], confirmationMethod: "shared_device", clockVersion: 1, disputeReason: null };
function read(overrides: Partial<MatchClockSnapshot> = {}): MatchEntryRead { return { snapshot: { ...base, ...overrides }, loading: false, error: null }; }
function clock(status: "ready" | "running" | "paused" | "ended", overrides: Partial<MatchClockSnapshot> = {}) {
  return read({ state: { ...createClockState(1), status }, controllerId: "this-device", ...overrides });
}

describe("match card action precedence", () => {
  it.each([
    ["ready", "Start Match"], ["running", "Continue match"], ["paused", "Continue match"], ["ended", "Report scores"],
  ] as const)("labels %s clocks without changing control", (status, label) => {
    expect(resolveMatchEntryAction(unreported, clock(status), "this-device")?.label).toBe(label);
  });

  it("distinguishes no clock, loading, and a failed read", () => {
    expect(resolveMatchEntryAction(unreported, read(), null)?.label).toBe("Start Match");
    expect(resolveMatchEntryAction(unreported, { snapshot: null, loading: true, error: null }, null)).toMatchObject({ label: "Open match", disabled: true });
    expect(resolveMatchEntryAction(unreported, { snapshot: null, loading: false, error: "Offline" }, null)).toMatchObject({ label: "Open match", disabled: false });
    expect(resolveMatchEntryAction(unreported, { ...clock("paused"), error: "Offline" }, "this-device")?.label).toBe("Continue match");
  });

  it("gives finalization and pending report state precedence over an older clock", () => {
    expect(resolveMatchEntryAction({ ...unreported, status: "final" }, clock("running"), "this-device")).toBeNull();
    expect(resolveMatchEntryAction(unreported, clock("running", { matchStatus: "final" }), "this-device")).toBeNull();
    expect(resolveMatchEntryAction({ ...unreported, player2Id: null }, read(), null)).toBeNull();
    expect(resolveMatchEntryAction({ ...unreported, status: "awaiting_confirmation" }, clock("running", { report: sharedReport }), "this-device")?.label).toBe("Review scores");
    expect(resolveMatchEntryAction(unreported, clock("paused", { matchStatus: "disputed", report: sharedReport }), "this-device")).toMatchObject({ label: "Review scores", status: "Needs organizer review" });
  });

  it.each(["individual", "organizer"])("keeps %s reports on their existing review path, with or without a clock", confirmationMethod => {
    const reported = { ...unreported, status: "awaiting_confirmation" as const };
    expect(resolveMatchEntryAction(reported, read({ report: { ...sharedReport, confirmationMethod } }), null)).toBeNull();
    expect(resolveMatchEntryAction(reported, clock("ended", { report: { ...sharedReport, confirmationMethod } }), "this-device")).toBeNull();
    expect(resolveMatchEntryAction(reported, { snapshot: null, loading: false, error: "Offline" }, null)).toBeNull();
  });

  it("requires time review before continuing and never implies another device can take control", () => {
    expect(resolveMatchEntryAction(unreported, clock("paused", { state: { ...createClockState(1), reviewRequired: true } }), "this-device")?.label).toBe("Review time");
    expect(resolveMatchEntryAction(unreported, clock("paused"), "another-device")).toMatchObject({ label: "View match", status: "Clock on another device" });
    expect(resolveMatchEntryAction(unreported, clock("paused", { canControl: false }), "this-device")?.label).toBe("View match");
    expect(resolveMatchEntryAction(unreported, clock("ready"), null)?.label).toBe("View match");
  });

  it("keeps controller and time-review restrictions visible on shared pending reports", () => {
    const pending = { ...unreported, status: "awaiting_confirmation" as const };
    const entry = clock("ended", { report: sharedReport, state: { ...createClockState(1), status: "ended", reviewRequired: true } });
    expect(resolveMatchEntryAction(pending, entry, "this-device")).toMatchObject({ label: "Review time", status: "Time review needed" });
    expect(resolveMatchEntryAction(pending, entry, "another-device")).toMatchObject({ label: "View match", status: "Clock on another device" });
    expect(resolveMatchEntryAction(pending, clock("ended", { report: sharedReport }), "another-device")?.label).toBe("View match");
  });
});

describe("table preference", () => {
  it("stores a physical table under the canonical tournament ID", () => {
    expect(tablePreferenceKey("canonical-id")).toBe("crossplay.table.canonical-id");
    expect(parseTablePreference("9")).toBe(9);
    expect(parseTablePreference("all")).toBe("all");
  });
  it.each([null, "", "0", "-1", "1.5", "1e2", "match-id", "Infinity", "9007199254740992"])("ignores invalid persisted preference %s", value => {
    expect(parseTablePreference(value)).toBe("all");
  });
});
