# Crossplay Swiss acceptance results

Verified locally on 2026-09-28. **PASS: 53/53 acceptance groups.**

Three implementation agents built the frozen fixtures and independent checkers, full browser events, and supplementary workflow scenarios. The integrated run exercised the actual production build, real local Supabase Auth, and isolated PostgreSQL 17. Application code, hosted databases and the deployed website were unchanged.

## Results

| Check | Observed result |
| --- | --- |
| Full tournaments | Two events, each with 20 players, six rounds, ten matches per round and 60 official played matches. |
| Player workflow | 40 independent player sessions across the events; all 120 matches reported through player forms, 118 opponent confirmations and two explicitly tested organizer dispute resolutions. |
| Realistic raw scores | Main: all 120 scores in 310–449. Companion: all 120 scores in 302–450. Both meet the requested 300–450 range. |
| Overtime | Each event has 104/120 zero-overtime player results. Completed-interval boundaries, draws and winner reversals checked. Separate 3-points/15-seconds and zero-deduction configurations passed. |
| Pairing legality | Every player has six distinct opponents, exactly one assignment per round, and no bye in either full event. |
| Pairing quality | All 12 rounds match an independent bitmask solver's minimum total point gap and secondary repeated-float cost. |
| Pairing determinism | Restoring an exact isolated database checkpoint and repeating the same generation request reproduces oriented pairs, table order, engine version and input hash. |
| Scoring and standings | Every official match agrees with the independent calculator. All 20 standings rows agree at every round checkpoint across organizer/public views and saved results. |
| Conservation | Each event totals 60 match points and zero cumulative differential; every player has six W–D–L results. |
| Lifecycle | Rules freeze, unresolved-round blocking, finish restrictions, app-restart persistence for three audiences, clean settings copy, and retained archived history passed. |
| Supplementary workflows | Withdrawal to 19 players, eligible non-repeating byes, forfeits, stale reports, disputes, corrections, revoked invitations, authorization and impossible pairings passed. |
| Concurrency | Real PostgreSQL overlapping publication/report transactions observed a blocked second backend, then one success and one conflict. Idempotency/replay checks passed. |
| Automated checks | Seven distinct browser scenarios passed across selected attempts; 20 independent-reference tests and nine local-target guard tests passed. Production build, TypeScript and lint passed. |

## Concrete tiebreak evidence

These are persisted final results from the full companion event, not hypothetical examples:

| Witness | Actual result |
| --- | --- |
| Equal points, different differential | Priya Marsh and Samira Holt both have 4.5 points; +155 ranks above +154. |
| Points remain primary | Robin Calder at 4.5 points/+16 ranks above Quinn Hale at 4 points/+25. |
| Exact ties share rank | Quinn Hale and Nadia Wells both have 4 points/+25 and share rank 4; the next rank is 6. Their different raw totals, seeds, head-to-head result and opponent-point totals do not split the tie. |
| Negative differential | At 3.5 points, Owen Brooks at −35 ranks above Noah Finch at −56. |
| Overtime-adjusted differential | Theo Bennett and Morgan Vale both have 3 points. Theo's adjusted +25 ranks above Morgan's +24, although their raw differentials are +25 and +26 respectively. |
| Cumulative margin versus match points | Lena Mercer at 2.5 points/+88 ranks below Robin Calder at 4.5 points/+16. |
| Pending and corrected results | Pending/disputed scores stay excluded. An outcome-preserving organizer correction reorders tied-point players without changing W–D–L or published opponents. The original score is then restored through the audited UI. |

The checker also rejected deliberately corrupted ordering, raw differential substituted for adjusted differential, split ranks for an exact tie, and inclusion of an unconfirmed result.

## Evidence links

- [Complete requirement matrix and attempt history](../.local/evidence/swiss20/1a0e6282e4c_fb327bb7/summary.md)
- [Machine-readable 53-group assertion record](../.local/evidence/swiss20/1a0e6282e4c_fb327bb7/assertions.json)
- [Main event: 60-match ledger](../.local/evidence/swiss20/1a0e629e3bc_e5f97ee9/mixed-results-20x6-v1/matches.csv) and [final standings](../.local/evidence/swiss20/1a0e629e3bc_e5f97ee9/mixed-results-20x6-v1/standings.csv)
- [Companion event: 60-match ledger](../.local/evidence/swiss20/1a0e629e3bc_e5f97ee9/tiebreak-witnesses-20x6-v1/matches.csv) and [final standings](../.local/evidence/swiss20/1a0e629e3bc_e5f97ee9/tiebreak-witnesses-20x6-v1/standings.csv)
- [Companion final-standings screenshot](../.local/evidence/swiss20/1a0e629e3bc_e5f97ee9/tiebreak-witnesses-20x6-v1/screenshots/final-standings.png)
- [Mobile player screenshot](../.local/evidence/swiss20/1a0e629e3bc_e5f97ee9/tiebreak-witnesses-20x6-v1/screenshots/mobile-own-match.png)
- [Tiebreak witnesses](../.local/evidence/swiss20/1a0e629e3bc_e5f97ee9/tiebreak-witnesses-20x6-v1/tiebreak-witnesses.json), [correction evidence](../.local/evidence/swiss20/1a0e629e3bc_e5f97ee9/tiebreak-witnesses-20x6-v1/tiebreak-correction.json), and [deterministic replay](../.local/evidence/swiss20/1a0e629e3bc_e5f97ee9/mixed-results-20x6-v1/determinism.json)
- [Independent checker and target-guard results](../.local/evidence/swiss20/1a0e629e3bc_e5f97ee9/checker-tests.json)
- [Authorization evidence](../.local/evidence/swiss20/1a0e62f7a4f_596f468e/exceptions/authorization.json) and [PostgreSQL concurrency output](../.local/evidence/swiss20/1a0e62f7a4f_596f468e/concurrency.log)

The main matrix links all 12 per-round pairing proofs and database/standings checkpoints. Selected desktop/mobile screenshots were visually inspected, and every player view was checked for horizontal overflow during the browser run. Private credentials remain in ignored local files and are not linked here.

## Attempt history and limits

Passing evidence is assembled from targeted attempts, not presented as a single clean first run. An initial integration attempt was interrupted while the companion test was being completed. The subsequent attempts exposed test-harness failures: a withdrawal locator changed when its badge appeared, a singular/plural heading mismatch, overly broad alert locators, missing evidence subdirectories, and an incorrect assumption that an unrelated Auth account could sign in to the organizer app. The application correctly rejected that sign-in with 403 and cleared its session. Only those evidenced harness issues were repaired, and only affected scenarios were rerun. Original failure output remains retained.

Selected attempts:

- `1a0e6282e4c_fb327bb7`: attendance/byes/forfeits and corrections/lifecycle.
- `1a0e629e3bc_e5f97ee9`: both full events, configurable penalties and impossible pairings.
- `1a0e62f7a4f_596f468e`: authorization and real PostgreSQL concurrency.

There are no unresolved acceptance blockers and no evidenced application defect requiring a production change. Nonblocking Vite configuration-loader and terminal-color warnings were observed and left unchanged. This verifies the accepted Crossplay Swiss rules for these scenarios; it is not FIDE chess certification or hosted performance/security certification.

Reproduce with `npm run test:e2e:swiss20`; see [local setup and evidence instructions](local-swiss20-testing.md). Raw artifacts live under ignored `.local` and are available on this workspace; they are not committed public artifacts.
