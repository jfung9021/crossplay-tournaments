import { describe, expect, it } from "vitest";
import { ClockJournal, type ClockStorage, type ClockTimeSource } from "../../src/client/clock-storage";
import { applyClockEvent, createClockState, currentTurnSeconds, type ClockState } from "../../src/domain/clock";

class MemoryStorage implements ClockStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
class Time implements ClockTimeSource {
  wallMs = 1_800_000_000_000;
  monotonicMs = 0;
  now() { return { wallMs: this.wallMs, monotonicMs: this.monotonicMs }; }
  advance(ms: number) { this.wallMs += ms; this.monotonicMs += ms; }
}
function setup() {
  const time = new Time(); const storage = new MemoryStorage(); let online = true;
  const initial = createClockState(1);
  const options = { key: "match-1.epoch-1", state: initial, time, storage, online: () => online, contextId: "page-a", serverNowMs: time.wallMs };
  const clock = new ClockJournal(options);
  return { clock, time, storage, initial, options, offline: () => { online = false; } };
}
function accept(initial: ClockState, clock: ClockJournal) {
  let server = initial;
  for (const event of clock.getPendingEvents()) server = applyClockEvent(server, event);
  clock.acknowledge(server);
  return server;
}

describe("durable clock journal", () => {
  it("retains current-turn time through offline gestures, reload, pause and acknowledgement", () => {
    const { clock, time, options, initial, offline } = setup();
    clock.act("start"); time.advance(5000); clock.act("switch", 1);
    const server = accept(initial, clock);
    offline(); time.advance(3500); clock.act("pause");
    time.advance(60_000); clock.act("resume"); time.advance(2500); time.monotonicMs = 0;
    const restored = new ClockJournal({ ...options, state: server, contextId: "page-b", online: () => true, serverNowMs: time.wallMs });
    const recovered = restored.getSnapshot();
    expect(currentTurnSeconds(recovered.state, recovered.elapsedMs)).toBe(6);
    const saved = accept(server, restored);
    expect(saved.currentTurnMs).toBe(6000);
    time.advance(1000); restored.act("switch", 2);
    expect(restored.getSnapshot().state.currentTurnMs).toBe(0);
  });

  it("upgrades an old persisted journal without rejecting pending gestures", () => {
    const { options, time } = setup();
    const legacy = { ...options.state }; delete legacy.currentTurnMs;
    const clock = new ClockJournal({ ...options, state: legacy });
    clock.act("start"); time.advance(3000); clock.act("pause");
    expect(currentTurnSeconds(clock.getSnapshot().state)).toBeNull();
    const restored = new ClockJournal({ ...options, contextId: "page-b", serverNowMs: time.wallMs });
    expect(restored.getSnapshot()).toMatchObject({ state: { currentTurnMs: 3000, usedMs: [3000, 0] }, controllerConflict: false });
  });

  it("accepts display metadata left stale by a client open during the database upgrade", () => {
    const { clock, options, time, storage } = setup();
    clock.act("start"); time.advance(3000); clock.act("pause");
    const key = `crossplay.clock.${options.key}`;
    const checkpoint = JSON.parse(storage.getItem(key)!);
    // The previous app spreads unknown snapshot fields without updating them on gestures.
    checkpoint.state.currentTurnMs = 0;
    storage.setItem(key, JSON.stringify(checkpoint));
    const restored = new ClockJournal({ ...options, contextId: "page-b", serverNowMs: time.wallMs });
    expect(restored.getSnapshot()).toMatchObject({ state: { currentTurnMs: 3000, usedMs: [3000, 0] }, pendingCount: 2 });
    checkpoint.state.usedMs[0] = 0;
    storage.setItem(key, JSON.stringify(checkpoint));
    expect(() => new ClockJournal(options)).toThrow("could not be recovered");
  });

  it("persists exact offline gestures and end, with duplicate gesture and inactive taps ignored", () => {
    const { clock, time, initial, offline, storage } = setup();
    clock.act("start"); offline(); time.advance(1234);
    expect(clock.act("switch", 2)).toBeNull();
    clock.act("switch", 1, "gesture-a");
    expect(clock.act("switch", 2, "gesture-a")).toBeNull();
    time.advance(7); clock.act("switch", 2, "gesture-b");
    time.advance(20); clock.act("end");
    time.advance(20_000);
    expect(clock.getSnapshot()).toMatchObject({ state: { status: "ended", usedMs: [1254, 7] }, pendingCount: 4, elapsedMs: 0 });
    const server = accept(initial, clock);
    expect(server.usedMs).toEqual([1254, 7]);
    expect(clock.getPendingEvents()).toEqual([]);
    const record = JSON.parse([...storage.values.values()][0]);
    expect(Object.keys(record).sort()).toEqual(["accepted", "anchor", "events", "format", "serverOffsetMs", "state"]);
  });

  it("requires connection to start, while an already running clock works offline", () => {
    const { clock, offline } = setup(); offline();
    expect(() => clock.act("start")).toThrow("Connect before starting");
  });

  it("restores pending events on refresh and charges refresh time to the running side", () => {
    const { clock, time, options } = setup();
    clock.act("start"); time.advance(1234); clock.act("switch", 1);
    time.advance(5000); time.monotonicMs = 0;
    const restored = new ClockJournal({ ...options, contextId: "page-b", serverNowMs: time.wallMs });
    expect(restored.getSnapshot()).toMatchObject({ state: { usedMs: [1234, 5000], activeSide: 2, status: "running" }, recoveryPending: false });
    time.advance(25); restored.act("end");
    expect(restored.getSnapshot().state.usedMs).toEqual([1234, 5025]);
    expect(restored.getPendingEvents().map(event => event.sequence)).toEqual([1, 2, 3, 4]);
  });

  it("preserves a provisional offline reload and waits for server verification before more gestures", () => {
    const { clock, time, options } = setup(); clock.act("start"); time.advance(10_000);
    const restored = new ClockJournal({ ...options, contextId: "page-b", online: () => false, serverNowMs: undefined });
    expect(restored.getSnapshot()).toMatchObject({ elapsedMs: 10_000, recoveryPending: true });
    expect(() => restored.act("end")).toThrow("Reconnect");
    restored.recover(time.wallMs);
    expect(restored.getSnapshot()).toMatchObject({ state: { usedMs: [10_000, 0] }, recoveryPending: false });
  });

  it("charges suspended wall time after independent server verification", () => {
    const { clock, time } = setup(); clock.act("start"); time.advance(3000); clock.setHidden(true);
    time.wallMs += 60_000; // A browser whose monotonic source stops during device sleep.
    clock.setHidden(false);
    expect(clock.getSnapshot().recoveryPending).toBe(true);
    clock.recover(time.wallMs);
    expect(clock.getSnapshot()).toMatchObject({ state: { usedMs: [63_000, 0] }, recoveryPending: false });
    time.advance(1000); clock.act("end");
    expect(clock.getSnapshot().state.usedMs).toEqual([64_000, 0]);
  });

  it("does not require a render loop or wake lock to conserve hidden elapsed time", () => {
    const { clock, time } = setup(); clock.act("start"); time.advance(90_000); clock.act("switch", 1);
    expect(clock.getSnapshot().state.usedMs).toEqual([90_000, 0]);
  });

  it("does not mistake a delayed server response for a foreground clock jump", () => {
    const { clock, time, initial, options } = setup(); clock.act("start");
    const capturedServerTime = time.wallMs;
    const server = applyClockEvent(initial, clock.getPendingEvents()[0]);
    time.advance(15_000); clock.acknowledge(server, capturedServerTime);
    expect(clock.getSnapshot()).toMatchObject({ elapsedMs: 15_000, reviewRequired: false, recoveryPending: false });
    // The old response must not replace the original calibration either.
    time.monotonicMs = 0;
    const restored = new ClockJournal({ ...options, state: server, contextId: "page-b", serverNowMs: time.wallMs });
    expect(restored.getSnapshot()).toMatchObject({ state: { usedMs: [15_000, 0] }, reviewRequired: false });
    restored.act("end"); expect(restored.getSnapshot().state.usedMs).toEqual([15_000, 0]);
  });

  it("retains trusted calibration when a paused checkpoint response is delayed", () => {
    const { clock, time, initial, options } = setup();
    clock.act("start"); time.advance(1000); clock.act("pause");
    let server = initial;
    for (const event of clock.getPendingEvents()) server = applyClockEvent(server, event);
    const capturedServerTime = time.wallMs;
    time.advance(5000); // Slow Wi-Fi delivers an otherwise valid paused checkpoint.
    clock.acknowledge(server, capturedServerTime);
    clock.act("resume"); time.advance(1000); time.monotonicMs = 0;
    const restored = new ClockJournal({ ...options, state: server, contextId: "page-b", serverNowMs: time.wallMs });
    expect(restored.getSnapshot()).toMatchObject({ state: { usedMs: [2000, 0] }, reviewRequired: false, recoveryPending: false });
  });

  it("uses monotonic time when a server sample proves the device wall clock jumped", () => {
    const { clock, time } = setup(); clock.act("start"); time.advance(5000);
    const serverNow = time.wallMs; time.wallMs += 60_000;
    clock.recover(serverNow);
    expect(clock.getSnapshot()).toMatchObject({ state: { usedMs: [5000, 0] }, recoveryPending: false });
  });

  it("records irreconcilable time evidence instead of silently granting/resetting time", () => {
    const { clock, time } = setup(); clock.act("start"); time.advance(5000); time.wallMs += 60_000;
    clock.recover(time.wallMs + 30_000);
    expect(clock.getSnapshot()).toMatchObject({ state: { usedMs: [0, 0], reviewRequired: true }, reviewRequired: true });
    expect(clock.getPendingEvents().at(-1)).toMatchObject({ kind: "recover", reviewRequired: true, elapsedMs: 0 });
    expect(() => clock.act("end")).toThrow("organizer");
  });

  it("keeps gestures captured while an earlier batch was being accepted", () => {
    const { clock, time, initial } = setup(); clock.act("start");
    const first = applyClockEvent(initial, clock.getPendingEvents()[0]);
    time.advance(1000); clock.act("switch", 1); time.advance(500);
    clock.acknowledge(first);
    expect(clock.getSnapshot()).toMatchObject({ state: { usedMs: [1000, 0], activeSide: 2 }, elapsedMs: 500, pendingCount: 1 });
    expect(clock.getAcceptedVersion()).toBe(1);
  });

  it("does not rebase pending gestures onto organizer-corrected timing", () => {
    const { clock, time, initial } = setup();
    clock.act("start"); time.advance(1000); clock.act("pause");
    const server = accept(initial, clock);
    time.advance(1000); clock.act("resume"); time.advance(1000);
    const pending = clock.getPendingEvents();
    // Correcting a paused clock changes its version, but not its event sequence.
    const corrected: ClockState = { ...server, usedMs: [10_000, 0], activeSide: 2, version: server.version + 1 };
    clock.acknowledge(corrected, time.wallMs);
    expect(clock.getSnapshot().controllerConflict).toBe(true);
    expect(clock.getPendingEvents()).toEqual(pending);
  });

  it("preserves the pending journal when reload discovers an organizer timing correction", () => {
    const { clock, time, initial, options } = setup();
    clock.act("start"); time.advance(1000); clock.act("pause");
    const server = accept(initial, clock);
    clock.act("resume"); time.advance(1000);
    const pending = clock.getPendingEvents();
    const corrected: ClockState = { ...server, usedMs: [10_000, 0], activeSide: 2, version: server.version + 1 };
    const restored = new ClockJournal({ ...options, state: corrected, contextId: "page-b", serverNowMs: time.wallMs });
    expect(restored.getSnapshot().controllerConflict).toBe(true);
    expect(restored.getPendingEvents()).toEqual(pending);
    expect(restored.getSnapshot().state.usedMs).toEqual([1000, 0]);
  });

  it("does not unlock a submitted report when an older equal-version response arrives", () => {
    const { clock, initial, options } = setup(); clock.act("start"); clock.act("end");
    const beforeReport = accept(initial, clock);
    clock.acknowledge({ ...beforeReport, reportSubmitted: true });
    clock.acknowledge(beforeReport);
    expect(clock.getSnapshot().state.reportSubmitted).toBe(true);
    const restored = new ClockJournal({ ...options, state: beforeReport, contextId: "page-b" });
    expect(restored.getSnapshot().state.reportSubmitted).toBe(true);
    expect(() => restored.act("resume")).toThrow("submitted clock");
  });

  it("reconciles a lost successful response after reload without charging accepted events twice", () => {
    const { clock, time, options, initial } = setup();
    clock.act("start"); time.advance(3000); clock.act("switch", 1);
    // SQL committed these events, but the response never reached the browser.
    let server = initial;
    for (const event of clock.getPendingEvents()) server = applyClockEvent(server, event);
    time.advance(500); clock.act("switch", 2);
    time.advance(100); time.monotonicMs = 0;
    const reloaded = new ClockJournal({ ...options, state: server, contextId: "page-b", serverNowMs: time.wallMs });
    expect(reloaded.getAcceptedVersion()).toBe(2);
    expect(reloaded.getPendingEvents().map(event => event.sequence)).toEqual([3, 4]);
    for (const event of reloaded.getPendingEvents()) server = applyClockEvent(server, event);
    reloaded.acknowledge(server, time.wallMs);
    expect(server.usedMs).toEqual([3100, 500]);
    expect(reloaded.getPendingEvents()).toEqual([]);
  });

  it("ignores old response snapshots without discarding newer accepted state", () => {
    const { clock, time, initial } = setup(); clock.act("start");
    const old = applyClockEvent(initial, clock.getPendingEvents()[0]);
    time.advance(3000); clock.act("end");
    accept(initial, clock); clock.acknowledge(old);
    expect(clock.getSnapshot()).toMatchObject({ state: { status: "ended", usedMs: [3000, 0] }, pendingCount: 0 });
    expect(clock.getAcceptedVersion()).toBe(2);
  });

  it("stops stale epochs and preserves the original journal after organizer takeover", () => {
    const { clock, options } = setup(); clock.act("start");
    const replacement = new ClockJournal({ ...options, state: { ...options.state, epoch: 2 } });
    expect(replacement.getSnapshot().controllerConflict).toBe(true);
    expect(() => replacement.act("end")).toThrow("another device");
    expect(replacement.getPendingEvents()).toHaveLength(1);
  });

  it("locks resumption after an accepted ended report", () => {
    const { clock, initial } = setup(); clock.act("start"); clock.act("end");
    expect(() => clock.markReportSubmitted()).toThrow("Save the ended clock");
    accept(initial, clock); clock.markReportSubmitted();
    expect(() => clock.act("resume")).toThrow("submitted clock");
  });

  it("does not display an accepted transition when durable storage fails", () => {
    const { clock, storage } = setup();
    storage.setItem = () => { throw new Error("Quota exceeded"); };
    expect(() => clock.act("start")).toThrow("Clock storage is unavailable");
    expect(clock.getSnapshot().state.status).toBe("ready");
    expect(clock.getPendingEvents()).toHaveLength(0);
  });

  it("does not erase a corrupt checkpoint", () => {
    const { options, storage } = setup(); storage.setItem("crossplay.clock.match-1.epoch-1", "bad json");
    expect(() => new ClockJournal(options)).toThrow("organizer");
    expect(storage.getItem("crossplay.clock.match-1.epoch-1")).toBe("bad json");
  });
});
