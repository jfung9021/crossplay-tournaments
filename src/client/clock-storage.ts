import { applyClockEvent } from "../domain/clock";
import type { ClockEvent, ClockEventKind, ClockSide, ClockState } from "../domain/clock-types";

export interface ClockTimeSource {
  now(): { wallMs: number; monotonicMs: number };
}
export interface ClockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface Anchor { wallMs: number; monotonicMs: number; contextId: string }
interface StoredClock {
  format: 1;
  accepted: ClockState;
  state: ClockState;
  events: ClockEvent[];
  anchor: Anchor;
  serverOffsetMs: number | null;
}
export interface ClockJournalOptions {
  /** Use a match ID and controller epoch, never the private invitation token. */
  key: string;
  state: ClockState;
  storage?: ClockStorage;
  time?: ClockTimeSource;
  online?: () => boolean;
  serverNowMs?: number;
  contextId?: string;
}
export interface ClockJournalSnapshot {
  state: ClockState;
  elapsedMs: number;
  pendingCount: number;
  reviewRequired: boolean;
  recoveryPending: boolean;
  controllerConflict: boolean;
}

const contextId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `clock-${Math.random()}`;
// Server timestamps are captured before a response travels to the device.
const NETWORK_TOLERANCE_MS = 2000;
const browserTime: ClockTimeSource = { now: () => ({ wallMs: Date.now(), monotonicMs: performance.now() }) };

function copy(state: ClockState): ClockState { return { ...state, usedMs: [...state.usedMs] }; }
function isState(value: unknown): value is ClockState {
  if (!value || typeof value !== "object") return false;
  const state = value as ClockState;
  return ["ready", "running", "paused", "ended"].includes(state.status)
    && (state.activeSide === 1 || state.activeSide === 2)
    && Array.isArray(state.usedMs) && state.usedMs.length === 2 && state.usedMs.every(n => Number.isSafeInteger(n) && n >= 0)
    && (state.currentTurnMs === undefined || Number.isSafeInteger(state.currentTurnMs) && state.currentTurnMs >= 0)
    && [state.epoch, state.sequence, state.version].every(n => Number.isSafeInteger(n) && n >= 0)
    && (state.anchorAtMs === null || (Number.isSafeInteger(state.anchorAtMs) && state.anchorAtMs >= 0))
    && typeof state.reportSubmitted === "boolean" && typeof state.reviewRequired === "boolean";
}
function readStored(storage: ClockStorage, key: string): StoredClock | null {
  const serialized = storage.getItem(key);
  if (!serialized) return null;
  try {
    const stored = JSON.parse(serialized) as StoredClock;
    if (stored.format !== 1 || !isState(stored.accepted) || !isState(stored.state) || !Array.isArray(stored.events)
      || !stored.anchor || !Number.isFinite(stored.anchor.wallMs) || !Number.isFinite(stored.anchor.monotonicMs)
      || typeof stored.anchor.contextId !== "string"
      || (stored.serverOffsetMs !== null && !Number.isFinite(stored.serverOffsetMs))) throw new Error("Invalid checkpoint.");
    let replay = stored.accepted;
    for (const event of stored.events) replay = applyClockEvent(replay, event);
    // Older clients preserve unknown snapshot fields without updating them. Verify
    // all authoritative timing exactly, then rebuild this display-only projection.
    const replayTiming = { ...replay }; delete replayTiming.currentTurnMs;
    const storedTiming = { ...stored.state }; delete storedTiming.currentTurnMs;
    if (JSON.stringify(replayTiming) !== JSON.stringify(storedTiming)) throw new Error("The checkpoint does not match its journal.");
    stored.state = replay;
    return stored;
  } catch {
    throw new Error("The saved clock could not be recovered. Ask the organizer to review its time.");
  }
}

/**
 * Synchronous writes make the gesture durable before it is shown as accepted.
 * No cookie, invitation token, player credential or raw score enters this store.
 */
export class ClockJournal {
  private readonly key: string;
  private readonly storage: ClockStorage;
  private readonly time: ClockTimeSource;
  private readonly online: () => boolean;
  private readonly context: string;
  private state: ClockState;
  private accepted: ClockState;
  private events: ClockEvent[] = [];
  private anchor: Anchor;
  private serverOffsetMs: number | null = null;
  private recoveryPending = false;
  private controllerConflict = false;
  private hidden = false;
  private readonly gestures = new Set<string>();

  constructor(options: ClockJournalOptions) {
    this.key = `crossplay.clock.${options.key}`;
    this.storage = options.storage ?? localStorage;
    this.time = options.time ?? browserTime;
    this.online = options.online ?? (() => navigator.onLine);
    this.context = options.contextId ?? contextId;
    this.state = copy(options.state);
    this.accepted = copy(options.state);
    this.anchor = { ...this.time.now(), contextId: this.context };
    const stored = readStored(this.storage, this.key);
    if (stored) {
      const pending = stored.events.filter(event => event.sequence > options.state.sequence);
      const changedTimeline = options.state.version - stored.accepted.version !== options.state.sequence - stored.accepted.sequence;
      if (stored.state.epoch !== options.state.epoch || pending.length > 0 && (changedTimeline || options.state.reportSubmitted)) {
        // Preserve the old journal for an organizer to inspect after takeover.
        this.controllerConflict = true;
        this.state = copy(stored.state);
        this.accepted = copy(stored.accepted);
        this.events = stored.events;
        this.anchor = stored.anchor;
        this.serverOffsetMs = stored.serverOffsetMs;
        return;
      }
      if (stored.accepted.sequence > options.state.sequence) throw new Error("The server clock is older than this device's accepted clock.");
      if (options.state.version === stored.accepted.version && options.state.sequence === stored.accepted.sequence && stored.accepted.reportSubmitted) {
        this.state.reportSubmitted = true;
        this.accepted.reportSubmitted = true;
      }
      this.events = pending;
      for (const event of pending) this.state = applyClockEvent(this.state, event);
      if (this.state.sequence === stored.state.sequence && this.state.version === stored.state.version) {
        this.anchor = stored.anchor;
      } else if (this.state.status === "running" && this.state.anchorAtMs !== null) {
        this.anchor.wallMs = this.state.anchorAtMs;
        this.anchor.contextId = "server-restoration";
      }
      this.serverOffsetMs = stored.serverOffsetMs;
    } else if (this.state.status === "running" && this.state.anchorAtMs !== null) {
      this.anchor.wallMs = this.state.anchorAtMs;
      this.anchor.contextId = "server-restoration";
    }
    if (this.serverOffsetMs === null && options.serverNowMs !== undefined) {
      this.serverOffsetMs = options.serverNowMs - this.time.now().wallMs;
    }
    this.recover(options.serverNowMs);
    this.persist();
  }

  private persist(): void {
    const stored: StoredClock = { format: 1, accepted: this.accepted, state: this.state, events: this.events, anchor: this.anchor, serverOffsetMs: this.serverOffsetMs };
    this.storage.setItem(this.key, JSON.stringify(stored));
  }

  private elapsed(serverNowMs?: number): { ms: number; uncertain: boolean; invalid: boolean } {
    if (this.state.status !== "running" || this.state.reviewRequired) return { ms: 0, uncertain: false, invalid: false };
    const now = this.time.now();
    const wall = now.wallMs - this.anchor.wallMs;
    const sameContext = this.anchor.contextId === this.context;
    const mono = sameContext ? now.monotonicMs - this.anchor.monotonicMs : null;
    const server = serverNowMs !== undefined && this.serverOffsetMs !== null ? serverNowMs - (this.anchor.wallMs + this.serverOffsetMs) : null;
    if (mono !== null && mono >= 0 && Math.abs(wall - mono) <= NETWORK_TOLERANCE_MS) {
      // A timestamp captured before a slow HTTP response is not evidence that
      // two agreeing local sources lost time. Server calibration is needed only
      // when the monotonic anchor is gone or the local sources disagree.
      return { ms: Math.floor(mono), uncertain: false, invalid: false };
    }
    if (server !== null && server < -NETWORK_TOLERANCE_MS) return { ms: 0, uncertain: false, invalid: true };
    if (server !== null) {
      if (wall >= 0 && Math.abs(server - wall) <= NETWORK_TOLERANCE_MS) return { ms: Math.floor(wall), uncertain: false, invalid: false };
      if (mono !== null && mono >= 0 && Math.abs(server - mono) <= NETWORK_TOLERANCE_MS) return { ms: Math.floor(mono), uncertain: false, invalid: false };
      return { ms: 0, uncertain: false, invalid: true };
    }
    // A different process has no comparable monotonic anchor. Until an online
    // time sample arrives, keep the original records and show provisional time.
    return { ms: Math.max(0, Math.floor(wall)), uncertain: true, invalid: wall < 0 || (mono !== null && mono < 0) };
  }

  getSnapshot(): ClockJournalSnapshot {
    const elapsed = this.elapsed();
    return { state: copy(this.state), elapsedMs: elapsed.ms, pendingCount: this.events.length,
      reviewRequired: this.state.reviewRequired, recoveryPending: this.recoveryPending || elapsed.uncertain || elapsed.invalid,
      controllerConflict: this.controllerConflict };
  }

  getPendingEvents(): ClockEvent[] { return this.events.map(event => ({ ...event })); }
  getAcceptedVersion(): number { return this.accepted.version; }

  /** A server sample resolves sleep/reload gaps; irreconcilable jumps are audited. */
  recover(serverNowMs?: number): void {
    if (this.controllerConflict || this.state.reviewRequired || this.state.reportSubmitted) return;
    const delta = this.elapsed(serverNowMs);
    this.recoveryPending = delta.uncertain;
    if (delta.uncertain && !delta.invalid) return;
    if (delta.invalid) {
      this.append("recover", 0, undefined, true);
      this.recoveryPending = false;
      return;
    }
    const wallDisagreement = this.anchor.contextId === this.context && Math.abs((this.time.now().wallMs - this.anchor.wallMs) - (this.time.now().monotonicMs - this.anchor.monotonicMs)) > NETWORK_TOLERANCE_MS;
    const needsAnchor = this.anchor.contextId !== this.context || this.hidden || wallDisagreement;
    if (needsAnchor && this.state.status === "running") this.append("recover", delta.ms);
    // A slow response must not replace a trusted offset merely because the
    // clock is paused/ended. Recalibrate only a verified running discontinuity.
    if (serverNowMs !== undefined && (this.serverOffsetMs === null || wallDisagreement && this.state.status === "running")) {
      this.serverOffsetMs = serverNowMs - this.time.now().wallMs;
    }
    this.recoveryPending = false;
    this.persist();
  }

  setHidden(hidden: boolean, serverNowMs?: number): void {
    this.recover(serverNowMs);
    this.hidden = hidden;
  }

  act(kind: ClockEventKind, side?: ClockSide, gestureId?: string): ClockEvent | null {
    if (this.controllerConflict) throw new Error("This clock is controlled by another device.");
    if (gestureId && this.gestures.has(gestureId)) return null;
    if (kind === "switch" && (this.state.status !== "running" || side !== this.state.activeSide)) return null;
    if (kind === "start" && !this.online()) throw new Error("Connect before starting this clock.");
    const delta = this.elapsed();
    if (this.recoveryPending || delta.uncertain || delta.invalid) throw new Error("Reconnect to verify the clock before continuing.");
    const event = this.append(kind, delta.ms, side);
    if (gestureId) {
      this.gestures.add(gestureId);
      if (this.gestures.size > 100) this.gestures.delete(this.gestures.values().next().value!);
    }
    return event;
  }

  private append(kind: ClockEventKind, elapsedMs: number, side?: ClockSide, reviewRequired?: boolean): ClockEvent {
    const sample = this.time.now();
    const event: ClockEvent = { sequence: this.state.sequence + 1, kind, atMs: Math.floor(sample.wallMs), elapsedMs, ...(side === undefined ? {} : { side }), ...(reviewRequired ? { reviewRequired: true } : {}) };
    const next = applyClockEvent(this.state, event);
    const previous = { state: this.state, events: this.events, anchor: this.anchor };
    this.state = next;
    this.events = [...this.events, event];
    this.anchor = { ...sample, contextId: this.context };
    try { this.persist(); } catch (error) {
      this.state = previous.state; this.events = previous.events; this.anchor = previous.anchor;
      throw new Error("Clock storage is unavailable. Pause play and ask the organizer for help.", { cause: error });
    }
    return { ...event };
  }

  /** Preserve local gestures that happened while a batch was in flight. */
  acknowledge(serverState: ClockState, serverNowMs?: number): void {
    if (serverState.epoch !== this.state.epoch) { this.setControllerConflict(); return; }
    if (serverState.sequence < this.accepted.sequence || serverState.version < this.accepted.version) return;
    if (serverState.sequence === this.accepted.sequence && serverState.version === this.accepted.version && this.accepted.reportSubmitted && !serverState.reportSubmitted) return;
    const pending = this.events.filter(event => event.sequence > serverState.sequence);
    const changedTimeline = serverState.version - this.accepted.version !== serverState.sequence - this.accepted.sequence;
    if (pending.length && (changedTimeline || serverState.reportSubmitted)) { this.setControllerConflict(); return; }
    let next = copy(serverState);
    for (const event of pending) next = applyClockEvent(next, event);
    const sameAnchor = next.sequence === this.state.sequence && next.version === this.state.version;
    this.accepted = copy(serverState);
    this.state = next;
    this.events = pending;
    if (!sameAnchor) {
      this.anchor = { ...this.time.now(), contextId: this.context };
      if (next.status === "running" && next.anchorAtMs !== null) {
        this.anchor.wallMs = next.anchorAtMs;
        this.anchor.contextId = "server-restoration";
      }
    }
    this.recover(serverNowMs);
    this.persist();
  }

  markReportSubmitted(): void {
    if (this.state.status !== "ended" || this.events.length || this.recoveryPending || this.state.reviewRequired) throw new Error("Save the ended clock before reporting.");
    this.state = { ...this.state, reportSubmitted: true };
    this.accepted = { ...this.accepted, reportSubmitted: true };
    this.persist();
  }

  setControllerConflict(): void { this.controllerConflict = true; }
}

/** Exclusive origin-local tab lock; the server epoch remains the device guard. */
export async function acquireClockTabLock(key: string, onLost?: () => void): Promise<(() => void) | null> {
  if (typeof navigator === "undefined" || !navigator.locks) return null;
  return new Promise(resolve => {
    let released = false;
    void navigator.locks.request(`crossplay.clock.${key}`, { mode: "exclusive", ifAvailable: true }, async lock => {
      if (!lock) { resolve(null); return; }
      await new Promise<void>(release => {
        resolve(() => { if (!released) { released = true; release(); } });
      });
    }).catch(() => { onLost?.(); resolve(null); });
  });
}
