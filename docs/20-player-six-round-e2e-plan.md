# Local acceptance plan: 20 players, six Swiss rounds

Date: 2026-09-28

Status: Implemented and verified locally on 2026-09-28. All 53 acceptance groups passed across the initial execution and targeted harness-repair reruns. See [results and evidence](swiss20-validation-results.md) and [reproduction instructions](local-swiss20-testing.md). The sections below preserve the accepted plan; earlier verification remains separately recorded in `release-status.md`.

## 1. Outcome and definition of success

Run the actual production build locally against isolated PostgreSQL and real local Supabase Auth. Operate the organizer and player interfaces in Playwright, complete six rounds, and produce a reviewable record showing that the saved results, displayed standings, pairing decisions, and permissions satisfy the accepted rules.

The main event retains all 20 players for all six rounds:

- Exactly 10 matches per round, 60 distinct opponent pairings overall.
- Every player appears once each round and finishes with six results against six distinct opponents.
- No byes, withdrawals, forfeits, or double forfeits in this main event.
- Every match receives an actual score report and an opponent confirmation through separate browser sessions, except explicitly documented dispute resolutions.
- Each checkpoint agrees with an independently calculated expected result and standings table.
- Six completed rounds remain six after finishing; round seven cannot be generated.

Use separate short scenarios for administrative exceptions. A 20-player event with no withdrawals cannot establish correct bye handling, and adding a withdrawal to the main event would change its 60-played-match acceptance condition.

This verifies the application's accepted Crossplay Swiss adaptation. General Swiss foundations include announced rounds, avoiding repeat opponents, pairing by similar tournament scores, and consistent handling of absences. It does not claim certified FIDE Dutch pairings or chess color/rating rules. Crossplay's fixed score-differential tiebreaker, overtime rule, and strict treatment of previously paired forfeits are application policies. Sources: [FIDE Swiss rules](https://doc.fide.com/docs/DOC/2025_3FC/CM3-202517.pdf) and [general handling rules](https://handbook.fide.com/chapter/GeneralHandlingRulesForSwissTournaments202602).

## 2. Existing coverage and the gap to close

Repository evidence inspected for this plan:

| Existing material | What it establishes | What the new run adds |
| --- | --- | --- |
| `tests/e2e/tournaments.spec.ts` | Four-player even event and five-player event with withdrawal; reporting, confirmation, dispute, correction, copy, and basic access checks. | Full 20-player/six-round browser workflow, all 60 match calculations, all 20 final rows. |
| `tests/domain/scoring.test.ts` | Overtime boundaries and calculated outcomes. | Preview, server result, stored revision, and public presentation agree for the same inputs. |
| `tests/domain/standings.test.ts` | Match-point priority, differential, shared ranks, official-only results, administrative outcomes. | Deliberate tiebreak witnesses visible in full persisted tournaments. |
| `tests/domain/pairing.test.ts` | Solver legality and small reference comparisons. | Independent legality and score-group/float-priority checks for all six real pairing inputs. |
| Canonical `crossplay_schema_test.sql` and `crossplay_concurrency_test.mjs` | Database constraints, authorization, idempotency, and overlapping transaction checks. | Capture relevant outcomes as evidence linked to the local event; reuse established checks instead of repeating unrelated suites. |
| `playwright.config.ts` | One Chromium worker, zero automatic retries, externally started server, traces/videos off. | Dedicated configuration, longer bounded timeout, structured reports, and selected sanitized screenshots. |

The recorded smaller-event passes are useful prior evidence, but are not evidence that this proposed 20-player run has passed. Inspecting existing code during this planning task is not another test execution.

## 3. Local environment and reproducibility

Create a dedicated runner that performs these checks before any mutation:

1. Browser origin and `NEXT_PUBLIC_SITE_URL` are exactly the same loopback origin, preferably `http://127.0.0.1:3000`.
2. Database host is loopback and the database name belongs to this explicitly created test run, for example `crossplay_acceptance_<runId>`. Refuse hosted URLs and the shared Bite database.
3. Supabase Auth URL is a verified local endpoint. Use newly created local test accounts, never the production organizer account.
4. Provision only the canonical Crossplay migration and its minimal local prerequisites in the disposable database. The application connects as `crossplay_runtime`; the setup/evidence reader has separate local-only credentials.
5. The server under test reports the expected schema version and is the intended local build. Do not attach to an arbitrary existing process on port 3000.

The current general E2E configuration permits a `PLAYWRIGHT_BASE_URL` override. The new runner must add the explicit local-only guard; it must not assume a default URL guarantees isolation. This is a planned test-harness change, not a production behavior change.

Record commit SHA, whether the worktree is clean, Node/npm/browser versions, schema version and migration SHA-256, dependency-lock SHA-256, fixture version/hash, tournament seed, and redacted target identities. Use a fresh database/run directory for each full attempt. Never reset the shared local Supabase stack or any hosted database.

Start the application with `npm run build` and `npm run start`, not a development server. Give the main scenario a bounded timeout such as 15 minutes; retain short individual UI assertion timeouts. Keep one test worker and zero automatic retries so retries cannot conceal intermittent failures.

Use 20 independent browser contexts for players, one organizer context, and one anonymous spectator context. Each player must claim the correct private invitation. Keep each player's session across their six matches; do not use the organizer's cookies for player actions.

Create/authenticate the organizer in local Supabase, mirror that local identity into the isolated database's Auth prerequisite and organizer table, and leave credentials in ignored `.local` files. Do not mock successful application commands or inject official results directly into the database.

## 4. Fixtures and independent expected results

Prepare two deterministic 20-player/six-round fixtures:

| Fixture | Purpose |
| --- | --- |
| `mixed-results-20x6-v1` | The main realistic event: wins, losses, draws, unequal score groups, overtime, proposal edits, one dispute, all 60 matches finalized. |
| `tiebreak-witnesses-20x6-v1` | A controlled companion event whose final data deliberately distinguishes correct differential ranking from plausible wrong implementations. |

Use synthetic named players with stable fixture IDs. Tournament creation and bulk entry still go through the UI. For reproducibility, the harness may intercept only those local outbound requests to replace `requestId` with recorded deterministic UUIDs; it must still send the real request and use its real response. The existing server derives tournament seed and entrant IDs/seeds from those request IDs. Do not introduce a seed override into production APIs just for the test.

Record participant orientation explicitly: a fixture score belongs to a player ID, not implicitly to whichever side the app happened to display. Raw scores, overtime, and expected results are saved before the acceptance run. Pairing changes must produce a clear fixture mismatch rather than silently assigning scores to different opponents.

Fixture preparation is a separate, bounded step. It may use the installed pairing engine to discover a reproducible legal sequence, but the expected score/standings arithmetic and legality/quality checks must come from the independent checker. Freeze the resulting 60-match ledgers and their checksums before the acceptance run. Do not regenerate expected standings from the app during the run. If the fixture does not actually contain the required tiebreak witnesses, fixture preparation fails; the corresponding assertion must not skip.

### Realistic dummy data

The user identifies **300–450 points per player as a typical Crossplay game score**. Use that inclusive range for every raw score in both full 20-player/six-round fixtures: 120 player scores per event. This is a fixture requirement, not a new application validation limit. Adjusted scores may fall below 300 after a valid overtime deduction.

- Use varied integer scores, with most in an illustrative middle band of 340–410 and some near 300 and 450. Avoid uniform spacing, repeated placeholder scores, or giving every player the same score in each round. The middle band is a test-design assumption, not a measured Crossplay distribution.
- Include narrow, moderate, and occasional large winning margins, natural equal-score draws, and selected overtime-induced draws or reversals. Arrange the required tiebreak witnesses within the realistic score range rather than manufacturing extreme raw scores to force a ranking.
- Make zero overtime the majority case. Use a minority of short overruns, including the required 9/10/11/19/20-second boundaries and one match where both players exceed time. This mix is a fixture assumption; no observed overtime frequency has been supplied.
- Use 20 distinct fictional display names, a plausible event title, and concise human-readable dispute/correction reasons. Any test-only email accounts use synthetic local identities. Stable fixture IDs remain separate from player-facing names.
- Keep deliberately unrealistic inputs, negative-adjusted-score examples, and invalid submissions in clearly labeled supplementary boundary scenarios. They must not appear as ordinary matches in the realistic 60-match ledgers.

Before freezing either fixture, validate all 120 raw scores against 300–450 and confirm the required variation and tiebreak witnesses are present. Save a fixture profile with score minimum/maximum, score-band counts, match-margin distribution, overtime counts/range, and draw/reversal counts. This profile provides evidence that realistic data was actually used; it does not claim statistical realism beyond the user's supplied range and the stated assumptions.

### Independent calculator

Implement a small reference calculator under test support that imports no production scoring, standings, pairing-graph, or database calculation helper. Shared TypeScript data types are acceptable. Its source inputs are the frozen raw-score/overtime ledger and the independently tracked official-result decisions.

For each played match:

```text
deduction_A = (overtime_A div interval_seconds) * penalty_points
adjusted_A = raw_A - deduction_A
adjusted_B = raw_B - deduction_B
units_A = 2 if adjusted_A > adjusted_B, 1 if equal, otherwise 0
units_B = 2 - units_A
difference_A = adjusted_A - adjusted_B
difference_B = -difference_A
```

Accumulate integer half-point units and integer differences. Convert units to displayed points only at the output boundary. Rank by descending units, then descending cumulative difference. Equal values receive the same competition rank, for example `1, 2, 2, 4`. Initial seed may determine row order within a tied rank but may not award different ranks.

Use two independent forms of evidence: a machine-readable reference calculation for all rows and hand-checked examples for the material boundary/witness cases. Reading the app's `result.points1` or `standings` field is a comparison input, never the reference answer.

## 5. Main event execution

### Setup

- Sign in through `/login` and create the tournament through `/admin/tournaments/new`.
- Set **Rounds = 6 explicitly**. Twenty players would otherwise suggest five; assert six remains stored and displayed after refresh and first publication.
- Keep deduction at two points per completed ten seconds.
- Paste all 20 names into the one multiline field. Include harmless whitespace/blank-line normalization. Attempt a duplicate as a rejected separate submission, then verify the valid roster remains exactly 20.
- Issue and claim all 20 invitations. Confirm player identity matches the assigned record and an anonymous name selection cannot grant access.
- Before round one is published, verify anonymous users cannot read the draft or private pairings.

### Repeat for rounds 1–6

1. Save the prior round's final ledger and expected pre-pairing standings.
2. Organizer previews the next round in the UI. Capture private draft assignments and run the independent pairing checks in Section 6.
3. Before publication, verify the draft is still hidden from spectators. Publish it once through the organizer UI.
4. Verify all 20 player contexts show their own assigned opponent, and the public round page shows exactly ten matches. Snapshot the published pairings and preserve their hash.
5. For each match, the assigned reporter enters both raw scores and overtime values through the form. Assert the preview against the reference calculator. Submit.
6. Assert that the pending report contributes no match points or differential for either player. Other already-final matches still count normally.
7. Opponent reviews that exact report and confirms through their own UI. Assert the final result, stored official revision, updated standings, and opponent-facing result.
8. At an intentional checkpoint with one unresolved match, attempt to generate the next round: it must be blocked. Do not count a disabled UI button alone as server enforcement; submit one equivalent authorized API request and verify rejection and unchanged database state.
9. Once all ten matches are final, compare all 20 rows against the independent calculator in the organizer UI, public UI/API, and a read-only database evidence query. Save the complete checkpoint.

All normal state changes use browser controls. Direct HTTP calls are reserved for negative, replay, or concurrency cases that a browser control cannot reliably express; identify them in the report. Database access after setup is evidence-only.

### Finish and persistence

- After round six, finish via the organizer interface; verify exactly six completed rounds and 60 official matches.
- Assert every player's wins + draws + losses equals six, and match points equal wins + half of draws.
- In this all-played event, total displayed match points across the field must equal 60; cumulative differential across all players must equal zero.
- Request round seven and ordinary post-finish score edits; verify rejection with no extra round or changed result.
- Capture final standings for all 20 players and a full player-history sample. Reload all three audiences, restart the local app process without resetting the database, and verify the same final state survives.
- Copy settings into a new draft: round count and penalty rules copied; roster, results, credentials, and rounds empty. Archive the finished source and verify retained history under its intended access rules.

## 6. Proving Swiss pairing behavior

For each of the six rounds, derive the legal opponent graph independently from the prior official results and roster:

- Exactly 20 active players and ten non-self pairs.
- Every player occurs exactly once.
- No pair has appeared in any earlier published round.
- No byes with an even active field.
- Pairing input uses only finalized prior results; never a proposal or future result.
- The stored pairing seed, engine version, input snapshot/hash, and results version are present and correspond to that generation.

For score-group quality, use an independent bitmask dynamic-programming reference matcher at this 20-player size. Recursively pair the lowest remaining player with each legal remaining opponent and memoize the remaining-player mask. At most `2^20` masks exist; do not enumerate every complete matching naively.

Compare the application's matching to the independent minimum **total match-point gap**, using half-point units. A same-score-only perfect matching, when one exists, has gap zero and must be chosen. When zero is impossible, preserve the reference minimum and show why floats were necessary. Do not assert that every cross-group pairing is an error.

Then compare the documented secondary float cost among minimum-gap matchings. Independently reconstruct prior up/down floats and apply the current contract: each side contributes `2 * min(previous_same_direction_floats, 3)`, plus two if its immediately preceding round floated in the same direction. Compare the lexicographic tuple `(total gap, total float cost)` instead of copying the engine's large integer multipliers.

Determinism is a separate check: restore the exact same clean local snapshot and same recorded request identity, generate again through the normal service, and compare opponent sets/orientation and table ordering. Multiple mathematical optima may exist; reference optimality does not require a different independent solver to pick the identical optimum. Do not advertise this as matching a FIDE-certified program.

Save, for every round: each player's pre-round points, opponent's points, previous opponents, float history, chosen pair, candidate minimum gap/float cost, actual gap/float cost, and pass/fail.

## 7. Proving the tiebreaker

The controlled companion fixture must provide actual persisted witnesses for every row below. Where a final condition needs deliberately arranged results, validate it from the raw fixture before launching the browser. No assertion may pass vacuously because no tie occurred.

| ID | Required witness | Expected result |
| --- | --- | --- |
| TB-01 | Same match points, different cumulative adjusted differences. | Higher difference ranks first. |
| TB-02 | Higher match points but lower difference than another player. | Higher match points still rank first. |
| TB-03 | Same points and exactly equal difference, different seeds, names, total raw scores or W–D–L. | Shared rank; these other values cannot split the tie. |
| TB-04 | Same points, two negative differences such as −5 and −20. | −5 ranks above −20. |
| TB-05 | Raw-score differential order differs from adjusted-score differential order. | The order after overtime deductions is used. |
| TB-06 | Large win followed by narrow losses, versus several narrow wins. | Sum over every official match is used; match points remain primary. |
| TB-07 | A pending/disputed result would change a tie if incorrectly counted. | No change until finalized. |
| TB-08 | A valid organizer correction changes differential while preserving W–D–L. | Tied players reorder immediately where appropriate; historical published pairings stay fixed. |
| TB-09 | Same points and differential but different head-to-head/opponent-strength values. | No hidden head-to-head, Buchholz, total-score, or seed tiebreaker appears. |

For TB-09, include a data witness with a head-to-head winner in an otherwise exact standings tie, or use a focused supplementary ledger if the controlled full fixture cannot contain it. Report its evidence as supplementary, not as present in the 60-match run.

Hand-check at least these overtime examples using typical raw scores. Include the boundary inputs in the full fixtures where compatible with the required pairing and tiebreak witnesses; identify any supplementary cases explicitly:

| Raw A / B | Overtime A / B | Expected adjusted A / B | Expected outcome and A difference |
| --- | --- | --- | --- |
| 401 / 399 | 9 / 0 | 401 / 399 | A wins; +2 |
| 401 / 399 | 10 / 0 | 399 / 399 | Draw; 0 |
| 401 / 399 | 11 / 0 | 399 / 399 | Draw; 0 |
| 401 / 399 | 19 / 0 | 399 / 399 | Draw; 0 |
| 401 / 399 | 20 / 0 | 397 / 399 | B wins; −2 |
| 405 / 404 | 20 / 10 | 401 / 402 | B wins; −1 |

Separately, use the deliberately artificial raw score `1 / 0` with overtime `20 / 0` to verify adjusted scores `−3 / 0`, a B win, and A difference `−3` without a zero clamp. Label this as a supplementary arithmetic boundary test, not a typical Crossplay game or part of either realistic event.

An illustrative standings-order target is shown below. These are cumulative differences across six games, not individual game scores. It is not a claimed run result and must be backed by a valid six-game-per-player ledger with every raw score in 300–450 before it becomes an expected fixture:

| Player | Match points | Adjusted difference | Required relative behavior |
| --- | ---: | ---: | --- |
| A | 4.5 | −10 | Above B despite a smaller difference. |
| B | 4 | +120 | Above C and D by the fixed tiebreaker. |
| C | 4 | +45 | Same competitive rank as D. |
| D | 4 | +45 | Same competitive rank as C even with different seeds/records. |
| E | 4 | −5 | Below B/C/D, above any 4-point player at −20. |
| F | 3.5 | +180 | Below every 4-point player despite a larger difference. |

Also verify test sensitivity: deliberately pass the checker altered evidence with reversed differential order, raw instead of adjusted differences, differential before points, one included unconfirmed result, and split ranks for an exact tie. Each must fail with the affected player/rule identified. This validates the checker; it is not permission to alter production code or expected fixtures until an incorrect app appears to pass.

## 8. Focused exception and workflow scenarios

Run these beside the main event, keeping its 60-played-match ledger intact:

| Scenario | Evidence required |
| --- | --- |
| Withdrawal creates an odd field | Separate 20-player event, withdraw one after a completed round; subsequent round has nine matches plus one eligible bye, withdrawn player excluded, prior results retained. No second allocated bye after an earlier full-point unplayed win. |
| Forfeit and double forfeit | Win/loss or zero/zero points as specified; null game scores and zero difference; prior full-point unplayed winner excluded from later bye eligibility. |
| Configurable penalty | Separate tournament at 3 points per 15 completed seconds: 14→0, 15→3, 29→3, 30→6; zero deduction setting also checked. Settings cannot change once play starts. |
| Edit/stale confirmation | Edit a report, reject old revision confirmation, accept opponent confirmation of the replacement only. |
| Dispute | Opponent disputes, standings unchanged, next round blocked, organizer resolves with a recorded reason. |
| Correction before publication | Change a finalized score after next-round preview; old draft becomes invalid and cannot publish. Regenerate from corrected results. |
| Correction after publication | Correct earlier differential, verify standings update and previously published opponents/hash remain unchanged. |
| Finish/reopen/archive | Early finish requires reason; unresolved matches still block it. Reopen permits corrections but not extra rounds; archive retains history. |
| Revoked invitation/session | Regenerate invitation, old link/session loses reporting authority, new link claims only the intended entrant. |
| Permissions | Anonymous user, unrelated player, unrelated local Auth account, and other tournament organizer cannot perform forbidden operations; private reports/drafts/credentials stay out of public data. |
| Retry and concurrency | Same accepted request retried has one effect; changed payload with same key conflicts; overlapping publish/report requests cannot produce duplicate rounds or silently overwrite results. Reuse the focused actual-Postgres concurrency runner for lock evidence. |
| No feasible legal pairings | Prepared local fixture rejects generation with a useful message and no partial round; no silent rematch/extra-bye fallback. This is a small supplementary scenario, not forced into the main event. |

## 9. Rate limits and trustworthy evidence capture

The current application limits invitation claims to 15 per minute and ordinary commands to 180 per minute per source-IP bucket. Twenty player contexts still share the local machine's IP. Introduce pacing in the test harness: claim at most 15 players in a window, wait for the next window before the remainder, and track command budget across fixtures. Keep a margin for retries/negative checks. Do not spoof client IP headers, disable production protections, or label an unexpected 429 as a tournament failure without showing its cause. A deliberate rate-limit check belongs in a separate bounded case.

Capture enough evidence to reproduce the conclusion without publishing test credentials:

- List plus HTML and JSON test reports, rule/assertion IDs, timestamps, and durations. Playwright supports these [reporters](https://playwright.dev/docs/test-reporters).
- Selected screenshots after authentication/claim: draft round, published pairings, overtime reversal, pending/confirmed/disputed result, all six standings checkpoints, complete final table, and mobile current-match view.
- Redacted JSON for each round's pre-pairing state, assignments, official results, expected/actual standings, and mismatches.
- A 60-row match ledger with names/fixture IDs, round, opponent, raw scores, overtime, deductions, adjusted scores, result, points and differential.
- A fixture profile for each full event proving all 120 raw scores are in 300–450 and recording score/margin variation, overtime frequency, and draws/reversals. List artificial boundary inputs separately.
- A 20-row final standings comparison, including W–D–L, match points, cumulative difference and competitive rank.
- A read-only database summary: counts, duplicate assignments/opponents, selected official revision IDs, frozen config, state transitions, and sanitized correction history. Keep proposal revisions separate from official match count.
- Relevant concurrency output proving an actual blocked second transaction and the resulting one-success/one-conflict behavior.

Default to traces/videos off, as existing tests do: trace/network artifacts can contain credentials, cookies, or invitation URLs. If a local failure requires a [Playwright trace](https://playwright.dev/docs/trace-viewer), keep the raw trace private under ignored `.local`, use only synthetic/local credentials, inspect before sharing, and export a sanitized explanation/screenshots instead of publishing the raw archive.

## 10. Proposed files and evidence package

Implementation would add or extend the following, without changing tournament behavior merely to accommodate the tests:

```text
playwright.swiss20.config.ts
scripts/run-local-swiss20.mjs
tests/e2e/swiss20/tournament.spec.ts
tests/e2e/swiss20/tiebreak.spec.ts
tests/e2e/swiss20/exceptions.spec.ts
tests/support/swiss-reference.ts
tests/support/local-environment.ts
tests/fixtures/swiss20/mixed-results-v1.json
tests/fixtures/swiss20/tiebreak-witnesses-v1.json
```

Implemented command: `npm run test:e2e:swiss20`. The runner prepares verified isolated targets, builds/starts the app, runs fixtures and checks, writes evidence, stops only its own processes, and retains artifacts. Delete a disposable database only after verifying its recorded exact run identity; never use a broad cleanup command.

```text
.local/evidence/swiss20/<runId>/
  manifest.json
  summary.md
  assertions.json
  playwright-report/
  results.json
  main-event/matches.csv
  main-event/fixture-profile.json
  main-event/standings-final.expected.csv
  main-event/standings-final.actual.csv
  main-event/round-01/... through round-06/...
  tiebreak-witnesses/...
  exceptions/...
  database-checks.json
  screenshots/
```

The user-facing summary should contain one row per requirement, its expected/observed values, pass/fail/blocked state, and a link to the supporting artifact. Produce a sanitized shareable summary outside `.local` only after inspecting it; do not commit raw session or network artifacts.

## 11. Execution order and stopping condition

1. Implement only the local guard, deterministic fixture preparation, independent checkers, browser scenarios, and evidence writer above.
2. Validate realistic dummy data and its fixture profiles, hand-check the arithmetic examples, and confirm that the tiebreak fixture actually includes each promised witness. Freeze the fixtures and expected ledgers.
3. Run the main event, controlled tiebreak event, and bounded exception scenarios once against fresh isolated data.
4. Review the evidence once for missing assertions, mismatches, and unsubstantiated claims. A screenshot or HTTP 200 alone is not enough to establish correct standings.
5. If a test fails, preserve the original failure. Report whether it is an environment/harness problem or a reproducible application defect. Do not expand this planning task into product repairs. During a later authorized implementation, make only the necessary focused repair and rerun affected verification; a scoring/pairing correction requires the affected whole six-round ledger to be revalidated.
6. Stop when every required row is PASS and the evidence package is complete. No random soak campaign, unrelated sibling regression suite, additional review agents, or speculative cleanup is part of this plan.

Final acceptance requires: exact 20/6/10/60 counts; realistic fixture profiles with all raw scores in 300–450 for both full events; full legal pairing coverage; independent score-group/float checks; every official score and standings row matching the oracle; all tiebreak witnesses observed; workflow/privacy/concurrency checks passing; persisted state surviving restart; and redacted evidence indexed by requirement.

Execution evidence now exists: see [the validation record](swiss20-validation-results.md). It records the exact local scope, original harness failures, affected reruns, and selected passing artifacts; it does not claim hosted or universal tournament correctness.
