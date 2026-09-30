import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import type { Match, TournamentSnapshot } from "../../src/domain/types";
import { command, fillScore, matchCard, snapshot } from "./swiss20-browser";

export const exceptionNames = [
  "Amelia Brooks", "Benjamin Reed", "Clara Ellis", "Daniel Park", "Elena Torres",
  "Felix Morgan", "Grace Chen", "Hugo Silva", "Isabel Hart", "Jonah Patel",
  "Keira Walsh", "Leo Nakamura", "Maya Bennett", "Noah Clarke", "Olivia Tan",
  "Priya Shah", "Quinn Rivers", "Rafael Costa", "Sofia Lane", "Theo Mitchell",
];

export function pairedIdentity(current: TournamentSnapshot) {
  return current.rounds.filter(round => round.status !== "draft").map(round => ({
    id: round.id, number: round.number, inputHash: round.inputHash,
    matches: round.matches.map(match => ({ id: match.id, tableNumber: match.tableNumber, player1Id: match.player1Id, player2Id: match.player2Id })),
  }));
}

export async function assertRejectedUnchanged(admin: Page, request: BrowserContext["request"], id: string, name: string,
  payload: Record<string, unknown>, statuses: number[], message?: RegExp) {
  const before = await snapshot(admin.request, id);
  const response = await command(request, id, name, payload);
  expect(statuses, `${name} is rejected`).toContain(response.status());
  const body = await response.json() as { error?: string };
  if (message) expect(body.error).toMatch(message);
  const after = await snapshot(admin.request, id);
  expect(after.tournament.version, "Rejected request does not mutate the tournament").toBe(before.tournament.version);
  expect(after.rounds).toEqual(before.rounds);
  expect(after.standings).toEqual(before.standings);
  return { command: name, status: response.status(), error: body.error };
}

export async function withdraw(page: Page, id: string, entrantId: string) {
  const current = await snapshot(page.request, id);
  const name = current.entrants.find(entrant => entrant.id === entrantId)!.name;
  await page.goto(`/admin/tournaments/${id}/players`);
  const row = page.locator(".roster-row").filter({ hasText: name });
  await row.getByRole("button", { name: "Withdraw", exact: true }).click();
  await expect(row.getByText("Withdrawn", { exact: true })).toBeVisible();
}

export async function administrativeResult(page: Page, current: TournamentSnapshot, match: Match,
  kind: "forfeit" | "double_forfeit", reason: string) {
  const card = matchCard(page, current, match);
  await card.getByRole("button", { name: "Enter result", exact: true }).click();
  await card.getByLabel("Result type", { exact: true }).selectOption(kind);
  if (kind === "forfeit") await card.getByLabel("Winner", { exact: true }).selectOption(match.player1Id);
  await card.getByLabel("Reason", { exact: true }).fill(reason);
  await card.getByRole("button", { name: "Save result", exact: true }).click();
  await expect(card.getByRole("button", { name: "Correct result", exact: true })).toBeVisible();
}

export async function scoreWithPreview(page: Page, current: TournamentSnapshot, match: Match,
  raw1: number, raw2: number, overtime1: number, expected1: number, expected2: number, reason?: string) {
  const card = matchCard(page, current, match);
  await card.getByRole("button", { name: /^(Enter|Correct) result$/ }).click();
  await fillScore(card, raw1, raw2, overtime1, 0);
  if (reason) await card.getByLabel("Reason", { exact: true }).fill(reason);
  await expect(card.getByText("Final result:")).toContainText(`${expected1}–${expected2}`);
  await card.getByRole("button", { name: "Save result", exact: true }).click();
  await expect(card.getByRole("button", { name: "Correct result", exact: true })).toBeVisible();
  const saved = (await snapshot(page.request, current.tournament.id)).rounds
    .flatMap(round => round.matches).find(item => item.id === match.id)!;
  expect(saved.result).toMatchObject({ raw1, raw2, overtime1, overtime2: 0,
    adjusted1: expected1, adjusted2: expected2, difference1: expected1 - expected2,
    points1: expected1 > expected2 ? 2 : expected1 === expected2 ? 1 : 0,
    points2: expected1 < expected2 ? 2 : expected1 === expected2 ? 1 : 0 });
  return saved;
}

export async function issueInvitation(page: Page, id: string, entrantId: string) {
  const current = await snapshot(page.request, id);
  const name = current.entrants.find(entrant => entrant.id === entrantId)!.name;
  await page.goto(`/admin/tournaments/${id}/players`);
  const row = page.locator(".roster-row").filter({ has: page.getByText(name, { exact: true }) });
  await row.getByRole("button", { name: "New player link", exact: true }).click();
  const input = row.getByLabel(`Private player link for ${name}`, { exact: true });
  await expect(input).toBeVisible();
  return input.inputValue();
}

export async function loginAuxiliary(page: Page, role: "unrelatedAuth" | "otherOrganizer") {
  const fixturePath = process.env.CROSSPLAY_E2E_AUTH_FIXTURE ?? resolve(".local/auth-fixture.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, { email: string; password: string }>;
  const identity = fixture[role];
  if (!identity?.email || !identity.password) throw new Error(`Local fixture is missing ${role} credentials.`);
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
  // Auxiliary identity authentication is setup for negative HTTP authorization checks.
  const response = await page.request.post(`${baseURL}/api/auth`, {
    headers: { Origin: new URL(baseURL).origin }, data: { email: identity.email, password: identity.password },
  });
  const allowed = role === "otherOrganizer";
  expect(response.status(), `Local ${role} sign-in respects organizer membership`).toBe(allowed ? 200 : 403);
  if (!allowed) expect(await response.json()).toMatchObject({ error: "This account has not been given organizer access." });
  const state = await page.request.get(`${baseURL}/api/auth`);
  expect(await state.json()).toMatchObject({ authenticated: allowed, isOrganizer: allowed });
  return { loginStatus: response.status(), authenticated: allowed, isOrganizer: allowed };
}

export async function saveExceptionEvidence(testInfo: TestInfo, name: string, data: Record<string, unknown>) {
  const path = process.env.CROSSPLAY_EVIDENCE_DIR
    ? resolve(process.env.CROSSPLAY_EVIDENCE_DIR, "exceptions", `${name}.json`)
    : testInfo.outputPath(`exceptions-${name}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, scenario: name, ...data }, null, 2));
  await testInfo.attach(`exceptions-${name}`, { path, contentType: "application/json" });
}
