# Match entry adjustment

Implemented October 6, 2026, for nine shared devices signed into one organizer account.

The match card now provides **Start Match → Start Timer → End game → Report scores**. A match opens ready, with neither clock counting down. Returning to the tournament and reopening preserves the same controller and any pending score review. Another device opening that match gets a read-only view; it does not take over the clock.

Special timer links are removed from the application: no issue-link command, claim endpoint, fragment exchange, or link creation/copy controls remain. Device credentials are created internally when the organizer opens the match. Existing private SQL capabilities are reused transactionally; no database migration or new player permissions are needed. Optional individual player invitations for manual score reporting remain separate.

Organizer sign-in allows **16 attempts per minute per network address**, as requested. Each signed-in device retains full organizer permissions.

## Verification

- Production build and TypeScript passed; ESLint passed; all 124 unit tests passed.
- All 11 browser scenarios passed in `.local/evidence/clock/1a10f820b73_d7661d7b`, with a real isolated PostgreSQL database and local Supabase Auth.
- Nine independent browser profiles signed into the same account and controlled nine separate matches. Simultaneous entry to one match reserved one controller; another device remained read-only. Retrying a committed entry request after loss of its cookie response restored the original access.
- The old timer claim endpoint returned 404 and the old invitation command returned 400. Anonymous and individual-player match entry were rejected; forged session authority was rejected.
- All 60 matches in a 20-player, six-round event opened from match cards and completed through clock start/switch/end, score entry and both acknowledgements. The tournament reached its finished results page. Independent pairing, starter, standings and score-differential tiebreak checks passed.
- Recovery, offline ending, lost event responses, stale controllers, score corrections, phone/iPad viewport layouts, overtime reversal, and existing manual tournament workflows passed.

The initial nine-device assertion read before a pause finished saving; retained records showed all nine paused. The test now waits for the saved state. Rapid suite sign-ins exceeded the previous cap; the harness now paces suite logins. One focused implementation review found the lost entry-response recovery case, which was repaired and verified. The old generated development route validator was removed after route deletion caused a stale-cache type error. Original failed runs remain retained. No repeated general review was performed.

Physical iPhone/iPad Safari sleep/wake and keyboard behavior remain unverified on actual hardware. The existing nonblocking Vite configuration warning was not changed. No proven automated acceptance blocker remains.

## UI inspection and deferred work

The requested design observations are in [the UI review](ui-design-review-2026-10-06.md). They were not implemented. Inspection used synthetic local acceptance events and changed no tournament data. The earlier demonstration tournament was not reset, and the slow two-round walkthrough remains deferred until the user requests it.
