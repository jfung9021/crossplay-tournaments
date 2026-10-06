# Full tournament smoke test results

**PASS — 20 players completed six rounds and all 60 matches, then reached the finished tournament and public results screens.** Verified locally on October 6, 2026, completing at 13:10 Japan Standard Time.

The run used the production build, real local Supabase Auth, an isolated PostgreSQL 17 database, and ten separate shared-device browser contexts. Each match used Start clock, a turn switch, End game, actual score entry, and both named acknowledgements. Controlled browser time accelerated play; no 40-minute physical game was required. Tournament creation and bulk roster setup used authenticated app APIs; round preview/publication, clock operation, reporting, and Finish tournament used the browser UI.

## Observed results

| Check | Result |
| --- | --- |
| Entrants and rounds | 20 entrants; six rounds; ten matches per round |
| Completed matches | All 60 official, with shared-device acknowledgements from both sides |
| Scores | All actual scores between 302 and 450 |
| Clock timing | Saved used milliseconds and overtime matched the fixture for all 60 matches |
| Starters | All saved choices and methods matched prior-round first/second counts |
| Pairings | All six rounds matched the frozen sequence and independent legal matching/cost checks |
| Standings | All six round checkpoints matched independent calculations |
| Persistence | Local app restart retained the final standings |
| Tournament completion | Finish tournament succeeded; persisted status is `finished`; six rounds and 60 final matches remain |
| Final screens | Organizer Tournament complete and public Finished / Final round shown; all 20 displayed standings rows verified |
| Conservation | 60 total match points; zero summed score differential |
| Supporting checks | 29 independent-reference/local-target checks passed; production build and TypeScript passed; targeted ESLint passed |

## Tiebreak evidence

- Priya Marsh and Samira Holt each finished with 4.5 points. Their differences of +155 and +154 placed them first and second.
- Quinn Hale and Nadia Wells each finished with 4 points/+25. Both display rank 4; the next rank is 6.
- Robin Calder's 4.5 points/+16 ranks above the players with 4 points/+25, demonstrating that match points remain primary.
- Owen Brooks at 3.5/−35 ranks above Noah Finch at 3.5/−56.
- Theo Bennett at 3/+25 ranks above Morgan Vale at 3/+24 after overtime, although their raw differences are +25 and +26.

## Screenshots and retained evidence

- [Final standings table](../.local/evidence/clock/1a10f67ada1_d0723af5/final-standings-table.png)
- [Full public results page](../.local/evidence/clock/1a10f67ada1_d0723af5/final-standings.png)
- [Organizer completion screen](../.local/evidence/clock/1a10f67ada1_d0723af5/organizer-complete.png)
- [Shared match completion screen](../.local/evidence/clock/1a10f67ada1_d0723af5/shared-match-complete.png)
- [60-match timing ledger and final standings](../.local/evidence/clock/1a10f67ada1_d0723af5/clock-20x6.json)
- [Runner completion status](../.local/evidence/clock/1a10f67ada1_d0723af5/run-status.json)
- [Browser result record](../.local/evidence/clock/1a10f67ada1_d0723af5/results.json)

The same evidence directory contains `round-1.json` through `round-6.json`, independent-checker results, logs, and source/fixture hashes. These artifacts are retained locally and ignored by Git. Do not share the directory wholesale: it also contains private synthetic Auth credentials.

## Execution and scope

Command: `npm run test:e2e:clock -- --grep "20 players complete six rounds"`, with the verified local container `crossplay-test-clock-smoke` and database port `25432`. The browser scenario passed in 11.5 seconds; setup, build, and supporting checks took additional time. Automatic test retries were disabled.

Windows reserved the usual port 55432, so the first preflight attempt could not start its database and never reached the tournament test. That attempt remains in `.local/evidence/clock/1a10f66bf61_7fef1517`. The runner now accepts a named isolated test container and port, retaining its PostgreSQL-image, exact loopback-binding, runtime-role, and per-run database guards. The original database container and its retained evidence were preserved.

The existing full-match scenario was extended to click Finish tournament, assert the persisted finished state, verify the organizer/public standings tables, and capture completion screenshots. No application source or production data changed, and no deployment was performed.

This was one complete clock tournament scenario, not execution of every item in the [121-check smoke checklist](smoke-test-checklist.md). Physical iPhone/iPad Safari sleep and software-keyboard checks remain unrun. The pre-existing nonblocking Vite configuration and terminal-color warnings did not affect the successful run. No application defect was observed in this scenario.
