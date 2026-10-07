# Shared match clock verification and release

Date: 2026-09-30. The user authorized implementation with subagents, a single logic review, merge and deployment.

## Implemented behavior

- One private shared phone/iPad match screen, default 20 minutes each, immediate tap switching, pause/resume, live completed-interval overtime deductions, manual ending and compact score reporting.
- Saved Scrabble-style starter selection: fewer firsts, more seconds, then a server random draw. Byes, unplayed forfeits and manual first-player records have explicit accounting.
- Durable millisecond journal, offline continuation/end, refresh recovery, one controlling tab/device, audited organizer handoff/correction and stale-event rejection.
- Two named acknowledgements on the shared device; score edits invalidate prior acknowledgements. Final organizer corrections display the authoritative raw score, overtime and confirmation source.
- Additive private database capability preserves the old base schema version and manual reporting for games without a clock. Runtime has function access only.

## Verification

- Type checking, ESLint, production build and 124 unit tests pass, including 32 clock/recovery tests and independent Swiss/tiebreak oracles.
- Nine distinct browser scenarios pass across the recorded runs: four recovery/access tests, one report-correction workflow, the full 20-player/six-round event, phone/iPad layouts with overtime reversal, and two existing tournament reporting scenarios.
- All 60 matches used ten shared browser contexts, clock start/switch/end, actual scores in the frozen realistic fixture, and both acknowledgements. All six pairings/standings checkpoints matched independent reference calculations. The persisted starter for every match matched prior-round counts. Exact ties and adjusted-differential ordering matched the existing tiebreak witnesses.
- Default penalty witness: actual 401–399, time used 20:20 / 19:50, deduction 4 / 0, final 397–399, differential −2 / +2. Time spent reporting was excluded.
- Screenshots and geometry checks cover 320×568, 375×667, 390×844, 844×390, 768×1024, 1024×768, 820×1180, 1180×820 and a 507×768 split view. Selected phone/tablet/report screenshots were visually inspected.
- The new migration's focused SQL regressions and four actual PostgreSQL lock-contention races pass. No sibling application suite or shared database reset was run.

Evidence directories (ignored local artifacts):

| Run | Evidence |
| --- | --- |
| Initial complete eight-scenario pass | `.local/evidence/clock/1a0f0ec06fe_24ed4324` |
| Final code: recovery, access, review regressions and 60-match event | `.local/evidence/clock/1a0f0f102ae_88e2fb20` |
| Affected layout/overtime test after correcting its asynchronous wait | `.local/evidence/clock/1a0f0f1e6fe_526fc7d4` |
| Final migration checks and four races | Isolated PostgreSQL database `crossplay_clock_1790748635784`; canonical migration test scripts |

The failed asynchronous assertion read before report submission completed; the retained database showed the saved pending report. Waiting for the Review scores heading repaired the test; no application behavior changed for that failure. Initial integration also fixed an invalid rate-budget value. Original failed attempts remain retained.

## Single review and repairs

One review was divided into disjoint database/server, clock/recovery and UI scopes. Focused repairs addressed delayed-response calibration, stale queued events across organizer corrections, pending-report refresh, form reset after timing correction, authoritative final score/confirmation display, and review requirements when replacing a claimed controller. Specific regressions pass; no second general review was performed. PostgreSQL contention testing separately exposed and repaired manual reporting racing clock creation.

## Release

- Database PR: https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/161. Merged with focused CI passing; canonical migration `20260930020000` applied to verified project `gsiyqhkcgegjrvqcqioc` with exact local/remote migration parity. Only this reviewed migration was pending/applied.
- Application PR: https://github.com/jfung9021/crossplay-tournaments/pull/1. Merged as `d3ff2cf5d0655b97e9fb2f5a433f5db1482d9ef6`; pull-request and main-branch application CI passed. Main CI: https://github.com/jfung9021/crossplay-tournaments/actions/runs/36677365755.
- Vercel production deployment `dpl_GYtw5MUhp2wYABPixJKNsg3Hr5Bk` is Ready and serves https://crossplay-tournaments.vercel.app. Deployment: https://vercel.com/jonathansminigameparty/crossplay-tournaments/GYtw5MUhp2wYABPixJKNsg3Hr5Bk.
- Production verification passed at `2026-09-30T06:17:46.961Z`: the dedicated runtime role reports the unchanged base version and new clock version; all seven new tables have RLS and deny direct runtime access. The homepage, auth and tournament endpoints return 200, anonymous admin access returns 403, an unknown clock returns 404, and a cross-origin clock mutation returns 403. Smoke checks changed no production tournament data. Sanitized evidence: `.local/clock-production-verification.json`.

## Verification limits

Physical iPhone and iPad Safari sleep/wake and software-keyboard smoke checks remain pending because no physical devices are attached. Desktop browser viewport/emulation evidence does not establish those hardware behaviors. No proven automated acceptance blocker remains. The existing nonblocking Vite configuration warning was observed and left unchanged.

## Larger timers and current-turn duration - October 8, 2026

Main digits now fit the available width and height of each player panel, including long minute values and overtime. A small bottom counter shows elapsed m:ss for the current turn, resets on passing, freezes while paused and survives offline gestures, recovery and reload. It does not affect main totals or penalties. Organizer timing corrections/controller replacement begin a fresh turn counter in the new clock epoch.

The canonical additive read migration is 20261008020000_crossplay_turn_time.sql in the sibling repository ([database PR 169](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/169)). Its authorized read derives accepted turn time from existing events, bounded to the returned epoch/sequence. Clients add live elapsed time and replay pending events. Optional metadata supports pre-upgrade journals; missing metadata displays a dash until a fresh server snapshot. Old-client display metadata is reconstructed without relaxing authoritative timing validation. Deploy the migration before the app; rolling back the app leaves the additive read intact.

Verification: the full 188-test unit suite passed before the compatibility regression was added; the final 36 affected clock/journal tests passed afterward. Lint, TypeScript and the production build pass. Final isolated browser run `.local/evidence/clock/1a1188b1030_83e6b129` passed nine cases: four phone/tablet Chromium/WebKit timer scenarios, long names and agreements, the nine-size layout/overtime/report flow, refresh/second-tab recovery, offline events and lost-response recovery. Three repeated long-name cases were intentionally skipped because that boundary test runs once. Screenshots were inspected for phone, tablet, smallest viewport and overtime. Physical hardware remains unavailable.

One general diff review completed. A deterministic regression test reproduced stale display metadata saved by an old client during rollout; the focused repair and affected checks passed. Initial layout checks exposed transient horizontal overflow during resize and excessive minimum height at 320x568; both now pass. No second general review was performed. The pre-existing Vite configuration warning remains unchanged; no proven blocker remains. Release CI, merge and production verification follow this acceptance record.
