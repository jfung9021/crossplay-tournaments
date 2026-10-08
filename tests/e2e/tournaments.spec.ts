import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { Match, TournamentSnapshot } from "../../src/domain/types";
import { formatDuration } from "../../src/domain/duration";
import { openOrganizerActions } from "../support/swiss20-browser";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const origin = new URL(baseURL).origin;
const testRun = randomUUID().slice(0, 8);

function credentials(): { email: string; password: string } {
  const path = process.env.CROSSPLAY_E2E_AUTH_FIXTURE ?? resolve(".local/auth-fixture.json");
  const fixture = JSON.parse(readFileSync(path, "utf8")) as { email: string; password: string };
  if (!fixture.email || !fixture.password) throw new Error("The isolated Auth fixture is missing test credentials.");
  return fixture;
}

async function snapshot(request: APIRequestContext, id: string): Promise<TournamentSnapshot> {
  const response = await request.get(`${baseURL}/api/tournaments/${id}`);
  expect(response.status(), "Tournament snapshot is readable").toBe(200);
  return response.json() as Promise<TournamentSnapshot>;
}

async function command(request: APIRequestContext, id: string, name: string, payload: Record<string, unknown> = {}) {
  const current = await snapshot(request, id);
  return request.post(`${baseURL}/api/tournaments/${id}/commands`, {
    headers: { Origin: origin },
    data: { command: name, payload, requestId: randomUUID(), expectedVersion: current.tournament.version },
  });
}

async function login(page: Page): Promise<void> {
  const auth = credentials();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(auth.email);
  await page.getByLabel("Password", { exact: true }).fill(auth.password);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Your tournaments" })).toBeVisible();
}

async function createTournament(page: Page, name: string, names: string): Promise<string> {
  await page.goto("/admin/tournaments/new");
  await page.getByLabel("Tournament name", { exact: true }).fill(name);
  await expect(page.getByLabel("Overtime deduction (points)")).toHaveValue("2");
  await expect(page.getByLabel("For every (m:ss)")).toHaveValue("0:10");
  await expect(page.getByLabel("Timer", { exact: true })).toHaveValue("app");
  await expect(page.getByLabel("Time per player (m:ss)")).toHaveValue("20:00");
  await page.getByRole("button", { name: "Create tournament", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/tournaments\/[^/]+\/players$/);
  const id = new URL(page.url()).pathname.split("/")[3]!;
  await page.getByLabel("Player names", { exact: true }).fill(names);
  await page.getByRole("button", { name: "Add players", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("players added");
  return id;
}

async function publishNext(page: Page, id: string, number: number): Promise<TournamentSnapshot> {
  await page.goto(`/admin/tournaments/${id}`);
  await page.getByRole("button", { name: `Preview round ${number}`, exact: true }).click();
  await page.getByRole("button", { name: `Publish round ${number}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: /matches? to resolve/ })).toBeVisible();
  return snapshot(page.request, id);
}

function matchCard(page: Page, current: TournamentSnapshot, match: Match, own = false): Locator {
  const first = current.entrants.find((entrant) => entrant.id === match.player1Id)!.name;
  const second = current.entrants.find((entrant) => entrant.id === match.player2Id)?.name;
  const root = own ? page.locator("section").filter({ has: page.getByRole("heading", { name: /^Your match/ }) }) : page;
  return root.getByRole("article", { name: second ? `${first} versus ${second}` : `${first}, bye`, exact: true });
}

async function fillScore(card: Locator, raw1: number, raw2: number, overtime1 = 0, overtime2 = 0): Promise<void> {
  await card.getByLabel("Score", { exact: true }).nth(0).fill(String(raw1));
  await card.getByLabel("Score", { exact: true }).nth(1).fill(String(raw2));
  await card.getByLabel("Overtime (m:ss)", { exact: true }).nth(0).fill(formatDuration(overtime1));
  await card.getByLabel("Overtime (m:ss)", { exact: true }).nth(1).fill(formatDuration(overtime2));
}

async function organizerScore(page: Page, current: TournamentSnapshot, match: Match, scores: [number, number, number?, number?], reason?: string): Promise<void> {
  const card = matchCard(page, current, match);
  await openOrganizerActions(card);
  await card.getByRole("button", { name: /^(Enter|Report|Resolve|Correct) result$/ }).click();
  await fillScore(card, scores[0], scores[1], scores[2], scores[3]);
  if (reason) await card.locator("form.score-entry").getByLabel("Reason", { exact: true }).fill(reason);
  await card.getByRole("button", { name: "Save result", exact: true }).click();
  await openOrganizerActions(card);
  await expect(card.getByRole("button", { name: "Correct result", exact: true })).toBeVisible();
}

async function playerSession(browser: Browser, admin: Page, id: string, entrantId: string): Promise<{ context: BrowserContext; page: Page }> {
  const issued = await command(admin.request, id, "issue_invite", { entrantId });
  expect(issued.status(), "Organizer can issue an entrant invitation").toBe(200);
  const result = await issued.json() as { inviteUrl: string };
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(result.inviteUrl);
  await expect(page).toHaveURL(`${baseURL}/join`);
  await page.getByRole("button", { name: "Join tournament", exact: true }).click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /^Your match/ })).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.httpOnly), "Player receives an HttpOnly session").toBe(true);
  return { context, page };
}

test("organizer completes an even Swiss tournament, locks rules, and copies clean settings", async ({ page, browser }) => {
  await login(page);
  const id = await createTournament(page, `Even ${testRun}`, "  Alice \r\n\r\nBob\n太郎\nZoë");
  await page.getByLabel("Player names", { exact: true }).fill(" ALICE ");
  await expect(page.getByText(/Line 1: This name is already listed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add players", exact: true })).toBeDisabled();
  let current = await publishNext(page, id, 1);
  expect(current.entrants).toHaveLength(4);
  expect(current.tournament.config.roundCount).toBe(2);

  const anonymous = await browser.newContext({ baseURL });
  const anon = await anonymous.newPage();
  const firstMatch = current.rounds[0]!.matches[0]!;
  const denied = await anonymous.request.post(`${baseURL}/api/tournaments/${id}/commands`, {
    headers: { Origin: origin }, data: { command: "submit_report", payload: { matchId: firstMatch.id, expectedRevision: firstMatch.revision, raw1: 500, raw2: 0, overtime1: 0, overtime2: 0 }, requestId: randomUUID(), expectedVersion: current.tournament.version },
  });
  expect([401, 403]).toContain(denied.status());
  await anon.goto(`/t/${current.tournament.slug}`);
  await expect(anon.getByRole("button", { name: "Report result", exact: true })).toHaveCount(0);
  await expect(anon.getByRole("button", { name: "Enter result", exact: true })).toHaveCount(0);

  await page.goto(`/admin/tournaments/${id}/settings`);
  await expect(page.getByLabel("Rounds", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Overtime deduction (points)")).toBeDisabled();
  await page.goto(`/admin/tournaments/${id}`);
  await organizerScore(page, current, firstMatch, [401, 399, 20, 0]);
  await organizerScore(page, current, current.rounds[0]!.matches[1]!, [300, 300]);
  current = await snapshot(page.request, id);
  expect(current.rounds[0]!.matches[0]!.result).toMatchObject({ adjusted1: 397, adjusted2: 399, difference1: -2, points1: 0, points2: 2 });
  const originalPairs = current.rounds[0]!.matches.map((match) => [match.player1Id, match.player2Id].sort().join(":"));
  current = await publishNext(page, id, 2);
  for (const match of current.rounds[1]!.matches) {
    expect(originalPairs).not.toContain([match.player1Id, match.player2Id].sort().join(":"));
    await organizerScore(page, current, match, [210, 210]);
  }
  await page.getByRole("button", { name: "Finish tournament", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tournament complete", exact: true })).toBeVisible();
  current = await snapshot(page.request, id);
  expect(current.tournament.status).toBe("finished");
  expect(current.standings.reduce((sum, standing) => sum + standing.difference, 0)).toBe(0);

  await page.getByRole("link", { name: "Copy settings", exact: true }).click();
  await page.getByLabel("Tournament name", { exact: true }).fill(`Copy ${testRun}`);
  await page.getByRole("button", { name: "Create tournament", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/tournaments\/[^/]+\/settings$/);
  const copiedId = new URL(page.url()).pathname.split("/")[3]!;
  const copied = await snapshot(page.request, copiedId);
  expect(copied.entrants).toEqual([]);
  expect(copied.rounds).toEqual([]);
  expect(copied.tournament.config).toEqual(current.tournament.config);
  expect(copied.tournament.status).toBe("draft");
  const publicDraft = await anonymous.request.get(`${baseURL}/api/tournaments/${copiedId}`);
  expect([403, 404]).toContain(publicDraft.status());
  await anonymous.close();
});

test("players report and confirm; organizer resolves a dispute and finishes an odd tournament after withdrawal", async ({ page, browser }, testInfo) => {
  await login(page);
  const id = await createTournament(page, `Odd ${testRun}`, "Ada\nBen\nCleo\nDev\nEmi");
  let current = await publishNext(page, id, 1);
  expect(current.tournament.config.roundCount).toBe(3);
  const games = current.rounds[0]!.matches.filter((match) => match.player2Id);
  const bye = current.rounds[0]!.matches.find((match) => !match.player2Id)!;
  expect(bye.result).toMatchObject({ points1: 2, difference1: 0, raw1: null });
  const [first, second] = games as [Match, Match];
  const sessions = [first.player1Id, first.player2Id!, second.player1Id, second.player2Id!];
  const players: { context: BrowserContext; page: Page }[] = [];
  for (const entrantId of sessions) players.push(await playerSession(browser, page, id, entrantId));
  const [a, b, c, d] = players as [{ context: BrowserContext; page: Page }, { context: BrowserContext; page: Page }, { context: BrowserContext; page: Page }, { context: BrowserContext; page: Page }];
  let card = matchCard(a.page, current, first, true);
  await card.getByRole("button", { name: "Report result", exact: true }).click();
  await fillScore(card, 401, 399, 20);
  await expect(card.getByText("Final result:")).toContainText("397–399");
  await card.getByRole("button", { name: "Submit result", exact: true }).click();
  await expect(card.getByText("Waiting for your opponent to confirm.")).toBeVisible();
  let state = await snapshot(page.request, id);
  const oldProposal = state.rounds[0]!.matches.find((match) => match.id === first.id)!;
  expect(state.standings.find((standing) => standing.entrantId === first.player1Id)!.matchPoints).toBe(0);
  await card.getByRole("button", { name: "Edit result", exact: true }).click();
  await fillScore(card, 403, 399, 20);
  await card.getByRole("button", { name: "Submit result", exact: true }).click();
  await expect(card.getByRole("button", { name: "Edit result", exact: true })).toBeVisible();
  const stale = await command(b.page.request, id, "confirm_report", { matchId: first.id, expectedRevision: oldProposal.revision, reportId: oldProposal.report!.id });
  expect(stale.status()).toBe(409);
  await b.page.reload();
  card = matchCard(b.page, current, first, true);
  await card.getByRole("button", { name: "Confirm result", exact: true }).click();
  await expect(card.getByText("Final", { exact: true })).toBeVisible();
  state = await snapshot(page.request, id);
  expect(state.rounds[0]!.matches.find((match) => match.id === first.id)!.result).toMatchObject({ points1: 1, points2: 1, difference1: 0 });

  card = matchCard(c.page, current, second, true);
  await card.getByRole("button", { name: "Report result", exact: true }).click();
  await fillScore(card, 410, 400);
  await card.getByRole("button", { name: "Submit result", exact: true }).click();
  await expect(card.getByRole("button", { name: "Edit result", exact: true })).toBeVisible();
  await d.page.reload();
  card = matchCard(d.page, current, second, true);
  await card.getByRole("button", { name: "Report issue", exact: true }).click();
  await card.getByLabel("What needs to change?").fill("Overtime was omitted.");
  await card.getByRole("button", { name: "Send to organizer", exact: true }).click();
  await expect(card.getByText("An organizer is reviewing this result.")).toBeVisible();
  const blocked = await command(page.request, id, "generate_round");
  expect([400, 409]).toContain(blocked.status());
  await page.goto(`/admin/tournaments/${id}`);
  current = await snapshot(page.request, id);
  const disputed = current.rounds[0]!.matches.find((match) => match.id === second.id)!;
  await organizerScore(page, current, disputed, [405, 400, 20], "Both players verified the overtime.");
  await page.goto(`/admin/tournaments/${id}/players`);
  const withdrawnName = current.entrants.find((entrant) => entrant.id === bye.player1Id)!.name;
  await page.locator(".roster-row").filter({ has: page.getByText(withdrawnName, { exact: true }) }).getByRole("button", { name: "Remove from future rounds", exact: true }).click();
  await expect(page.locator(".roster-row").filter({ hasText: withdrawnName }).getByText("Withdrawn", { exact: true })).toBeVisible();
  current = await publishNext(page, id, 2);
  const publishedPairs = current.rounds[1]!.matches.map((match) => [match.player1Id, match.player2Id]);
  expect(publishedPairs.flat()).not.toContain(bye.player1Id);
  await page.getByRole("button", { name: "Round 1", exact: true }).click();
  const corrected = current.rounds[0]!.matches.find((match) => match.id === first.id)!;
  await organizerScore(page, current, corrected, [404, 399, 20], "Corrected the recorded score after round 2 publication.");
  state = await snapshot(page.request, id);
  expect(state.rounds[1]!.matches.map((match) => [match.player1Id, match.player2Id])).toEqual(publishedPairs);
  expect(state.audit?.some((event) => event.reason?.includes("after round 2 publication"))).toBe(true);
  await page.getByRole("button", { name: "Round 2", exact: true }).click();
  for (const match of current.rounds[1]!.matches) await organizerScore(page, current, match, [200, 200]);
  current = await publishNext(page, id, 3);
  for (const match of current.rounds[2]!.matches) await organizerScore(page, current, match, [250, 250]);
  await page.getByRole("button", { name: "Finish tournament", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tournament complete", exact: true })).toBeVisible();
  current = await snapshot(page.request, id);
  expect(current.tournament.status).toBe("finished");
  expect(current.rounds).toHaveLength(3);
  expect(current.entrants.find((entrant) => entrant.id === bye.player1Id)!.active).toBe(false);
  expect(current.standings.find((standing) => standing.entrantId === bye.player1Id)!.matchPoints).toBe(1);
  const anonymous = await browser.newContext({ baseURL, viewport: { width: 375, height: 812 } });
  const mobile = await anonymous.newPage();
  await mobile.goto(`/t/${current.tournament.slug}`);
  await expect(mobile.getByRole("heading", { name: "Final standings", exact: true })).toBeVisible();
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const publicModel = await snapshot(anonymous.request, id);
  expect(publicModel.audit).toBeUndefined();
  expect(publicModel.rounds.flatMap((round) => round.matches).every((match) => match.report === null)).toBe(true);
  expect(JSON.stringify(publicModel)).not.toMatch(/inviteHash|sessionHash|userId/);
  await mobile.screenshot({ path: testInfo.outputPath("public-mobile.png"), fullPage: true });
  await mobile.getByRole("link", { name: "Rules", exact: true }).click();
  await expect(mobile.getByText(/2 points deducted per completed 0:10 overtime/)).toBeVisible();
  await anonymous.close();
  for (const player of players) await player.context.close();
});
