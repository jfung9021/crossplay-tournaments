export function readPreference(key: string): string | null {
  try { return localStorage.getItem(`crossplay.preference.${key}`); } catch { return null; }
}
export function writePreference(key: string, value: string) {
  try { localStorage.setItem(`crossplay.preference.${key}`, value); } catch { /* In-page preference still works. */ }
}
export function localDestination(value: string | null): string | null {
  if (!value || !/^\/(?:t\/|admin(?:\/|$))/.test(value) || /[\\\r\n]/.test(value)) return null;
  try {
    const url = new URL(value, "https://crossplay.invalid");
    return url.origin === "https://crossplay.invalid" ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch { return null; }
}
