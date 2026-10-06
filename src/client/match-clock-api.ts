import type { ClockState } from "@/domain/clock-types";
import type { OfficialResult } from "@/domain/types";

export interface MatchClockSnapshot {
  tournamentId: string;
  matchId: string;
  tournamentName: string;
  roundNumber: number;
  tableNumber: number;
  matchStatus: string;
  matchRevision: number;
  players: [{ id: string; name: string; side: 1 }, { id: string; name: string; side: 2 }];
  rules: { timeLimitSeconds: number | null; penaltyIntervalSeconds: number; penaltyPoints: number; roundCount: number | null };
  state: ClockState | null;
  controllerId: string | null;
  start: null | { entrantId: string; side: 1 | 2; method: string; counts: { firsts1: number; seconds1: number; firsts2: number; seconds2: number }; played: boolean };
  report: null | { id: string; revision: number; raw1: number; raw2: number; overtime1: number; overtime2: number; adjusted1: number; adjusted2: number; acknowledgedSides: number[]; confirmationMethod: string; clockVersion: number | null; disputeReason: string | null };
  result: OfficialResult | null;
  officialConfirmationMethod: "shared_device" | "organizer" | "individual" | null;
  canControl: boolean;
  isOrganizer: boolean;
  serverNowMs: number;
}

export class ClockApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const requests = new Map<string, string>();

export function matchControllerId(matchId: string): string {
  const key = `crossplay.clock.controller.${matchId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID(); localStorage.setItem(key, id); return id;
}

export async function matchClockApi<T>(matchId: string, body?: Record<string, unknown>, mode: "clock" | "open" = "clock"): Promise<T> {
  const path = `/api/matches/${encodeURIComponent(matchId)}/${mode}`;
  const fingerprint = body ? `${path}:${JSON.stringify(body)}` : "";
  const requestId = body ? requests.get(fingerprint) ?? crypto.randomUUID() : undefined;
  if (requestId) requests.set(fingerprint, requestId);
  let response: Response;
  try {
    response = await fetch(path, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify({ ...body, requestId }) : undefined,
    });
  } catch { throw new ClockApiError("Waiting to save. Reconnect to continue reporting.", 0); }
  const result = await response.json().catch(() => ({}));
  if (response.status < 500) requests.delete(fingerprint);
  if (!response.ok) throw new ClockApiError(result.error ?? "This action could not be completed.", response.status);
  requests.delete(fingerprint);
  return result as T;
}

export function clockError(error: unknown): string {
  return error instanceof Error ? error.message : "This action could not be completed.";
}
