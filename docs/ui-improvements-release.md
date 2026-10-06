# Tournament UI improvements

Implemented October 6, 2026, from [the accepted plan](ui-improvements-implementation-plan.md).

Match cards now show the appropriate action for an unstarted, running, paused, ended, pending, review-required or other-device match. Organizer corrections are grouped in one disclosure. Each device can remember its physical table, with new opponents appearing there in later rounds. Final standings appear before the last round on finished and archived events.

Settings explicitly select App timer or External timer. All tournament durations use `m:ss`, including settings, overtime entry, rules, corrections and score summaries. Optional player invitations are in a collapsed roster section. Zero overtime and zero deductions no longer clutter score summaries. External-timer results can be entered from the ordinary tournament page.

The existing server permissions, controller ownership, event journal, precise milliseconds, revision checks, Swiss pairing, starter selection and score-differential arithmetic are preserved. No database migration is required. The sign-in cap remains 16 attempts per minute per network address; all signed-in devices retain organizer permissions.

## Verification

- TypeScript, ESLint and production build passed. All 182 unit tests passed across 12 files.
- All 15 browser scenarios passed across the initial run and focused reruns against isolated local PostgreSQL databases and Supabase Auth. Passed scenarios were not repeatedly rerun without an affected change.
- The complete 20-player, six-round event finished all 60 matches through ten shared clocks, including score entry and both acknowledgements. Each round's pairings, starter counts and standings matched independent reference calculations. The final screen contained exactly 20 standings rows and 60 final results persisted across a server restart.
- Nine independent browser profiles signed into the same organizer account, controlled nine different matches and retained independent table preferences after return and reload. Another device could view but could not take over an existing controller. Concurrent entry and lost-response recovery passed.
- Remembered table numbers followed new opponents, missing tables showed an explicit message, byes remained in All tables, historical rounds remained unfiltered, and selection worked when browser storage was unavailable.
- Settings retained 564 seconds as `9:24` through save, reload and copy; malformed/blank required durations were rejected. Explicit external mode stored null. Competitive settings remained locked after publication.
- Correcting one used-time field from 1,209,999 ms to `20:10` stored exactly 1,210,000 ms. The other field retained 864,123 ms, including after focus and blur. At `0:09` overtime no deduction appeared; `0:10` deducted 2 points. Positive overtime with a configured zero deduction remained visible without a misleading zero-points line.
- External scores 401–399 with `0:20` overtime finalized as 397–399. Finished and archived views retained the same standings. Optional invitation generation/copy/selection clearing and the existing individual report, confirmation and dispute workflow passed.
- Recovery after refresh, offline ending, lost event responses, stale controllers, score corrections, authentication restrictions and removed timer-link routes remained covered by passing scenarios.

Tiebreak witnesses include Priya Marsh and Samira Holt both at 4.5 match points with adjusted differences +155 and +154, respectively; Quinn Hale and Nadia Wells sharing rank 4 with 4 points and +25; and Theo Bennett ranking above Morgan Vale on adjusted differences +25 versus +24 even though Morgan's raw differential was +26. Match points still take priority, negative differences sort numerically, and raw totals, opponent points and head-to-head do not break an exact tie.

## Retained local evidence

All directories below are under `.local/evidence/clock/` and remain ignored by Git because the test harness also retains local authentication fixtures.

| Run | Result and useful files |
| --- | --- |
| `1a10f992dda_8f234e1a` | Initial 8 passing scenarios; recovery/security/corrections JSON, nine viewport captures from 320×568 through 1180×820, initial failures retained in `results.json` and `browser.log`. |
| `1a10f9d66e3_7ce08ac7` | Nine devices, table persistence, full 60-match event and settings passed. `clock-20x6.json`, `round-1.json` through `round-6.json`, final standings screenshots, `match-entry/nine-devices.json`, `match-entry/table-preference.json`, `ui-workflow/settings.json`. |
| `1a10f9f1b9b_380fca68` | External reporting/invitations/final standings and precise corrections passed. `ui-workflow/external-reporting.json`, `ui-workflow/precise-corrections.json`, phone and iPad captures. |
| `1a10f9fc6da_d601afd2` | Retained failed rules-copy assertion while its wording was being corrected; no application change resulted. |
| `1a10fa04f2a_f9291790` | Existing individual reporting, confirmation, dispute resolution, odd tournament, withdrawal and rules-view scenario passed. |

Phone/iPad screenshots were inspected for duration entry, external scoring, selected table, organizer correction and final standings. Automated viewport checks verified no horizontal overflow and reachable clock controls. Physical iPhone/iPad Safari keyboard and sleep/wake behavior remain unverified on actual hardware.

One general implementation review was performed. Focused fixes preserved untouched milliseconds, discarded obsolete clock reads and corrected action precedence. Browser acceptance exposed duplicate final standings and an organizer's false “Your match” bye; both were repaired. Test selectors and waits were adjusted for current labels, separate forms, completed navigation and saved operations. Failed evidence remains available; no second general review was performed.

No proven automated acceptance blocker remains. The pre-existing nonblocking Vite configuration warning was not changed. The original demonstration tournament was not reset, and the slow two-round walkthrough remains deferred until requested.
