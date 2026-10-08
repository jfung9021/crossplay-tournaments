"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clockError, matchClockApi, type MatchClockSnapshot } from "./match-clock-api";
import type { MatchEntryRead } from "./match-entry-state";

const emptyEntry: MatchEntryRead = { snapshot: null, loading: true, error: null };
type EntriesContextValue = {
  entries: Record<string, MatchEntryRead>;
  register: (matchId: string) => () => void;
  retry: () => void;
};
const EntriesContext = createContext<EntriesContextValue | null>(null);

/** Reuses the tournament snapshot refresh lifecycle; cards add no polling. */
export function MatchEntriesProvider({ refreshKey, children }: { refreshKey: unknown; children: ReactNode }) {
  const [registrations, setRegistrations] = useState<Map<string, number>>(() => new Map());
  const [entries, setEntries] = useState<Record<string, MatchEntryRead>>({});
  const [retryCount, setRetryCount] = useState(0);
  const inFlight = useRef(new Map<string, { freshness: object; promise: Promise<MatchClockSnapshot> }>());
  const register = useCallback((matchId: string) => {
    setRegistrations(previous => new Map(previous).set(matchId, (previous.get(matchId) ?? 0) + 1));
    return () => setRegistrations(previous => {
      const next = new Map(previous), count = (next.get(matchId) ?? 1) - 1;
      if (count > 0) next.set(matchId, count); else next.delete(matchId);
      return next;
    });
  }, []);
  const retry = useCallback(() => setRetryCount(value => value + 1), []);
  const freshness = useMemo(() => ({ refreshKey, retryCount }), [refreshKey, retryCount]);
  const idsKey = JSON.stringify([...registrations.keys()].sort());
  useEffect(() => {
    let current = true;
    const ids = JSON.parse(idsKey) as string[];
    for (const matchId of ids) {
      const existing = inFlight.current.get(matchId);
      let request = existing?.freshness === freshness ? existing.promise : undefined;
      if (!request) {
        request = matchClockApi<MatchClockSnapshot>(matchId);
        inFlight.current.set(matchId, { freshness, promise: request });
        const pending = request;
        const clear = () => { if (inFlight.current.get(matchId)?.promise === pending) inFlight.current.delete(matchId); };
        void request.then(clear, clear);
      }
      void request.then(snapshot => {
        if (current) setEntries(previous => ({ ...previous, [matchId]: { snapshot, loading: false, error: null } }));
      }, cause => {
        if (current) setEntries(previous => ({ ...previous, [matchId]: { snapshot: previous[matchId]?.snapshot ?? null, loading: false, error: clockError(cause) } }));
      });
    }
    // A view/table change makes old responses ineligible to update this view.
    return () => { current = false; };
  }, [idsKey, freshness]);
  const value = useMemo(() => ({ entries, register, retry }), [entries, register, retry]);
  return <EntriesContext.Provider value={value}>{children}</EntriesContext.Provider>;
}

export function useMatchEntry(matchId: string, enabled = true): MatchEntryRead & { retry: () => void } {
  const context = useContext(EntriesContext);
  const register = context?.register;
  useEffect(() => enabled ? register?.(matchId) : undefined, [enabled, matchId, register]);
  return { ...(enabled ? context?.entries[matchId] ?? emptyEntry : emptyEntry), retry: context?.retry ?? (() => {}) };
}

export function useMatchEntries(matchIds: string[]) {
  const context = useContext(EntriesContext);
  const register = context?.register;
  const idsKey = JSON.stringify([...new Set(matchIds)].sort());
  useEffect(() => {
    const removers = (JSON.parse(idsKey) as string[]).map(id => register?.(id));
    return () => removers.forEach(remove => remove?.());
  }, [idsKey, register]);
  return { entries: context?.entries ?? {}, retry: context?.retry ?? (() => {}) };
}
