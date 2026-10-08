# TV display and visual refresh release

October 8, 2026. Implementation of [the approved plan](tv-display-and-visual-refresh-plan.md).

## Scope

A public 1080p display for nine simultaneous tables and eighteen standings, published-only round changes, official results, departures and ties, connection recovery, fullscreen and overflow pagination. The website receives a shared Crossplay-inspired palette, self-hosted licensed typography, consistent controls and a clearer single-match table presentation. Timer authority, scoring and Swiss rules remain unchanged.

Three subagents own public data, TV presentation and the website visual system. The parent integrates the work, runs acceptance checks and performs the single general review. Database production work stays in the owner repository and uses only the new migration's focused tests.

## Acceptance evidence

- [x] New SQL projection, permissions, publication and status checks
- [x] Public API privacy, revision and capability fallback checks
- [x] TV data updates, nine-table fit, eighteen standings, departure/bye and final states
- [x] Connection loss, unavailable/reset and generation recovery
- [x] Large roster, long name, smaller viewport and pagination checks
- [x] Existing phone/iPad table, report, timer and layout workflows
- [x] Typecheck, lint, unit tests and production build
- [x] One general implementation review and affected repair checks
- [x] Scoped migration release followed by application deployment
- [x] Read-only production verification

The application passed TypeScript, ESLint, production build and 206 unit tests in 17 files. Browser evidence covers Chromium and WebKit at 1920×1080 and 1366×768, with eighteen-player/nine-table publication through departures, a bye, final standings, archive and reset. All 128 table pages and 256 long-name roster entries remain reachable. Public responses were compared with and without organizer cookies. The new SQL migration passed its own isolated permission/projection/status tests in `crossplay_display_20261008`; no older owner suites ran.

Initial browser evidence is `.local/evidence/clock/1a11a1739d7_f80cea9f`. It includes passing managed-table workflows in both engines, all four phone/iPad timer profiles, tablet touch workflows, and the single geometry matrix including landscape and enlarged text. The one coordinated review and acceptance run identified footer retry overflow, a withdrawn label adding an unnecessary standings page, and the public TV launch control pushing Start Match below the phone viewport. One focused repair fits the retry alongside connection status, keeps the withdrawn label inline, and places public TV controls after the matches/standings while retaining them near the organizer overview header.

Affected rerun `.local/evidence/clock/1a11a1ac153_8cb506ff` passed both real TV tournament scenarios, large/long roster pagination in both engines and both phone touch workflows. The geometry witness now waits for font/ResizeObserver layout completion. Its remaining recovery request-count assertion was corrected to explicitly observe an HTTP 503 and recovery, without another application edit. Recovery rerun `.local/evidence/clock/1a11a1d4926_964f5092` passed in both engines. Original failures remain alongside successful affected reruns; no second general review was performed. Bye half-point display was corrected during initial integration before these acceptance runs.

## Production release

Database [PR #172](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/172) merged as `44bae93` after its scoped CI passed. The verified linked project `gsiyqhkcgegjrvqcqioc` applied only `20261008040000_crossplay_public_display.sql`. All 63 migration records match and the subsequent dry run is empty. Runtime can execute the two stable display functions, while browser roles and service role cannot; private tables remain inaccessible to runtime.

Application [PR #7](https://github.com/jfung9021/crossplay-tournaments/pull/7) merged as `fb00ad9` after application and preview checks passed. Production deployment `dpl_E5kZBiNY9DXRCv2hTP82mFQpx7jb` is ready at https://crossplay-tournaments.vercel.app. Read-only verification passed at `2026-10-08T06:11:47.892Z`: the existing public event's display API/page, revision, safe public fields, saved status capability, font asset, home/login, unknown-event 404 and anonymous organizer-list 403. Production tournament data was not changed. The verification accepts the edge's weak ETag form while requiring the exact content revision.

The local screen gallery at http://127.0.0.1:4179 contains 32 TV and phone/iPad views. Evidence and the sanitized production verification are retained under `.local/`.

## Final visual preference

The user requested gray italic names instead of visible withdrawal labels. This applies to TV standings and table cards, the organizer roster, public standings, player history and historical match cards. Names use `#686868`; scores, earned ranks and participation rules remain unchanged. The existing departure assertion now checks the styled name instead of the removed badge.

Lint and the TypeScript-enabled production build passed. The single review of this small follow-up found no blocker. Existing managed-table/departure and real nine-table display scenarios both passed in Chromium, capturing phone and iPad screens, under `.local/evidence/clock/1a11a2605b2_a6b56bed`; the gallery was refreshed. An earlier attempt reused a build with the wrong site origin and correctly failed the login origin check before reaching the feature. It is retained under `1a11a2543a7_971451b9`; rebuilding for the isolated local targets resolved it without application changes.

## Bounds and incidental observations

Physical TV viewing distance and HDMI/browser scaling require the venue hardware; browser viewport evidence does not certify those conditions. Physical iPhone/iPad/Android sleep/wake behavior remains outside browser emulation.

Installing the QR rendering dependency reported seven existing high-severity dependency audit entries involving Next.js and existing tooling/transitive packages. The QR dependency introduced no reported entry. Those unrelated dependency upgrades are outside this feature phase and were not applied. Existing toolchain warnings are likewise not a reason to expand this work.
