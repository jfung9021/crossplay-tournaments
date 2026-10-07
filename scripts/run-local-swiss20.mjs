import { execFileSync, execSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, createWriteStream } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { assertLocalEnvironment, assertLoopback } from "../tests/support/local-environment.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sibling = resolve(root, "../bite-open-card-draw");
const clockMode = process.argv.includes("--clock");
const runId = `${Date.now().toString(16)}_${randomBytes(4).toString("hex")}`;
const database = `crossplay_acceptance_${runId}`;
const container = process.env.CROSSPLAY_TEST_CONTAINER ?? "crossplay-test-db";
const databasePort = process.env.CROSSPLAY_TEST_DATABASE_PORT ?? "55432";
const evidence = resolve(root, clockMode ? ".local/evidence/clock" : ".local/evidence/swiss20", runId);
mkdirSync(evidence, { recursive: true });
const json = (name, data) => { const path = resolve(evidence, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2) + "\n"); };
const sha = (value) => createHash("sha256").update(value).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
const sql = (name, input) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", name, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
const log = (message) => console.log(`[swiss20] ${message}`);
const startedAt = new Date().toISOString();
let app, control, fixtureAuth;
let stage = "preflight";
let checkpoint;
let archiveIndex = 0;
const controlHistory = [];
let env;
function safeError(error) {
  // Preserve diagnostics locally without leaking child-process environment or credentials.
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [env?.CROSSPLAY_DATABASE_URL, env?.CROSSPLAY_RATE_LIMIT_SECRET, env?.CROSSPLAY_TEST_CONTROL_TOKEN, fixtureAuth?.password, fixtureAuth?.unrelatedAuth?.password, fixtureAuth?.otherOrganizer?.password].filter(Boolean)) message = message.replaceAll(secret, "[redacted]");
  return message;
}

async function runNode(args, filename, options = {}) {
  return new Promise((resolveExit, reject) => {
    const output = createWriteStream(resolve(evidence, filename));
    const child = spawn(process.execPath, args, { cwd: options.cwd ?? root, env: env ?? process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (data) => { output.write(data); if (options.echo) process.stdout.write(data); });
    child.stderr.on("data", (data) => { output.write(data); if (options.echo) process.stderr.write(data); });
    child.once("error", reject);
    child.once("exit", (code) => { output.end(); resolveExit(code ?? 1); });
  });
}
async function stopApp() {
  if (!app || app.exitCode !== null) return;
  const current = app;
  await new Promise((done) => { current.once("exit", done); current.kill(); });
  app = undefined;
}
async function startApp() {
  const stream = createWriteStream(resolve(evidence, "app.log"), { flags: "a" });
  app = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3001"], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.pipe(stream, { end: false }); app.stderr.pipe(stream, { end: false });
  app.once("exit", () => stream.end());
  const until = Date.now() + 45_000;
  while (Date.now() < until) {
    if (app.exitCode !== null) throw new Error("The owned production server exited; see app.log.");
    try {
      const response = await fetch(`${env.PLAYWRIGHT_BASE_URL}/api/tournaments`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch { /* Readiness is bounded; no mutation is retried. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("Owned production server did not become ready.");
}

try {
  // Verify an isolated test container and its exact loopback binding before any writes.
  if (!/^crossplay-test-[a-z0-9-]+$/.test(container)) throw new Error("An isolated Crossplay test container is required.");
  if (!/^\d+$/.test(databasePort) || Number(databasePort) < 1024 || Number(databasePort) > 65535) throw new Error("Invalid local test database port.");
  const inspected = JSON.parse(docker("inspect", container))[0];
  const binding = inspected.NetworkSettings.Ports["5432/tcp"]?.[0];
  if (!inspected.Config.Image.startsWith("postgres:17") || binding?.HostIp !== "127.0.0.1" || binding?.HostPort !== databasePort) throw new Error("Unexpected dedicated Postgres image or binding.");
  await new Promise((done, reject) => { const probe = createNetServer(); probe.once("error", () => reject(new Error("Port 3001 is in use; refusing to attach to an existing app."))); probe.listen(3001, "127.0.0.1", () => probe.close(done)); });
  const priorAuth = JSON.parse(readFileSync(resolve(root, ".local/auth-fixture.json"), "utf8"));
  const authUrl = assertLoopback(priorAuth.url, "Local Auth").origin;
  const localStatus = JSON.parse(execSync("npx supabase status -o json", { cwd: sibling, encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }));
  if (assertLoopback(localStatus.API_URL, "CLI local Auth").origin !== authUrl || !localStatus.SERVICE_ROLE_KEY) throw new Error("Local Supabase Auth admin credentials do not match the verified local endpoint.");
  const serviceKey = localStatus.SERVICE_ROLE_KEY;
  const admin = createClient(authUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  env = { ...process.env, PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3001", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3001", NEXT_PUBLIC_SUPABASE_URL: authUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: priorAuth.key, CROSSPLAY_DATABASE_URL: `postgresql://crossplay_runtime:crossplay-runtime-local@127.0.0.1:${databasePort}/${database}`, CROSSPLAY_DATABASE_SSL: "false", CROSSPLAY_DATABASE_CA: "", CROSSPLAY_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"), CROSSPLAY_ACCEPTANCE_DATABASE: database, CROSSPLAY_TEST_CONTAINER: container, CROSSPLAY_EVIDENCE_DIR: evidence, CROSSPLAY_E2E_AUTH_FIXTURE: resolve(evidence, "private-auth.json"), CROSSPLAY_TEST_CONTROL_TOKEN: randomBytes(32).toString("hex"), NEXT_TELEMETRY_DISABLED: "1" };
  assertLocalEnvironment(env);
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new Error("Local publishable Auth key missing.");
  stage = "provision";
  docker("exec", container, "createdb", "-U", "postgres", database);
  const migration = resolve(sibling, "supabase/migrations/20260928010000_crossplay_schema.sql");
  for (const path of [resolve(sibling, "supabase/tests/crossplay_baseline.sql"), migration]) sql(database, readFileSync(path, "utf8"));
  const clockMigration = resolve(sibling, "supabase/migrations/20260930020000_crossplay_shared_clock.sql");
  if (clockMode) sql(database, readFileSync(clockMigration, "utf8"));
  const lifecycleMigration = resolve(sibling, "supabase/migrations/20261008010000_crossplay_lifecycle.sql");
  if (clockMode) sql(database, readFileSync(lifecycleMigration, "utf8"));
  const turnTimeMigration = resolve(sibling, "supabase/migrations/20261008020000_crossplay_turn_time.sql");
  if (clockMode) sql(database, readFileSync(turnTimeMigration, "utf8"));
  // Existing dedicated container's local-only role credential; no shared/hosted role is altered.
  sql(database, "alter role crossplay_runtime login password 'crossplay-runtime-local';");
  const account = async (label) => {
    const email = `swiss20-${runId.replaceAll("_", "-")}-${label}@example.test`;
    const password = randomBytes(24).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`Creating local ${label} account failed: ${error?.message}`);
    sql(database, `insert into auth.users(id) values ('${data.user.id}');`);
    return { id: data.user.id, email, password };
  };
  fixtureAuth = { ...await account("organizer"), unrelatedAuth: await account("unrelated"), otherOrganizer: await account("other-organizer"), url: authUrl, key: priorAuth.key };
  sql(database, `insert into crossplay.organizers(user_id) values ('${fixtureAuth.id}'),('${fixtureAuth.otherOrganizer.id}');`);
  json("private-auth.json", fixtureAuth);
  const version = sql(database, "select crossplay.schema_version();");
  if (version !== "20260928010000") throw new Error("Unexpected schema version.");
  const fixtureDir = resolve(root, "tests/fixtures/swiss20");
  const fixtureHashes = Object.fromEntries(readdirSync(fixtureDir).filter((name) => name.endsWith(".json")).map((name) => [name, sha(readFileSync(resolve(fixtureDir, name)))]));
  const sourceFiles = [...new Set(git("ls-files", "--cached", "--others", "--exclude-standard").split(/\r?\n/))].filter((name) => existsSync(resolve(root, name)));
  const sourceHashes = Object.fromEntries(sourceFiles.map((name) => [name, sha(readFileSync(resolve(root, name)))]));
  const manifest = { runId, startedAt, commit: git("rev-parse", "HEAD"), worktreeStatus: git("status", "--short"), sourceHashes, node: process.version, npm: process.env.npm_config_user_agent ?? null, schemaVersion: version, migrationSha256: sha(readFileSync(migration)), dependencyLockSha256: sha(readFileSync(resolve(root, "package-lock.json"))), fixtureHashes, targets: { browser: env.PLAYWRIGHT_BASE_URL, auth: authUrl, database, container }, retries: 0 };
  if (clockMode) {
    manifest.clockVersion = sql(database, "select crossplay.clock_version();");
    manifest.clockMigrationSha256 = sha(readFileSync(clockMigration));
    manifest.lifecycleVersion = sql(database, "select crossplay.lifecycle_version();");
    manifest.lifecycleMigrationSha256 = sha(readFileSync(lifecycleMigration));
    manifest.turnTimeMigrationSha256 = sha(readFileSync(turnTimeMigration));
  }
  json("manifest.json", manifest);
  log(`Isolated run ${runId}; evidence ${evidence}`);
  stage = "independent-checkers";
  const checkerCode = await runNode([resolve(root, "node_modules/vitest/vitest.mjs"), "run", "tests/domain/swiss-reference.test.ts", "tests/server/local-environment.test.ts", "--reporter=json", `--outputFile=${resolve(evidence, "checker-tests.json")}`], "checker-tests.log", { echo: true });
  if (checkerCode) throw new Error("Independent checker or local target guard failed; see checker-tests.json.");
  const buildStamp = resolve(root, ".local/swiss20-build.json");
  const buildIdentity = sha(JSON.stringify([authUrl, priorAuth.key, env.NEXT_PUBLIC_SITE_URL]));
  stage = "build";
  if (process.argv.includes("--reuse-build")) {
    if (!existsSync(buildStamp) || JSON.parse(readFileSync(buildStamp, "utf8")).identity !== buildIdentity || !existsSync(resolve(root, ".next/BUILD_ID"))) throw new Error("No matching local acceptance production build to reuse.");
    log("Reusing the same verified local production build for affected tests.");
  } else {
    log("Building the actual production app for local targets.");
    const code = await runNode([resolve(root, "node_modules/next/dist/bin/next"), "build"], "build.log", { echo: true });
    if (code) throw new Error("Production build failed; see build.log.");
    writeFileSync(buildStamp, JSON.stringify({ identity: buildIdentity, buildId: readFileSync(resolve(root, ".next/BUILD_ID"), "utf8") }));
  }
  stage = "browser";
  await startApp();
  let busy = false;
  control = createServer(async (request, response) => {
    if (request.method !== "POST" || request.headers.authorization !== `Bearer ${env.CROSSPLAY_TEST_CONTROL_TOKEN}`) { response.writeHead(403).end(); return; }
    if (busy || !["/restart", "/checkpoint", "/restore"].includes(request.url)) { response.writeHead(409).end(); return; }
    busy = true;
    try {
      assertLocalEnvironment(env);
      await stopApp();
      if (request.url === "/checkpoint") {
        if (checkpoint) throw new Error("Only one exact database checkpoint per run is supported.");
        checkpoint = `${database}_c`;
        docker("exec", container, "createdb", "-U", "postgres", "-T", database, checkpoint);
      }
      if (request.url === "/restore") {
        if (!checkpoint) throw new Error("No owned checkpoint exists.");
        const archived = `${database}_a${++archiveIndex}`;
        sql("postgres", `alter database ${database} rename to ${archived};`);
        docker("exec", container, "createdb", "-U", "postgres", "-T", checkpoint, database);
      }
      await startApp();
      controlHistory.push({ action: request.url.slice(1), at: new Date().toISOString(), database, checkpoint });
      json("process-checks.json", controlHistory);
      response.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    } catch (error) { json("control-failure.json", { error: safeError(error) }); response.writeHead(500).end(); }
    finally { busy = false; }
  });
  await new Promise((done) => control.listen(0, "127.0.0.1", done));
  env.CROSSPLAY_TEST_CONTROL_URL = `http://127.0.0.1:${control.address().port}`;
  const browser = await chromium.launch();
  manifest.browserVersion = browser.version(); await browser.close();
  json("manifest.json", manifest);
  const passthrough = process.argv.slice(2).filter((arg) => !["--reuse-build", "--clock"].includes(arg));
  const browserCode = await runNode([resolve(root, "node_modules/@playwright/test/cli.js"), "test", clockMode ? "--config=playwright.clock.config.ts" : "--config=playwright.swiss20.config.ts", ...passthrough], "browser.log", { echo: true });
  if (browserCode) throw new Error("Browser acceptance failed; original failure retained in results.json and browser.log.");
  if (!clockMode) {
  stage = "concurrency";
  log("Running the established real PostgreSQL transaction/concurrency checks.");
  const concurrency = await runNode([resolve(sibling, "supabase/tests/crossplay_concurrency_test.mjs")], "concurrency.log", { cwd: sibling, echo: true });
  if (concurrency) throw new Error("PostgreSQL concurrency checks failed; see concurrency.log.");
  stage = "evidence-summary";
  const summaryCode = await runNode([resolve(root, "scripts/summarize-swiss20.mjs"), evidence], "summary-writer.log", { echo: true });
  if (summaryCode) throw new Error("Evidence summary failed; see summary-writer.log.");
  const evidenceStatus = JSON.parse(readFileSync(resolve(evidence, "assertions.json"), "utf8")).status;
  if (!passthrough.length && evidenceStatus !== "PASS") throw new Error("Browser tests passed but required evidence is incomplete; see summary.md.");
  json("run-status.json", { status: "PASS", stage: "complete", evidenceStatus, selectedTestsOnly: Boolean(passthrough.length), finishedAt: new Date().toISOString() });
  } else {
    json("run-status.json", { status: "PASS", stage: "complete", selectedTestsOnly: Boolean(passthrough.length), physicalSafari: "PENDING: no physical iPhone or iPad attached", finishedAt: new Date().toISOString() });
  }
  log("Browser and real-database checks passed. Evidence is retained for the requirement summary.");
} catch (error) {
  json("run-status.json", { status: "FAIL", stage, finishedAt: new Date().toISOString(), error: safeError(error) });
  console.error(`[swiss20] ${safeError(error)}`);
  process.exitCode = 1;
} finally {
  if (control) await new Promise((done) => control.close(done));
  await stopApp();
  log(`Evidence retained: ${evidence}`);
}
