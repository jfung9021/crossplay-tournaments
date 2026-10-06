# Run the local Swiss acceptance suite

This implements `20-player-six-round-e2e-plan.md`. It runs the production application with real local Supabase Auth and a fresh isolated PostgreSQL database. No hosted tournament or shared Bite application table is used.

## Prerequisites

- Node 24, installed npm dependencies, and Playwright Chromium (`npx playwright install chromium`).
- The existing local Bite Supabase stack running, with `npx supabase status -o json` available in `../bite-open-card-draw`. The runner reads its local Auth credentials without printing them or passing the admin key to the application.
- The dedicated `crossplay-test-db` Docker container: PostgreSQL 17, bound only to `127.0.0.1:55432`. The runner verifies the image and binding before creating a database. It never resets the shared local Supabase stack.
- Ignored `.local/auth-fixture.json` containing the local Auth `url` and public `key`, matching that stack. Existing account credentials in this file are not reused; each run creates three new synthetic local accounts.
- Port 3001 free. The runner refuses to attach to an existing server.
- Canonical migration and database test files present in `../bite-open-card-draw/supabase`.

If Windows reserves port 55432, the clock runner can use another dedicated PostgreSQL 17 container without changing Windows port reservations or the existing database. Its name must start with `crossplay-test-`; the runner verifies the selected port is bound to `127.0.0.1` before writing. For example, the October 6 clock rehearsal used:

```powershell
$env:CROSSPLAY_TEST_CONTAINER = 'crossplay-test-clock-smoke'
$env:CROSSPLAY_TEST_DATABASE_PORT = '25432'
npm run test:e2e:clock -- --grep "20 players complete six rounds"
```

The selected container must already be running with `127.0.0.1:25432` mapped to PostgreSQL port 5432. This example runs the complete 60-match clock event through Finish tournament and the final results screen; it does not run every other smoke scenario. The default container/port remain `crossplay-test-db` and `55432`.

## Execute

```powershell
npm run test:e2e:swiss20
```

The runner verifies all targets, creates a unique `crossplay_acceptance_<runId>` database, applies the canonical migration and minimal prerequisites, provisions local accounts, records source/fixture/schema hashes, runs the independent checker tests, builds the production app, and starts its own server. Playwright runs one Chromium worker with no automatic retries. The established PostgreSQL concurrency checks run after browser success.

The two full events each have 20 players, six rounds and 60 official played matches. Every ordinary raw score is 300–450. Each event uses 20 separate player sessions; one disputed result per event is resolved through the organizer UI, and the other 59 results are confirmed by their opponents. All match reports originate in player forms. Supplementary scenarios exercise absences, administrative results, settings, corrections, permissions and impossible pairings. The artificial `1 / 0` score is confined to its labeled arithmetic-boundary scenario.

Invitation claims are spaced at least 4.2 seconds apart and ordinary commands at least 370 milliseconds apart across contexts. The test timeout is bounded at 15 minutes per scenario; most of that allowance accommodates browser work and rate-limit pacing. No production rate limit is disabled or bypassed.

## Evidence and failures

Artifacts are retained in `.local/evidence/swiss20/<runId>/`, including:

- `manifest.json`: exact targets, source hashes, fixture hashes, migration version, dependency lock and runtime versions.
- `checker-tests.json`, `results.json`, and `playwright-report/`: independent-checker/guard results and browser results.
- One directory per full event: all six pairing proofs and standings/database checkpoints, score profiles, 60-match ledger, final standings, requirement statuses and selected screenshots.
- `exceptions/`: explicit expected/rejected outcomes and retained-state evidence.
- `process-checks.json`: actual app restarts and the main event's exact database checkpoint/restore used for deterministic generation.
- `concurrency.log`: real overlapping PostgreSQL publication/report transactions, including lock observation.

The runner retains databases and checkpoints. It stops only its own application process. Private Auth credentials remain in ignored `private-auth.json`; do not share that file or the complete directory unexamined. Traces and videos are disabled. Selected screenshots are captured after invitation claims and omit private links.

Generate the requirement summary from actual completed artifacts:

```powershell
node scripts/summarize-swiss20.mjs .local/evidence/swiss20/<runId>
```

The summary distinguishes PASS from missing or failed evidence. A fixture calculation alone never proves the browser or database behaved correctly. All seven browser scenarios, their required artifacts, independent-checker evidence and concurrency evidence are required for a complete pass.

After a proven harness failure, preserve the original attempt, repair the affected check, and rerun only affected scenarios. For example:

```powershell
npm run test:e2e:swiss20 -- --reuse-build --grep "EX-03"
node scripts/summarize-swiss20.mjs .local/evidence/swiss20/<originalRunId> .local/evidence/swiss20/<affectedRunId>
```

`--reuse-build` requires an existing production build with the same local public configuration. Use it only while application source is unchanged. Each attempt still receives a fresh database and new local accounts. Summary aggregation preserves the attempt history and selects the latest executed result for each scenario; a partial rerun cannot independently claim complete acceptance.

## Frozen inputs and scope

Fixture preparation is explicit and separate from acceptance:

```powershell
npx tsx scripts/prepare-swiss20-fixtures.ts
```

Do not regenerate fixtures to conceal an application failure. Expected scores and standings come from `tests/support/swiss-reference.ts`, which imports no production calculation or pairing helpers. Its independent bitmask matcher checks the minimum score gap and repeated-float cost. Fixture discovery may use the production pairing engine; runtime acceptance still compares the frozen sequence and independent costs against real service output.

This suite checks the accepted Crossplay Swiss adaptation, not FIDE chess certification, arbitrary tournament sizes, or hosted deployment behavior. Stop when its explicit acceptance requirements pass; retain unrelated observations without expanding into product repairs.
