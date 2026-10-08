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
- [ ] Scoped migration release followed by application deployment
- [ ] Read-only production verification

The application passed TypeScript, ESLint, production build and 206 unit tests in 17 files. Browser evidence covers Chromium and WebKit at 1920×1080 and 1366×768, with eighteen-player/nine-table publication through departures, a bye, final standings, archive and reset. All 128 table pages and 256 long-name roster entries remain reachable. Public responses were compared with and without organizer cookies. The new SQL migration passed its own isolated permission/projection/status tests in `crossplay_display_20261008`; no older owner suites ran.

Initial browser evidence is `.local/evidence/clock/1a11a1739d7_f80cea9f`. It includes passing managed-table workflows in both engines, all four phone/iPad timer profiles, tablet touch workflows, and the single geometry matrix including landscape and enlarged text. The one coordinated review and acceptance run identified footer retry overflow, a withdrawn label adding an unnecessary standings page, and the public TV launch control pushing Start Match below the phone viewport. One focused repair fits the retry alongside connection status, keeps the withdrawn label inline, and places public TV controls after the matches/standings while retaining them near the organizer overview header.

Affected rerun `.local/evidence/clock/1a11a1ac153_8cb506ff` passed both real TV tournament scenarios, large/long roster pagination in both engines and both phone touch workflows. The geometry witness now waits for font/ResizeObserver layout completion. Its remaining recovery request-count assertion was corrected to explicitly observe an HTTP 503 and recovery, without another application edit. Recovery rerun `.local/evidence/clock/1a11a1d4926_964f5092` passed in both engines. Original failures remain alongside successful affected reruns; no second general review was performed. Bye half-point display was corrected during initial integration before these acceptance runs.

## Bounds and incidental observations

Physical TV viewing distance and HDMI/browser scaling require the venue hardware; browser viewport evidence does not certify those conditions. Physical iPhone/iPad/Android sleep/wake behavior remains outside browser emulation.

Installing the QR rendering dependency reported seven existing high-severity dependency audit entries involving Next.js and existing tooling/transitive packages. The QR dependency introduced no reported entry. Those unrelated dependency upgrades are outside this feature phase and were not applied. Existing toolchain warnings are likewise not a reason to expand this work.
