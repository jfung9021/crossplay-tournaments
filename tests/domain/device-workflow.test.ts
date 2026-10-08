import { describe, expect, it } from "vitest";
import { localDestination } from "@/client/device-preferences";
import { draftKey, readReportDraft } from "@/client/report-drafts";
import { calculateStandings } from "@/domain/standings";
import { calculateScore } from "@/domain/scoring";
import { config, match, roster, round } from "./fixtures";

describe("table workflow boundaries", () => {
  it("allows only local tournament and management return destinations", () => {
    expect(localDestination("/t/event/table")).toBe("/t/event/table");
    expect(localDestination("/admin/tournaments/id#match-id")).toBe("/admin/tournaments/id#match-id");
    for (const value of ["https://example.com", "//example.com/t/x", "/\\example.com", "/login", "javascript:alert(1)"]) expect(localDestination(value)).toBeNull();
  });
  it("restores draft context without treating it as a submitted report", () => {
    const stored = { context: "revision-4", values: { raw1: "401", raw2: "399" } };
    expect(draftKey("event.2.match.player")).toContain("event.2.match.player");
    expect(readReportDraft({ getItem: () => JSON.stringify(stored) }, "key")).toEqual(stored);
    expect(readReportDraft({ getItem: () => "broken" }, "key")).toBeNull();
  });
  it("ranks a departed three-win player by the same earned record and preserves rounds", () => {
    const entrants = roster(8);
    const rounds = [1, 2, 3, 4].map((number) => round(number, [match("p0", `p${number}`, calculateScore({ raw1: number === 4 ? 300 : 400, raw2: 350, overtime1: 0, overtime2: 0 }, config))]));
    const history = structuredClone(rounds);
    const before = calculateStandings(entrants, rounds);
    entrants[0].active = false;
    const after = calculateStandings(entrants, rounds);
    expect(after.find(row => row.entrantId === "p0")).toMatchObject({ wins: 3, losses: 1, matchPoints: 3, rank: 1, active: false });
    expect(after.map(row => ({ ...row, active: true }))).toEqual(before);
    expect(rounds).toEqual(history);
  });
});
