import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { Match, ScoreInput, TournamentSnapshot } from "../../src/domain/types";
import { assertStandings, calculateScore, calculateStandings, pairingEvidence, verifyFixture, type Fixture, type ReferenceMatch } from "./swiss-reference";
import { checkpointLocalDatabase, readDatabaseEvidence, restartLocalApp, restoreLocalDatabase } from "./local-environment";

export const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";
export const origin = new URL(baseURL).origin;
const pacedContexts = new WeakSet<BrowserContext>();
const deterministicRequests = new WeakMap<Page, { create?: string; roster?: string; generate?: string }>();
let pacingQueue = Promise.resolve();

/** Persist the rate budget because Playwright starts a fresh worker after a failure. */
async function pace(kind: "command" | "claim"): Promise<void> {
  const operation = pacingQueue.then(async () => {
    const directory = resolve(process.env.CROSSPLAY_EVIDENCE_DIR ?? ".local/evidence/swiss20/development");
    mkdirSync(directory, { recursive: true });
    const path = resolve(directory, ".pacing.json");
    const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Record<string, number> : {};
    const delay = Math.max(0, (previous[kind] ?? 0) + (kind === "claim" ? 4_200 : 370) - Date.now());
    if (delay) await new Promise<void>((done) => setTimeout(done, delay));
    previous[kind] = Date.now();
    writeFileSync(path, JSON.stringify(previous));
  });
  pacingQueue = operation.catch(() => undefined);
  await operation;
}

export const paceCommand = () => pace("command");
export const paceClaim = () => pace("claim");

export async function installPacing(context: BrowserContext): Promise<void> {
  if (pacedContexts.has(context)) return;
  pacedContexts.add(context);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") { await route.continue(); return; }
    const path = new URL(request.url()).pathname;
    if (path === "/api/join") await paceClaim();
    if (path.endsWith("/commands")) await paceCommand();
    const identities = deterministicRequests.get(request.frame().page());
    const data = request.postDataJSON() as Record<string, unknown>;
    let requestId: string | undefined;
    if (path === "/api/tournaments" && identities?.create) { requestId = identities.create; delete identities.create; }
    if (path.endsWith("/commands") && data.command === "add_entrants" && identities?.roster) { requestId = identities.roster; delete identities.roster; }
    if (path.endsWith("/commands") && data.command === "generate_round" && identities?.generate) { requestId = identities.generate; delete identities.generate; }
    await route.continue(requestId ? { postData: JSON.stringify({ ...data, requestId }) } : undefined);
  });
}

export function evidencePath(...parts: string[]): string {
  const path = resolve(process.env.CROSSPLAY_EVIDENCE_DIR ?? ".local/evidence/swiss20/development", ...parts);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

export function writeEvidence(name: string, value: unknown): void {
  writeFileSync(evidencePath(name), `${JSON.stringify(value, null, 2)}\n`);
}

export async function snapshot(request: APIRequestContext, id: string): Promise<TournamentSnapshot> {
  const response = await request.get(`${baseURL}/api/tournaments/${id}`);
  expect(response.status(), "Tournament snapshot is readable").toBe(200);
  return response.json() as Promise<TournamentSnapshot>;
}

export async function command(request: APIRequestContext, id: string, name: string, payload: Record<string, unknown> = {}) {
  const current = await snapshot(request, id);
  await paceCommand();
  return request.post(`${baseURL}/api/tournaments/${id}/commands`, {
    headers: { Origin: origin }, data: { command: name, payload, requestId: randomUUID(), expectedVersion: current.tournament.version },
  });
}

export async function login(page: Page, alternative?: { email: string; password: string }): Promise<void> {
  await installPacing(page.context());
  const auth = alternative ?? JSON.parse(readFileSync(process.env.CROSSPLAY_E2E_AUTH_FIXTURE ?? resolve(".local/auth-fixture.json"), "utf8")) as { email: string; password: string };
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(auth.email);
  await page.getByLabel("Password", { exact: true }).fill(auth.password);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export async function createSimpleTournament(page: Page, name: string, names: string, rounds: number, penaltyPoints = 2, interval = 10): Promise<string> {
  await installPacing(page.context());
  await page.goto("/admin/tournaments/new");
  await page.getByLabel("Tournament name", { exact: true }).fill(name);
  await page.getByLabel("Rounds", { exact: true }).fill(String(rounds));
  await page.getByLabel("Overtime deduction (points)").fill(String(penaltyPoints));
  await page.getByLabel("For every (seconds)").fill(String(interval));
  await page.getByRole("button", { name: "Create tournament", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/tournaments\/[^/]+\/players$/);
  const id = new URL(page.url()).pathname.split("/")[3]!;
  await page.getByLabel("Player names", { exact: true }).fill(names);
  await page.getByRole("button", { name: "Add players", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("players added");
  return id;
}

export async function publishNext(page: Page, id: string, number: number): Promise<TournamentSnapshot> {
  await page.goto(`/admin/tournaments/${id}`);
  await page.getByRole("button", { name: `Preview round ${number}`, exact: true }).click();
  await page.getByRole("button", { name: `Publish round ${number}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: /match(?:es)? to resolve/ })).toBeVisible();
  return snapshot(page.request, id);
}

export function matchCard(page: Page, current: TournamentSnapshot, match: Match, own = false): Locator {
  const first = current.entrants.find((entrant) => entrant.id === match.player1Id)!.name;
  const second = current.entrants.find((entrant) => entrant.id === match.player2Id)?.name;
  const root = own ? page.locator("section").filter({ has: page.getByRole("heading", { name: /^Your match/ }) }) : page;
  return root.getByRole("article", { name: second ? `${first} versus ${second}` : `${first}, bye`, exact: true });
}

export async function fillScore(card: Locator, raw1: number, raw2: number, overtime1 = 0, overtime2 = 0): Promise<void> {
  await card.getByLabel("Score", { exact: true }).nth(0).fill(String(raw1));
  await card.getByLabel("Score", { exact: true }).nth(1).fill(String(raw2));
  await card.getByLabel("Overtime (seconds)", { exact: true }).nth(0).fill(String(overtime1));
  await card.getByLabel("Overtime (seconds)", { exact: true }).nth(1).fill(String(overtime2));
}

export async function organizerScore(page: Page, current: TournamentSnapshot, match: Match, scores: [number, number, number?, number?], reason?: string): Promise<void> {
  const card = matchCard(page, current, match);
  await card.getByRole("button", { name: /^(Enter|Resolve|Correct) result$/ }).click();
  await fillScore(card, ...scores);
  if (reason) await card.getByLabel("Reason", { exact: true }).fill(reason);
  await card.getByRole("button", { name: "Save result", exact: true }).click();
  await expect(card.getByRole("button", { name: "Correct result", exact: true })).toBeVisible();
}

export async function issuePlayerInvite(admin: Page, id: string, entrantId: string): Promise<string> {
  const current = await snapshot(admin.request, id);
  const name = current.entrants.find((entrant) => entrant.id === entrantId)!.name;
  await admin.goto(`/admin/tournaments/${id}/players`);
  const row = admin.locator(".roster-row").filter({ has: admin.getByText(name, { exact: true }) });
  await row.getByRole("button", { name: "New player link", exact: true }).click();
  const input = row.getByLabel(`Private player link for ${name}`, { exact: true });
  await expect(input).toBeVisible();
  return input.inputValue();
}

export interface PlayerSession { context: BrowserContext; page: Page }
export async function claimPlayerInvite(browser: Browser, url: string): Promise<PlayerSession> {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  await installPacing(context);
  const page = await context.newPage();
  await page.goto(url);
  await expect(page).toHaveURL(`${baseURL}/join`);
  await page.getByRole("button", { name: "Join tournament", exact: true }).click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/);
  expect((await context.cookies()).some((cookie) => cookie.httpOnly), "Private player session is HttpOnly").toBe(true);
  return { context, page };
}

export async function playerSession(browser: Browser, admin: Page, id: string, entrantId: string): Promise<PlayerSession> {
  const player = await claimPlayerInvite(browser, await issuePlayerInvite(admin, id, entrantId));
  expect((await snapshot(player.page.request, id)).viewer.entrantId).toBe(entrantId);
  return player;
}

export async function assertStandingsUI(page: Page, expected: ReturnType<typeof calculateStandings>): Promise<void> {
  const rows = page.locator("#standings tbody tr");
  await expect(rows).toHaveCount(expected.length);
  for (let index = 0; index < expected.length; index++) {
    const standing = expected[index]!;
    const row = rows.nth(index);
    await expect(row.locator("td").nth(0)).toHaveText(String(standing.rank));
    await expect(row.getByRole("link")).toHaveText(standing.name);
    await expect(row.locator("td").nth(2)).toHaveText(String(standing.matchPoints));
    await expect(row.locator("td").nth(3)).toHaveText(standing.difference > 0 ? `+${standing.difference}` : String(standing.difference));
  }
}

function officialScore(input: ScoreInput, fixture: Fixture) {
  const result = calculateScore(input as ReferenceMatch, fixture.config);
  return { raw1: result.raw1, raw2: result.raw2, overtime1: result.overtime1, overtime2: result.overtime2, adjusted1: result.adjusted1, adjusted2: result.adjusted2, points1: result.points1, points2: result.points2, difference1: result.difference1 };
}

function pairIdentity(matches: { player1Id: string; player2Id: string | null }[]) {
  return matches.map((match) => [match.player1Id, match.player2Id]);
}

export interface FullEvent {
  id: string;
  current: TournamentSnapshot;
  players: Map<string, PlayerSession>;
  spectator: PlayerSession;
  ledger: ReferenceMatch[];
  requirements: Record<string, unknown>;
}

/** Every played result enters through a player form and its opponent's confirmation. */
export async function runFullEvent(page: Page, browser: Browser, fixture: Fixture, testInfo: TestInfo): Promise<FullEvent> {
  verifyFixture(fixture);
  writeEvidence(`${fixture.id}/frozen-fixture-profile.json`, fixture.profile);
  writeEvidence(`${fixture.id}/fixture-identity.json`, { id: fixture.id, sha256: createHash("sha256").update(JSON.stringify(fixture)).digest("hex"), seed: fixture.seed, createRequestId: fixture.createRequestId, rosterRequestId: fixture.rosterRequestId });
  await login(page);
  deterministicRequests.set(page, { create: fixture.createRequestId, roster: fixture.rosterRequestId });
  const id = await createSimpleTournament(page, fixture.title, `  ${fixture.players.map((player) => player.name).join(" \r\n\r\n")}  `, 6);
  let current = await snapshot(page.request, id);
  expect(current.tournament.seed).toBe(fixture.seed);
  expect(current.tournament.config).toEqual(fixture.config);
  expect([...current.entrants].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...fixture.players].sort((a, b) => a.id.localeCompare(b.id)));
  await page.getByLabel("Player names", { exact: true }).fill(` ${fixture.players[0]!.name.toUpperCase()} `);
  await expect(page.getByText(/Line 1: This name is already listed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add players", exact: true })).toBeDisabled();
  expect((await snapshot(page.request, id)).entrants).toHaveLength(20);
  await page.goto(`/admin/tournaments/${id}/settings`);
  await expect(page.getByLabel("Rounds", { exact: true })).toHaveValue("6");
  await page.reload();
  await expect(page.getByLabel("Rounds", { exact: true })).toHaveValue("6");
  const anonContext = await browser.newContext({ baseURL, viewport: { width: 1280, height: 1000 } });
  const spectator = { context: anonContext, page: await anonContext.newPage() };
  const draftResponse = await anonContext.request.get(`${baseURL}/api/tournaments/${id}`);
  expect([403, 404]).toContain(draftResponse.status());
  await spectator.page.goto(`/join?entrantId=${fixture.players[0]!.id}`);
  await expect(spectator.page.getByRole("button", { name: "Join tournament", exact: true })).toHaveCount(0);
  const players = new Map<string, PlayerSession>();
  const ledger: ReferenceMatch[] = [];
  const requirements: Record<string, unknown> = { "SETUP-20-6": "PASS", "BULK-NORMALIZATION-DUPLICATE": "PASS", "DRAFT-PRIVACY": "PASS", "ANONYMOUS-NAME-NO-AUTHORITY": "PASS" };

  for (const fixtureRound of fixture.rounds) {
    const number = fixtureRound.number;
    await testInfo.attach(`round-${number}-progress`, { body: `${fixture.id}: round ${number} of 6`, contentType: "text/plain" });
    await page.goto(`/admin/tournaments/${id}`);
    const before = await snapshot(page.request, id);
    assertStandings(before.standings, calculateStandings(fixture.players, ledger, fixture.config));
    const checkDeterminism = number === 1 && fixture.id.startsWith("mixed");
    const generationRequestId = randomUUID();
    if (checkDeterminism) {
      await checkpointLocalDatabase();
      deterministicRequests.set(page, { generate: generationRequestId });
    }
    await page.getByRole("button", { name: `Preview round ${number}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Publish round ${number}`, exact: true })).toBeVisible();
    current = await snapshot(page.request, id);
    let draft = current.rounds.find((round) => round.number === number)!;
    if (checkDeterminism) {
      const firstGeneration = { pairs: pairIdentity(draft.matches), engineVersion: draft.engineVersion, inputHash: draft.inputHash };
      await restoreLocalDatabase();
      await page.goto(`/admin/tournaments/${id}`);
      expect(await snapshot(page.request, id)).toEqual(before);
      deterministicRequests.set(page, { generate: generationRequestId });
      await page.getByRole("button", { name: "Preview round 1", exact: true }).click();
      await expect(page.getByRole("button", { name: "Publish round 1", exact: true })).toBeVisible();
      current = await snapshot(page.request, id);
      draft = current.rounds[0]!;
      const restoredGeneration = { pairs: pairIdentity(draft.matches), engineVersion: draft.engineVersion, inputHash: draft.inputHash };
      expect(restoredGeneration).toEqual(firstGeneration);
      writeEvidence(`${fixture.id}/determinism.json`, { generationRequestId, firstGeneration, restoredGeneration, exactDatabaseSnapshotRestored: true });
      requirements["DETERMINISM-RESTORED-DATABASE-SAME-REQUEST"] = "PASS";
    }
    expect(draft.status).toBe("draft");
    expect(draft.matches).toHaveLength(10);
    expect(pairIdentity(draft.matches), "Frozen oriented pairings and table order reproduce through the service").toEqual(pairIdentity(fixtureRound.matches));
    expect(draft.engineVersion).toBeTruthy();
    const input = { entrants: before.entrants, rounds: before.rounds.filter((round) => round.status !== "draft"), seed: before.tournament.seed, roundNumber: number };
    expect(draft.inputHash).toBe(createHash("sha256").update(JSON.stringify(input)).digest("hex"));
    const proof = pairingEvidence(fixture.players, fixture.rounds.slice(0, number - 1), draft.matches, fixture.config);
    const privateModel = await anonContext.request.get(`${baseURL}/api/tournaments/${id}`);
    if (number === 1) expect([403, 404]).toContain(privateModel.status());
    else expect((await privateModel.json() as TournamentSnapshot).rounds.some((round) => round.number === number)).toBe(false);
    writeEvidence(`${fixture.id}/rounds/round-${number}-pairing.json`, { prePairing: before, draft, proof });
    if (number === 1) await page.screenshot({ path: evidencePath(fixture.id, "screenshots", "draft-round-1.png"), fullPage: true });
    await page.getByRole("button", { name: `Publish round ${number}`, exact: true }).click();
    await expect(page.getByRole("heading", { name: /10 matches to resolve/ })).toBeVisible();
    current = await snapshot(page.request, id);
    expect(current.tournament.config.roundCount).toBe(6);
    const published = current.rounds.find((round) => round.number === number)!;
    expect(pairIdentity(published.matches)).toEqual(pairIdentity(draft.matches));
    if (number === 1) {
      await page.goto(`/admin/tournaments/${id}/settings`);
      await expect(page.getByLabel("Rounds", { exact: true })).toBeDisabled();
      await expect(page.getByLabel("Rounds", { exact: true })).toHaveValue("6");
      for (const entrant of fixture.players) players.set(entrant.id, await playerSession(browser, page, id, entrant.id));
      requirements["20-INDEPENDENT-PLAYER-SESSIONS"] = "PASS";
    }
    await spectator.page.goto(`/t/${current.tournament.slug}/rounds/${number}`);
    await expect(spectator.page.getByRole("article")).toHaveCount(10);
    await expect(spectator.page.getByRole("button", { name: "Report result", exact: true })).toHaveCount(0);
    for (const match of published.matches) for (const entrantId of [match.player1Id, match.player2Id!]) {
      const player = players.get(entrantId)!;
      await player.page.goto(`/t/${current.tournament.slug}`);
      await expect(player.page.getByRole("heading", { name: `Your match · Round ${number}`, exact: true })).toBeVisible();
      await expect(matchCard(player.page, current, match, true)).toBeVisible();
      expect((await snapshot(player.page.request, id)).viewer.entrantId).toBe(entrantId);
      expect(await player.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    if (number === 1) {
      await spectator.page.screenshot({ path: evidencePath(fixture.id, "screenshots", "published-round-1.png"), fullPage: true });
      await players.get(published.matches[0]!.player1Id)!.page.screenshot({ path: evidencePath(fixture.id, "screenshots", "mobile-own-match.png"), fullPage: true });
    }
    for (let index = 0; index < published.matches.length; index++) {
      const match = published.matches[index]!;
      const scores = fixtureRound.matches[index]!;
      const a = players.get(match.player1Id)!;
      const b = players.get(match.player2Id!)!;
      const expectedBefore = calculateStandings(fixture.players, ledger, fixture.config);
      const cardA = matchCard(a.page, current, match, true);
      await cardA.getByRole("button", { name: "Report result", exact: true }).click();
      const initial = number === 1 && index === 0 ? { ...scores, raw1: scores.raw1 === 450 ? 449 : scores.raw1 + 1 } : scores;
      await fillScore(cardA, initial.raw1, initial.raw2, initial.overtime1, initial.overtime2);
      const initialResult = calculateScore(initial, fixture.config);
      await expect(cardA.getByText("Final result:")).toContainText(`${initialResult.adjusted1}–${initialResult.adjusted2}`);
      if (number === 1 && index === 4) await a.page.screenshot({ path: evidencePath(fixture.id, "screenshots", "overtime-reversal-preview.png"), fullPage: true });
      await cardA.getByRole("button", { name: "Submit result", exact: true }).click();
      await expect(cardA.getByText("Waiting for your opponent to confirm.")).toBeVisible();
      let pending = await snapshot(page.request, id);
      assertStandings(pending.standings, expectedBefore);
      let pendingMatch = pending.rounds[number - 1]!.matches[index]!;
      expect(pendingMatch.result).toBeNull();
      expect(pendingMatch.status).toBe("awaiting_confirmation");
      const publicPending = await snapshot(anonContext.request, id);
      expect(publicPending.rounds[number - 1]!.matches[index]!.report).toBeNull();
      assertStandings(publicPending.standings, expectedBefore);
      if (number === 1 && index === 0) {
        const oldProposal = pendingMatch;
        await cardA.getByRole("button", { name: "Edit result", exact: true }).click();
        await fillScore(cardA, scores.raw1, scores.raw2, scores.overtime1, scores.overtime2);
        const editedPreview = calculateScore(scores, fixture.config);
        await expect(cardA.getByText("Final result:")).toContainText(`${editedPreview.adjusted1}–${editedPreview.adjusted2}`);
        await cardA.getByRole("button", { name: "Submit result", exact: true }).click();
        await expect(cardA.getByText("Waiting for your opponent to confirm.")).toBeVisible();
        const stale = await command(b.page.request, id, "confirm_report", { matchId: match.id, expectedRevision: oldProposal.revision, reportId: oldProposal.report!.id });
        expect(stale.status()).toBe(409);
        pending = await snapshot(page.request, id);
        pendingMatch = pending.rounds[0]!.matches[0]!;
        expect(pendingMatch.revision).toBeGreaterThan(oldProposal.revision);
        assertStandings(pending.standings, expectedBefore);
        await a.page.screenshot({ path: evidencePath(fixture.id, "screenshots", "pending-edited-report.png"), fullPage: true });
        requirements["EDIT-STALE-CONFIRMATION"] = "PASS";
        const counterfactual = calculateStandings(fixture.players, [...ledger, { ...scores, status: "final" }], fixture.config);
        expect(expectedBefore.every((row) => row.matchPoints === 0 && row.difference === 0)).toBe(true);
        expect(counterfactual.some((row) => row.matchPoints !== 0)).toBe(true);
        writeEvidence(`${fixture.id}/tiebreak-pending-witness.json`, { before: expectedBefore, actualPending: pending.standings, wouldIncorrectlyCount: counterfactual, match: { ...scores, status: "awaiting_confirmation" } });
        requirements["TB-07"] = "PASS: pending result would alter an exact tie but remains excluded";
      }
      await b.page.reload();
      const cardB = matchCard(b.page, current, match, true);
      const expectedResult = officialScore(scores, fixture);
      await expect(cardB.locator(".match-score").nth(0)).toHaveText(String(expectedResult.adjusted1));
      await expect(cardB.locator(".match-score").nth(1)).toHaveText(String(expectedResult.adjusted2));
      if (number === 1 && index === 1) {
        await cardB.getByRole("button", { name: "Report issue", exact: true }).click();
        await cardB.getByLabel("What needs to change?").fill("Please verify the overtime reading against our match notes.");
        await cardB.getByRole("button", { name: "Send to organizer", exact: true }).click();
        await expect(cardB.getByText("An organizer is reviewing this result.")).toBeVisible();
        const disputed = await snapshot(page.request, id);
        assertStandings(disputed.standings, expectedBefore);
        const blockedDispute = await command(page.request, id, "generate_round");
        expect([400, 409]).toContain(blockedDispute.status());
        await b.page.screenshot({ path: evidencePath(fixture.id, "screenshots", "disputed-report.png"), fullPage: true });
        await page.goto(`/admin/tournaments/${id}`);
        await organizerScore(page, disputed, disputed.rounds[0]!.matches[1]!, [scores.raw1, scores.raw2, scores.overtime1, scores.overtime2], "Both players checked the match notes and verified these scores and overtime.");
        requirements["DISPUTE-EXCLUDES-PENDING-POINTS"] = "PASS";
      } else {
        await cardB.getByRole("button", { name: "Confirm result", exact: true }).click();
        await expect(cardB.getByText("Final", { exact: true })).toBeVisible();
      }
      ledger.push({ ...scores, status: "final", roundNumber: number });
      current = await snapshot(page.request, id);
      const finalMatch = current.rounds[number - 1]!.matches[index]!;
      expect(finalMatch.status).toBe("final");
      expect(finalMatch.kind).toBe("played");
      expect(finalMatch.result).toEqual(expectedResult);
      expect(finalMatch.revision).toBeGreaterThan(pendingMatch.revision);
      assertStandings(current.standings, calculateStandings(fixture.players, ledger, fixture.config));
      if (number === 1 && index < 2) {
        await a.page.reload();
        await expect(matchCard(a.page, current, match, true).getByText("Final", { exact: true })).toBeVisible();
      }
      if (index === 8) {
        await page.goto(`/admin/tournaments/${id}`);
        await expect(page.getByRole("button", { name: `Preview round ${number + 1}`, exact: true })).toHaveCount(0);
        const beforeBlocked = await snapshot(page.request, id);
        const blocked = await command(page.request, id, "generate_round");
        expect([400, 409]).toContain(blocked.status());
        const afterBlocked = await snapshot(page.request, id);
        expect(afterBlocked).toEqual(beforeBlocked);
      }
    }
    const expected = calculateStandings(fixture.players, ledger, fixture.config);
    assertStandings(current.standings, expected);
    assertStandings(current.standings, fixtureRound.expectedStandings);
    expect(current.rounds[number - 1]!.matches.every((match) => match.status === "final")).toBe(true);
    // The current round remains published until the next publication or finish.
    expect(current.rounds[number - 1]!.status).toBe("published");
    await page.goto(`/admin/tournaments/${id}`);
    await assertStandingsUI(page, expected);
    await spectator.page.goto(`/t/${current.tournament.slug}`);
    await assertStandingsUI(spectator.page, expected);
    const publicModel = await snapshot(anonContext.request, id);
    assertStandings(publicModel.standings, expected);
    expect(publicModel.audit).toBeUndefined();
    expect(JSON.stringify(publicModel)).not.toMatch(/inviteHash|sessionHash|userId|disputeReason/);
    const database = await readDatabaseEvidence(id);
    expect(database.counts).toEqual({ entrants: 20, rounds: number, matches: number * 10, official: number * 10, duplicateAssignments: 0, duplicateOpponents: 0 });
    expect(database.frozenConfig).toEqual(fixture.config);
    const savedRound = database.rounds.find((round) => round.number === number)!;
    expect(savedRound.inputVersion).toBe(before.tournament.version + 1);
    expect(savedRound.inputHash).toBe(draft.inputHash);
    expect(savedRound.engineVersion).toBe(draft.engineVersion);
    expect(savedRound.inputSnapshot).toEqual({ ...before, standings: [] });
    for (const stored of database.officialResults) {
      const match = current.rounds.flatMap((round) => round.matches).find((item) => item.id === stored.matchId)!;
      const raw = fixture.rounds[stored.roundNumber - 1]!.matches.find((item) => item.player1Id === stored.player1Id && item.player2Id === stored.player2Id)!;
      expect(stored.result).toEqual(officialScore(raw, fixture));
      expect(stored.rules).toEqual({ ...fixture.config, roundingPolicy: "completed_intervals", rulesVersion: "crossplay-v1", winUnits: 2, drawUnits: 1, lossUnits: 0 });
      expect(stored.revision).toBe(match.revision);
      expect(stored.revisionId).toMatch(/^[0-9a-f-]{36}$/);
    }
    writeEvidence(`${fixture.id}/rounds/round-${number}-checkpoint.json`, { expected, organizer: current, public: publicModel, database });
    await spectator.page.screenshot({ path: evidencePath(fixture.id, "screenshots", `standings-round-${number}.png`), fullPage: true });
    requirements[`ROUND-${number}-PAIRING-SCORING-STANDINGS-PRIVACY`] = "PASS";
  }
  expect(current.rounds).toHaveLength(6);
  expect(current.rounds.flatMap((round) => round.matches)).toHaveLength(60);
  expect(current.standings.every((row) => row.wins + row.draws + row.losses === 6 && row.matchPoints === row.wins + row.draws / 2)).toBe(true);
  expect(current.standings.reduce((sum, row) => sum + row.matchPoints, 0)).toBe(60);
  expect(current.standings.reduce((sum, row) => sum + row.difference, 0)).toBe(0);
  requirements["20-PLAYERS-6-ROUNDS-60-PLAYED-MATCHES"] = "PASS";
  requirements["PENDING-REPORTS-NEVER-COUNT"] = "PASS";
  requirements["UNRESOLVED-NEXT-ROUND-REJECTED"] = "PASS";
  writeEvidence(`${fixture.id}/requirements.json`, requirements);
  return { id, current, players, spectator, ledger, requirements };
}

export async function finishFullEvent(page: Page, fixture: Fixture, event: FullEvent): Promise<void> {
  const { id, players, spectator } = event;
  await page.goto(`/admin/tournaments/${id}`);
  await page.getByRole("button", { name: "Finish tournament", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tournament complete", exact: true })).toBeVisible();
  let current = await snapshot(page.request, id);
  expect(current.tournament.status).toBe("finished");
  assertStandings(current.standings, fixture.expectedStandings);
  const finishedState = current;
  const extraRound = await command(page.request, id, "generate_round");
  expect([400, 409]).toContain(extraRound.status());
  const first = current.rounds[0]!.matches[0]!;
  const edit = await command(players.get(first.player1Id)!.page.request, id, "submit_report", { matchId: first.id, expectedRevision: first.revision, raw1: 400, raw2: 390, overtime1: 0, overtime2: 0 });
  expect([400, 403, 409]).toContain(edit.status());
  expect(await snapshot(page.request, id)).toEqual(finishedState);
  await restartLocalApp();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tournament complete", exact: true })).toBeVisible();
  await assertStandingsUI(page, fixture.expectedStandings);
  await spectator.page.reload();
  await assertStandingsUI(spectator.page, fixture.expectedStandings);
  const sample = players.get(fixture.players[0]!.id)!;
  await sample.page.reload();
  await assertStandingsUI(sample.page, fixture.expectedStandings);
  current = await snapshot(page.request, id);
  expect(current).toEqual(finishedState);
  const playerAfterRestart = await snapshot(sample.page.request, id);
  expect(playerAfterRestart.viewer.entrantId).toBe(fixture.players[0]!.id);
  await sample.page.goto(`/t/${current.tournament.slug}/players/${fixture.players[0]!.id}`);
  await expect(sample.page.getByRole("article")).toHaveCount(6);
  await sample.page.screenshot({ path: evidencePath(fixture.id, "screenshots", "six-match-player-history.png"), fullPage: true });
  await spectator.page.screenshot({ path: evidencePath(fixture.id, "screenshots", "final-standings.png"), fullPage: true });
  await page.getByRole("link", { name: "Copy settings", exact: true }).click();
  await page.getByLabel("Tournament name", { exact: true }).fill(`${fixture.title} autumn series`);
  await page.getByRole("button", { name: "Create tournament", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/tournaments\/[^/]+\/settings$/);
  const copyId = new URL(page.url()).pathname.split("/")[3]!;
  const copied = await snapshot(page.request, copyId);
  expect(copied.tournament.config).toEqual(fixture.config);
  expect(copied.tournament.status).toBe("draft");
  expect(copied.entrants).toEqual([]);
  expect(copied.rounds).toEqual([]);
  const copiedPublic = await spectator.context.request.get(`${baseURL}/api/tournaments/${copyId}`);
  expect([403, 404]).toContain(copiedPublic.status());
  await page.goto(`/admin/tournaments/${id}`);
  await page.getByRole("button", { name: "Archive tournament", exact: true }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  const archived = await snapshot(page.request, id);
  expect(archived.tournament.status).toBe("archived");
  expect(archived.rounds).toEqual(current.rounds);
  assertStandings(archived.standings, fixture.expectedStandings);
  const publicArchived = await snapshot(spectator.context.request, id);
  assertStandings(publicArchived.standings, fixture.expectedStandings);
  const database = await readDatabaseEvidence(id);
  writeEvidence(`${fixture.id}/final-state.json`, { finished: current, archived, copyId, copied, database });
  const rows = event.ledger.map((match) => ({ ...match, ...calculateScore(match, fixture.config), player1Name: fixture.players.find((player) => player.id === match.player1Id)!.name, player2Name: fixture.players.find((player) => player.id === match.player2Id)!.name }));
  writeEvidence(`${fixture.id}/matches.json`, rows);
  const csv = (cells: unknown[]) => cells.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",");
  const columns = ["roundNumber", "player1Id", "player1Name", "player2Id", "player2Name", "raw1", "raw2", "overtime1", "overtime2", "deduction1", "deduction2", "adjusted1", "adjusted2", "points1", "points2", "difference1"] as const;
  writeFileSync(evidencePath(fixture.id, "matches.csv"), `${csv([...columns])}\n${rows.map((row) => csv(columns.map((column) => row[column]))).join("\n")}\n`);
  const standingsColumns = ["entrantId", "name", "rank", "matchPoints", "difference", "wins", "draws", "losses", "played"] as const;
  writeFileSync(evidencePath(fixture.id, "standings.csv"), `${csv([...standingsColumns])}\n${current.standings.map((row) => csv(standingsColumns.map((column) => row[column]))).join("\n")}\n`);
  event.requirements["FINISH-BLOCKS-ROUND7-AND-EDITS"] = "PASS";
  event.requirements["SERVER-RESTART-THREE-AUDIENCES"] = "PASS";
  event.requirements["CLEAN-COPY-ARCHIVE-HISTORY"] = "PASS";
  writeEvidence(`${fixture.id}/requirements.json`, event.requirements);
  for (const player of players.values()) await player.context.close();
  await spectator.context.close();
}
