"use client";

import { useEffect, useRef, useState } from "react";
import { draftKey, readReportDraft, type ReportDraft } from "@/client/report-drafts";

export function useReportDraft<T extends Record<string, unknown>>(scope: string, context: string, values: T, enabled = true) {
  const key = draftKey(scope);
  const [pending, setPending] = useState<ReportDraft<T> | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [restored, setRestored] = useState(false);
  const dirty = useRef(false);
  const loaded = useRef<string | null>(null);
  const encoded = JSON.stringify(values);
  useEffect(() => {
    let active = true;
    dirty.current = false; loaded.current = null;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        if (!enabled) { localStorage.removeItem(key); setPending(null); }
        else setPending(readReportDraft<T>(localStorage, key));
      } catch { setUnavailable(true); }
      loaded.current = key;
    });
    return () => { active = false; };
  }, [key, enabled]);
  useEffect(() => {
    if (!enabled || loaded.current !== key || !dirty.current) return;
    try { localStorage.setItem(key, JSON.stringify({ context, values: JSON.parse(encoded) })); }
    catch { void Promise.resolve().then(() => setUnavailable(true)); }
  }, [key, context, encoded, enabled]);
  function clear() {
    dirty.current = false; setPending(null); setRestored(false);
    try { localStorage.removeItem(key); } catch { /* Keep in-page input. */ }
  }
  return {
    markChanged: () => { dirty.current = true; }, clear,
    notice: (apply: (value: T) => void) => <>
      {pending && <div className="notice" role="status"><p>{pending.context === context ? "Unsubmitted entries are saved on this device." : "The match changed since these entries were saved. Check the current result and time before using them."}</p><div className="actions"><button type="button" className="secondary" onClick={() => { apply(pending.values); dirty.current = true; setPending(null); setRestored(true); }}>Restore draft</button><button type="button" className="secondary" onClick={clear}>Discard draft</button></div></div>}
      {restored && <p className="notice" role="status">Draft restored. Review every field against the current match before submitting.</p>}
      {unavailable && <p className="form-note" role="status">Entries stay on this page, but this browser cannot save a draft for reopening.</p>}
    </>,
  };
}
