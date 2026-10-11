import type { DisplayClock } from "@/domain/display";
import { deriveClock } from "@/domain/clock";
import { formatDuration } from "@/domain/duration";
import { serverTime, type TimeSample } from "./server-time";

export const CLOCK_SAMPLE_TTL_MS = 6000;
export interface ClockView { values: [string, string]; activeSide: number | null; label: string }
export const emptyClockView: ClockView = { values: ["—", "—"], activeSide: null, label: "" };
const labels = { ready: "Ready", running: "Playing", paused: "Paused", ended: "Reporting" };

/** One scheduler for all visible digits; listeners see stable objects until text changes. */
export class DisplayClockStore {
  private clocks: Record<string, DisplayClock> = {};
  private views = new Map<string, ClockView>();
  private listeners = new Set<() => void>();
  private anchor: TimeSample | null = null;
  private connected = false;
  private generation = "";
  private frozen = new Map<string, ClockView>();
  private used = new Map<string, [number, number]>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get = (id: string) => this.views.get(id) ?? emptyClockView;
  receive(clocks: Record<string, DisplayClock>, generation: string, anchor: TimeSample, mono: number, wall: number) {
    if (this.generation !== generation) { this.clocks = {}; this.views.clear(); this.frozen.clear(); this.used.clear(); }
    for (const [id, next] of Object.entries(clocks)) {
      const prior = this.clocks[id];
      if (prior && (next.epoch > prior.epoch || next.epoch === prior.epoch && next.version > prior.version)) { this.views.delete(id); this.used.delete(id); }
      if (prior && (next.epoch < prior.epoch || next.epoch === prior.epoch && next.version < prior.version)) clocks[id] = prior;
      else if (!prior || next.epoch !== prior.epoch || next.version !== prior.version || (next.sample?.sampledAtMs ?? 0) > (prior.sample?.sampledAtMs ?? 0)) this.frozen.delete(id);
      else if (prior.sample && next.sample && next.sample.sampledAtMs < prior.sample.sampledAtMs) clocks[id] = prior;
    }
    this.clocks = clocks; this.generation = generation; this.anchor = anchor; this.connected = true;
    this.tick(mono, wall);
  }
  disconnect(mono: number, wall: number) {
    this.tick(mono, wall);
    this.connected = false; this.anchor = null;
    for (const [id, clock] of Object.entries(this.clocks)) if (clock.status === "running") this.frozen.set(id, this.get(id));
    this.tick(mono, wall);
  }
  clear() { this.clocks = {}; this.views.clear(); this.frozen.clear(); this.used.clear(); this.anchor = null; this.listeners.forEach(listener => listener()); }
  tick(mono: number, wall: number) {
    const time = serverTime(this.anchor, mono, wall);
    let changed = false;
    for (const id of this.views.keys()) if (!this.clocks[id]) { this.views.delete(id); this.frozen.delete(id); this.used.delete(id); changed = true; }
    for (const [id, clock] of Object.entries(this.clocks)) {
      const sample = clock.sample;
      const age = time && sample ? Math.max(0, time.nowMs - sample.sampledAtMs) : 0;
      const reliable = !!(this.connected && time && sample && time.uncertaintyMs + sample.uncertaintyMs <= 1000 && sample.sampledAtMs <= time.nowMs + time.uncertaintyMs + sample.uncertaintyMs);
      const stale = clock.status === "running" && (!reliable || age >= CLOCK_SAMPLE_TTL_MS || this.frozen.has(id));
      const priorFrozen = this.frozen.get(id);
      let view: ClockView;
      if (stale && priorFrozen) view = { ...priorFrozen, activeSide: null, label: sample ? "Clock stale" : "Synchronizing" };
      else {
        const elapsed = clock.status === "running" && reliable ? Math.floor(Math.min(age, CLOCK_SAMPLE_TTL_MS)) : 0;
        const previousUsed = this.used.get(id);
        const usedMs = (sample && reliable ? sample.usedMs : clock.usedMs).map((value, index) => {
          const projected = value + (index === clock.activeSide - 1 ? elapsed : 0);
          // Small network calibration changes cannot make a running display gain time.
          // A new official version/epoch clears this bound, so corrections apply immediately.
          return clock.status === "running" && previousUsed ? Math.max(projected, previousUsed[index]) : projected;
        }) as [number, number];
        this.used.set(id, usedMs);
        const values = deriveClock({ ...clock, usedMs, anchorAtMs: null, reportSubmitted: false, reviewRequired: false }, clock.rules);
        view = { values: values.map(value => `${value.isOvertime ? "OT " : ""}${formatDuration(value.displaySeconds)}`) as [string, string],
          activeSide: clock.status === "running" && !stale ? clock.activeSide : null,
          label: stale ? sample ? "Clock stale" : "Synchronizing" : labels[clock.status] };
        if (stale) {
          // A failed calibration cannot replace a previously shown estimate with an older saved time.
          if (!reliable && this.views.has(id)) view.values = this.get(id).values;
          this.frozen.set(id, view);
        }
      }
      const previous = this.views.get(id);
      if (!previous || previous.label !== view.label || previous.activeSide !== view.activeSide || previous.values[0] !== view.values[0] || previous.values[1] !== view.values[1]) {
        this.views.set(id, view); changed = true;
      }
    }
    if (changed) this.listeners.forEach(listener => listener());
  }
}
