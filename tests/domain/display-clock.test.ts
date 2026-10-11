import { describe, expect, it } from "vitest";
import { DisplayClockStore } from "../../src/client/display-clock-store";
import { serverTime, timeSample } from "../../src/client/server-time";
import type { DisplayClock } from "../../src/domain/display";

const origin = 1_800_000_000_000;
function clock(patch: Partial<DisplayClock> = {}): DisplayClock {
  return { status: "running", activeSide: 1, usedMs: [10_000, 20_000], epoch: 1, version: 1, sequence: 1,
    rules: { timeLimitSeconds: 1200, penaltyIntervalSeconds: 10, penaltyPoints: 2 },
    sample: { usedMs: [10_000, 20_000], sampledAtMs: origin, uncertaintyMs: 50 }, ...patch };
}
function receive(store: DisplayClockStore, value = clock(), mono = 0, generation = "event:0") {
  store.receive({ match: value }, generation, timeSample(origin + mono, mono, mono, origin + mono), mono, origin + mono);
}
describe("spectator timing", () => {
  it("does not run again on an old sample after reconnect", () => {
    const store = new DisplayClockStore(); receive(store);
    store.disconnect(1000, origin + 1000);
    receive(store, clock(), 2000);
    expect(store.get("match")).toMatchObject({ label: "Clock stale", values: ["19:49", "19:40"] });
  });
  it("does not step backwards from calibration jitter", () => {
    const store = new DisplayClockStore();
    receive(store, clock({ sample: { usedMs: [12_000, 20_000], sampledAtMs: origin + 2000, uncertaintyMs: 10 } }), 2000);
    store.tick(3010, origin + 3010);
    expect(store.get("match").values[0]).toBe("19:47");
    receive(store, clock({ sample: { usedMs: [12_900, 20_000], sampledAtMs: origin + 3100, uncertaintyMs: 100 } }), 3100);
    expect(store.get("match").values[0]).toBe("19:47");
  });
  it("uses monotonic time despite a different device wall clock and detects a subsequent jump", () => {
    const sample = timeSample(origin, 100, 300, origin + 3_600_000);
    expect(serverTime(sample, 1300, origin + 3_601_000)).toEqual({ nowMs: origin + 1100, uncertaintyMs: 102 });
    expect(serverTime(sample, 1300, origin + 3_701_000)).toBeNull();
  });
  it("catches up once after delayed rendering and freezes at the sample expiry", () => {
    const store = new DisplayClockStore(); receive(store);
    expect(store.get("match").values).toEqual(["19:50", "19:40"]);
    store.tick(4500, origin + 4500);
    expect(store.get("match").values[0]).toBe("19:46");
    store.tick(9000, origin + 9000);
    expect(store.get("match")).toMatchObject({ values: ["19:44", "19:40"], label: "Clock stale", activeSide: null });
    const frozen = store.get("match");
    receive(store, clock(), 15000);
    expect(store.get("match")).toBe(frozen);
  });
  it("tracks ten minutes without accumulated drift or rerenders on unchanged text", () => {
    const store = new DisplayClockStore(); let commits = 0; store.subscribe(() => commits++);
    for (let ms = 0; ms <= 600_000; ms += 100) {
      if (ms % 2000 === 0) receive(store, clock({ sample: { usedMs: [10_000 + ms, 20_000], sampledAtMs: origin + ms, uncertaintyMs: 100 } }), ms);
      store.tick(ms, origin + ms);
      const expected = Math.ceil((1_190_000 - ms) / 1000);
      expect(store.get("match").values[0]).toBe(`${Math.floor(expected / 60)}:${String(expected % 60).padStart(2, "0")}`);
    }
    expect(commits).toBe(601);
  });
  it("freezes a failed feed until a fresh compatible sample; versions and generation reset projections", () => {
    const store = new DisplayClockStore(); receive(store);
    store.disconnect(2000, origin + 2000);
    expect(store.get("match")).toMatchObject({ label: "Clock stale", values: ["19:48", "19:40"] });
    receive(store, clock({ version: 2, sequence: 2, activeSide: 2, usedMs: [12_000, 20_000], sample: null }), 3000);
    expect(store.get("match")).toMatchObject({ label: "Synchronizing", values: ["19:48", "19:40"] });
    receive(store, clock({ version: 2, sequence: 2, activeSide: 2, usedMs: [12_000, 20_000], sample: { usedMs: [12_000, 21_000], sampledAtMs: origin + 4000, uncertaintyMs: 50 } }), 4000);
    expect(store.get("match")).toMatchObject({ label: "Playing", activeSide: 2 });
    receive(store, clock(), 4000); // older version cannot undo the side switch
    expect(store.get("match").activeSide).toBe(2);
    receive(store, clock({ status: "paused", epoch: 2, version: 3, usedMs: [30_000, 40_000], sample: null }), 5000);
    expect(store.get("match")).toMatchObject({ label: "Paused", values: ["19:30", "19:20"] });
    receive(store, clock({ status: "ready", usedMs: [0, 0], sample: null }), 6000, "event:1");
    expect(store.get("match").values).toEqual(["20:00", "20:00"]);
    store.clear(); expect(store.get("match").values).toEqual(["—", "—"]);
  });
  it("does not extrapolate uncertain samples and formats overtime with the existing boundary rules", () => {
    const store = new DisplayClockStore();
    receive(store, clock({ sample: { usedMs: [1_200_000, 20_000], sampledAtMs: origin, uncertaintyMs: 1000 } }));
    expect(store.get("match").label).toBe("Clock stale");
    receive(store, clock({ sample: { usedMs: [1_200_000, 20_000], sampledAtMs: origin + 100, uncertaintyMs: 10 } }), 100);
    expect(store.get("match").values[0]).toBe("OT 0:00");
    store.tick(1100, origin + 1100); expect(store.get("match").values[0]).toBe("OT 0:01");
  });
});
