import "server-only";
import { ready, readTournament } from "@/server/db/client";
import type { TournamentSnapshot } from "@/domain/types";
import { buildDisplay, type DisplayMetadata } from "./model";

export const DISPLAY_VERSION = "20261008040000";

export async function readDisplay(id: string) {
  const sql = await ready();
  let available = false;
  try {
    const versions = await sql`select crossplay.display_version() as version`;
    available = versions[0]?.version === DISPLAY_VERSION;
  } catch (error) {
    if ((error as { code?: string }).code !== "42883") throw error;
  }
  if (!available) return buildDisplay(await readTournament({}, id), null, Date.now());
  const rows = await sql`select crossplay.display_read(${id}) as data`;
  const source = rows[0].data as { snapshot: TournamentSnapshot; matches: DisplayMetadata; serverNowMs: number };
  return buildDisplay(source.snapshot, source.matches, source.serverNowMs);
}
