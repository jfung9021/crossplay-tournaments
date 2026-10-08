# Table device workflow release

October 8, 2026. Implements the twelve outcomes in [the approved plan](table-device-workflow-implementation-plan.md).

## Delivered behavior

- Persistent event-specific device duty, `/t/[slug]/table`, validated sign-in return, independent browsing and result receipts followed by a waiting state until the next pairing is published. An already-published same-round queue is supported only when table capacity requires it.
- Physical table setup, stable numbers, availability, queued play, audited moves/closures and coverage filters. Published opponents and completed locations stay unchanged.
- Versioned, atomic shared-session replacement/release. Old writes fail; precise saved milliseconds survive; organizer time review is mandatory before play/reporting continues.
- Remembered clock layout, recoverable editable report/correction drafts, competing-tab retry, clock-aware individual report guidance, organizer attention/search and setup continuation.
- Clear player departure action with outstanding-match guidance. Ranking remains points (win 1, draw ½), then adjusted difference, for every entrant including withdrawn players. History is retained.

## Verification and bounds

TypeScript, ESLint, production build and 192 unit tests passed. The new database migration passed isolated behavior/permission/idempotency checks and ten observed-lock races, including replacement versus append/report/finalization/reset/archive and movement versus opening. The owner repository ran only tests of this new migration.

Browser evidence covers same-account independent devices, persistent duty, browsing, no automatic starts, paused replacement, exact saved time, old-device rejection, shared acknowledgements, result receipts, closure/queue blocking, later rounds, departures/history, manual drafts, idle movement/retirement and sign-in return. Screens are captured at 390×844 and 820×1180. Browser engines are Chromium and WebKit; this is emulation, not physical iPhone/iPad/Android sleep/wake certification.

The one coordinated implementation review is complete. Focused fixes address selector accessibility, a stale assignment notice after replacement, the selection resetting during a pending assignment, compact table navigation, and the explanation that time review clears pending score acknowledgements. No additional general review followed those repairs. Pre-existing Vite configuration and Node color-environment warnings were not changed.

Migration capability is additive; existing tournaments require explicit enablement. Device UUIDs are convenience identifiers, never authority. Authenticated organizers retain full permissions. Offline devices do not expire or silently relinquish control. Keep an app build that understands physical locations when rolling back an event already using queues.

## Release order

The owner migration merged first in [PR 171](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/171), commit `9d00cff7f73c9578491e41dd69c03bbb73dd1bdf`. Only `20261008030000_crossplay_table_devices.sql` was applied to verified project `gsiyqhkcgegjrvqcqioc`. All 62 local/remote migration records match, the final dry run is empty, and runtime capability/ACL verification passed.

Application [PR 6](https://github.com/jfung9021/crossplay-tournaments/pull/6) passed its checks and merged as `2fc0f72b0b6c5007058a3bdb0d0c7ce224c59b55`. Production deployment `dpl_F9y1gS2RiVEWHNSVpC4soKNENbBM` is Ready and serves [Crossplay tournaments](https://crossplay-tournaments.vercel.app).

Production verification passed at 2026-10-08 05:44:27 UTC: public pages and collection return successfully, private collection and foreign-origin mutations are rejected, the new capability is available, and operational tables/helpers remain private. No production tournament data was mutated. Sanitized local evidence is `.local/table-production-verification.json`. No release blocker remains.

The user clarified the normal event has nine matches and nine phones. Its normal continuation is result receipt, waiting at the assigned table, then newly published next-round opponents. Queued examples in the screen gallery demonstrate the reduced-capacity fallback rather than expected event setup.

Final local browser evidence: `1a11a02cb89_eb9e3387` (two managed-device scenarios, Chromium/WebKit) and `1a11a044fe1_92addd20` (two affected manual/login scenarios, Chromium/WebKit). Legacy layout/duplicate-tab and departure witnesses passed in `1a11a014435_eeed9cc9`. The latter runs preserve original test-selector/navigation assertion failures alongside their affected successful reruns. All accepted browser scenarios now pass. The 23-screen phone/iPad gallery is retained at `.local/table-device-preview/index.html`.
