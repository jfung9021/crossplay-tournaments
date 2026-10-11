import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckpointPublisher, type CheckpointSource } from "../../src/client/clock-checkpoint";
import { createClockState } from "../../src/domain/clock";

let current: CheckpointSource | null;
let requests: { method: string; body?: string }[];
beforeEach(() => {
  requests = [];
  current = { controllerId: "controller", generation: 1, local: { state: { ...createClockState(1), status: "running", version: 1, sequence: 1 }, elapsedMs: 1234, pendingCount: 0, controllerConflict: false, recoveryPending: false, reviewRequired: false } };
  vi.stubGlobal("document", { visibilityState: "visible" }); vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("fetch", vi.fn(async (_path, options) => {
    requests.push({ method: options.method, body: options.body });
    return Response.json({ available: true, serverNowMs: Date.now() });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });
describe("controller spectator samples", () => {
  it("calibrates, then posts accepted elapsed time with exact ownership/version binding", async () => {
    const publisher = createCheckpointPublisher("match", () => current);
    await publisher.publish();
    expect(requests.map(r => r.method)).toEqual(["GET", "POST"]);
    expect(JSON.parse(requests[1].body!)).toMatchObject({ controllerId: "controller", generation: 1, version: 1, sequence: 1, epoch: 1, elapsedMs: 1234 });
    expect(current!.local.state.usedMs).toEqual([0, 0]); publisher.dispose();
  });
  it("never publishes pending, uncertain, conflicted, hidden, or offline samples", async () => {
    const publisher = createCheckpointPublisher("match", () => current);
    current!.local.pendingCount = 1; await publisher.publish();
    current!.local.pendingCount = 0; current!.local.recoveryPending = true; await publisher.publish();
    current!.local.recoveryPending = false; current!.local.controllerConflict = true; await publisher.publish();
    current!.local.controllerConflict = false;
    vi.stubGlobal("document", { visibilityState: "hidden" }); await publisher.publish();
    vi.stubGlobal("document", { visibilityState: "visible" }); vi.stubGlobal("navigator", { onLine: false }); await publisher.publish();
    expect(requests.filter(r => r.method === "POST")).toHaveLength(0); publisher.dispose();
  });
  it("recaptures after calibration and does not replay a failed sample", async () => {
    let first = true;
    vi.stubGlobal("fetch", vi.fn(async (_path, options) => {
      requests.push({ method: options.method, body: options.body });
      if (options.method === "GET") { current!.local.elapsedMs = 2500; return Response.json({ available: true, serverNowMs: Date.now() }); }
      if (first) { first = false; throw new Error("offline"); }
      return Response.json({ available: true, serverNowMs: Date.now() });
    }));
    const publisher = createCheckpointPublisher("match", () => current);
    await expect(publisher.publish()).resolves.toBeUndefined();
    expect(JSON.parse(requests[1].body!).elapsedMs).toBe(2500);
    current = null; await publisher.publish(); expect(requests).toHaveLength(2); publisher.dispose();
  });
  it("backs off when the database capability is unavailable", async () => {
    const fetcher = vi.fn(async () => Response.json({ available: false })); vi.stubGlobal("fetch", fetcher);
    const publisher = createCheckpointPublisher("match", () => current);
    await publisher.publish(); await publisher.publish(); expect(fetcher).toHaveBeenCalledTimes(1); publisher.dispose();
  });
});
