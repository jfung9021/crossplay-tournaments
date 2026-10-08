"use client";
import { useEffect, useState } from "react";
import { readPreference, writePreference } from "./device-preferences";
export function tableDeviceId() {
  const key = "crossplay.device-id";
  const stored = localStorage.getItem(key);
  if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
  const id = crypto.randomUUID(); localStorage.setItem(key, id); return id;
}
export function useTableDevice() {
  const [device, setDevice] = useState<{ id: string | null; error: string | null }>({ id: null, error: null });
  useEffect(() => { void Promise.resolve().then(() => {
    try { setDevice({ id: tableDeviceId(), error: null }); }
    catch { setDevice({ id: null, error: "Allow browser storage to remember this device's table and save its clock." }); }
  }); }, []);
  return device;
}
export function rememberTableHome(tournamentId: string) {
  writePreference("last-table-home", `/t/${tournamentId}/table`);
  writePreference(`table-home.${tournamentId}`, "true");
}
export function rememberTableMatch(tournamentId: string, matchId: string) { writePreference(`table-match.${tournamentId}`, matchId); }
export function rememberedTableMatch(tournamentId: string) { return readPreference(`table-match.${tournamentId}`); }
