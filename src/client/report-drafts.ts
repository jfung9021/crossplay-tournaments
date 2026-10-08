const prefix = "crossplay.report-draft.";

export interface ReportDraft<T> { context: string; values: T }
export function draftKey(scope: string) { return `${prefix}${scope}`; }
export function readReportDraft<T>(storage: Pick<Storage, "getItem">, key: string): ReportDraft<T> | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value.context === "string" && value.values && typeof value.values === "object" ? value : null;
  } catch { return null; }
}

export function clearReportDrafts(tournamentId?: string, keepGeneration?: number) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(prefix + (tournamentId ? `${tournamentId}.` : ""))) continue;
      if (tournamentId && keepGeneration !== undefined && key.startsWith(`${prefix}${tournamentId}.${keepGeneration}.`)) continue;
      localStorage.removeItem(key);
    }
  } catch { /* Storage may be unavailable. */ }
}
