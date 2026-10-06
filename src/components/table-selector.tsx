"use client";

import { useCallback, useEffect, useId, useState } from "react";

export type TableSelection = number | "all";

export function tablePreferenceKey(tournamentId: string): string {
  return `crossplay.table.${tournamentId}`;
}

export function parseTablePreference(value: string | null): TableSelection {
  if (value === null || value === "all" || !/^[1-9]\d*$/.test(value)) return "all";
  const table = Number(value);
  return Number.isSafeInteger(table) ? table : "all";
}

export function useTableSelection(tournamentId: string): readonly [TableSelection, (value: TableSelection) => void] {
  const [stored, setStored] = useState<{ tournamentId: string; value: TableSelection }>({ tournamentId, value: "all" });
  useEffect(() => {
    let current = true;
    void Promise.resolve().then(() => {
      let value: TableSelection = "all";
      try { value = parseTablePreference(localStorage.getItem(tablePreferenceKey(tournamentId))); } catch { /* A table can still be selected without persistent storage. */ }
      if (current) setStored({ tournamentId, value });
    });
    return () => { current = false; };
  }, [tournamentId]);
  const select = useCallback((value: TableSelection) => {
    setStored({ tournamentId, value });
    try { localStorage.setItem(tablePreferenceKey(tournamentId), String(value)); } catch { /* Keep the current page selection. */ }
  }, [tournamentId]);
  return [stored.tournamentId === tournamentId ? stored.value : "all", select] as const;
}

export function TableSelector({ tables, value, onChange }: { tables: number[]; value: TableSelection; onChange: (value: TableSelection) => void }) {
  const id = useId();
  const options = [...new Set([...tables, ...(value === "all" ? [] : [value])])].filter(table => Number.isSafeInteger(table) && table > 0).sort((a, b) => a - b);
  return <div className="table-selector">
    <label htmlFor={id}>Table</label>
    <select id={id} value={value} onChange={event => onChange(parseTablePreference(event.target.value))}>
      <option value="all">All tables</option>
      {options.map(table => <option key={table} value={table}>Table {table}</option>)}
    </select>
  </div>;
}
