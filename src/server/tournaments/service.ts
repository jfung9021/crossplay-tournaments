import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { Actor, TournamentSnapshot } from "@/domain/types";
import { calculateStandings } from "@/domain/standings";
import { generatePairings, PairingError } from "@/domain/pairing";
import { parsePlayerNames, suggestRoundCount, validateRoundCount } from "@/domain/roster";
import { readTournament, execute } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { hashToken } from "@/server/auth/session";
import { commandPayloads, type Command } from "@/server/validation";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function stableUuid(value: string) {
  const hex = hash(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function tokenFor(value: string) {
  const secret = process.env.CROSSPLAY_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new AppError("Request protection is not configured yet.", 503);
  return createHmac("sha256", secret).update(value).digest("base64url");
}
export function createSlug(name: string, requestId: string) {
  const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "crossplay";
  return `${base}-${requestId.slice(0, 8)}`;
}
export async function snapshot(actor: Actor, id: string): Promise<TournamentSnapshot> {
  const data = await readTournament(actor, id);
  return { ...data, standings: calculateStandings(data.entrants, data.rounds) };
}

const matchCommands = new Set<Command>(["submit_report", "confirm_report", "dispute_report", "finalize_result"]);

export async function runCommand(actor: Actor, tournamentId: string, command: Command, rawPayload: Record<string, unknown>, requestId: string, expectedVersion?: number) {
  const parsed = commandPayloads[command].safeParse(rawPayload);
  if (!parsed.success) throw new AppError(parsed.error.issues.map((issue) => issue.message).join(" "));
  if (!matchCommands.has(command) && expectedVersion === undefined) throw new AppError("Refresh this tournament before making changes.", 409);
  const payload: Record<string, unknown> = { ...parsed.data, tournamentId, _requestHash: hash(JSON.stringify({ command, payload: parsed.data, expectedVersion })) };
  let inviteToken: string | undefined;

  if (["add_entrants", "generate_round", "issue_invite", "update_entrant"].includes(command)) {
    const data = await snapshot(actor, tournamentId);
    if (!data.viewer.isOrganizer) throw new AppError("Only this tournament's organizers can do that.", 403);
    if (command === "add_entrants") {
      const roster = parsePlayerNames(payload.names as string);
      if (roster.errors.length) throw new AppError("Check the player names.", 400, roster.errors);
      if (!roster.names.length) throw new AppError("Enter at least one player name.");
      payload.entrants = roster.names.map((name, index) => {
        const id = stableUuid(`${requestId}:${index}`);
        return { id, name, seed: parseInt(hash(`${data.tournament.seed}:${id}`).slice(0, 7), 16) };
      });
      delete payload.names;
    }
    if (command === "update_entrant") {
      const roster = parsePlayerNames(payload.name as string);
      if (roster.errors.length || roster.names.length !== 1) throw new AppError("Enter one valid player name.", 400, roster.errors);
      payload.name = roster.names[0];
    }
    if (command === "generate_round") {
      const published = data.rounds.filter((round) => round.status !== "draft");
      const activeCount = data.entrants.filter((entrant) => entrant.active).length;
      const rounds = data.tournament.config.roundCount ?? suggestRoundCount(activeCount);
      if (!published.length) {
        const issue = validateRoundCount(activeCount, rounds);
        if (issue) throw new AppError(issue);
      }
      if (published.length >= rounds) throw new AppError("All scheduled rounds have been played.");
      const input = { entrants: data.entrants, rounds: published, seed: data.tournament.seed, roundNumber: published.length + 1 };
      try {
        Object.assign(payload, generatePairings(input), { roundNumber: input.roundNumber, inputHash: hash(JSON.stringify(input)) });
      } catch (error) {
        if (error instanceof PairingError) throw new AppError(error.message, 409);
        throw error;
      }
    }
    if (command === "issue_invite") {
      inviteToken = tokenFor(`invite:${requestId}:${tournamentId}:${payload.entrantId}`);
      payload.inviteHash = hashToken(inviteToken);
    }
  }
  if (command === "copy_tournament") {
    payload.seed = stableUuid(`seed:${requestId}`);
    payload.slug ??= createSlug(payload.name as string, requestId);
  }
  const result = await execute(actor, command, payload, requestId, expectedVersion);
  if (inviteToken) return { ...result, inviteUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/join#${inviteToken}` };
  return result;
}
