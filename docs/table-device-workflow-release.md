# Table device workflow release

October 8, 2026. Implements the twelve outcomes in [the approved plan](table-device-workflow-implementation-plan.md).

## Delivered behavior

- Persistent event-specific device duty, `/t/[slug]/table`, validated sign-in return, independent browsing and result receipts followed by the next pairing.
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

Merge the owner migration, verify the established target and sole pending migration, apply it, and verify history/ACL parity. Then merge and deploy this application. Production verification is read-only. Exact PR, deployment and final evidence references are recorded after release.

Final local browser evidence: `1a11a02cb89_eb9e3387` (two managed-device scenarios, Chromium/WebKit) and `1a11a044fe1_92addd20` (two affected manual/login scenarios, Chromium/WebKit). Legacy layout/duplicate-tab and departure witnesses passed in `1a11a014435_eeed9cc9`. The latter runs preserve original test-selector/navigation assertion failures alongside their affected successful reruns. All accepted browser scenarios now pass. The 23-screen phone/iPad gallery is retained at `.local/table-device-preview/index.html`.
