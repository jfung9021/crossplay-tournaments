# Portrait UI and tournament management

Implementation and automated acceptance completed October 8, 2026. Physical Safari acceptance remains pending. Release target: [Crossplay tournaments](https://crossplay-tournaments.vercel.app/).

Phone and portrait tablet workflows now use larger touch targets, 16px fields, compact navigation and a single settings column below 1100px. The current match precedes historical round navigation. Add players appears before the roster; phone rename actions wrap below the field. Face-to-face clocks retain their orientation and allow deliberate scrolling for exceptionally long names on short screens.

Settings now includes Tournament actions. Organizers can archive any tournament, restore its prior state, reset to an editable draft while retaining current players/settings, or permanently delete it. Reset/delete require the exact current name and show affected counts. Archived drafts stay private; published archive links remain read-only; unfinished archives never claim final standings. Reset clears play and private access, reactivates retained players, and returns to Players. Delete returns directly to Your tournaments. Old open forms and clocks recognize reset/deletion and discard obsolete state.

## Verification

- ESLint, TypeScript, production build and all 185 unit tests across 14 files passed.
- Twenty distinct browser scenarios passed across the retained runs below. Focused reruns covered evidenced failures or affected layout changes; the full numerical tournament was not multiplied across browser profiles.
- Phone 390×844 and tablet 820×1180 touch workflows passed in Chromium and WebKit: setup, rename, settings, current table, ready/running/paused/overtime clocks, side flipping, score edits, named agreements, standings and all lifecycle controls. Each finalized 401–399 with 0:20 overtime as 397–399.
- Boundary geometry passed at 320×568, 375×667, 430×932, 507×768, 768×1024, 1024×1366, 844×390 and 1180×820. Normal clocks retain the existing nine-size fit check. Long 80-character names, 120-character tournament titles, 20/256-player rosters, 200% text, forms, navigation, rules, standings and history were checked for overflow and reachable controls. Names and times remain within their clock panels; small screens scroll when necessary.
- The 20-player, six-round event completed all 60 matches through ten concurrent shared clocks. Pairings, scores, standings and starter accounting matched independent reference calculations and persisted across a server restart. Nine independent devices, remembered tables, missing-table recovery and unavailable local storage passed.
- Existing duration settings, precise organizer corrections, external reporting, invitations, final standings, refresh/pause, offline events, lost responses, controller revocation and revised score acknowledgements passed.
- Remote reset removed open score forms and made the old clock terminal. A delayed old snapshot did not revive the previous run. Replaying the original reset after new play preserved the new round. Wrong-name deletion failed; successful deletion made old URLs unavailable. Archive/restore checks included draft privacy, live clock suspension, public list exclusion, unfinished standings and organizer time review after restoration.
- Capability tests verify that ordinary reads/writes remain available before the additive migration while lifecycle commands return unavailable. New command validation rejects missing confirmation and injected actor fields.

## Database release

Canonical migration `20261008010000_crossplay_lifecycle.sql` is owned by `C:/Users/jfung/bite-open-card-draw`. [PR 167](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/167) passed focused CI and merged as `9b1f7aa`; [PR 168](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/168) records deployment verification. The verified dry run listed only this migration, which was applied to the established project `gsiyqhkcgegjrvqcqioc`. Local/remote migration histories match.

The new migration's SQL checks and six observed-lock races passed against an isolated PostgreSQL 17 database. Checks cover state transitions, permissions, cleanup/rollback, retained precision, report bindings, retry retirement and unrelated data preservation. Races cover reset/delete/archive against event append, report submission, publication and invitation/control claims. No shared database reset or unrelated sibling test suite ran.

Read-only hosted verification confirms base `20260928010000`, clock `20260930020000`, lifecycle `20261008010000` and the restricted runtime boundaries. Internal helpers remain inaccessible to runtime/browser roles. Verification did not mutate production tournament data. App rollback must retain archived-state compatibility; completed reset/deletion cannot be undone by rolling back the app.

## Evidence and review

Ignored evidence directories under `.local/evidence/clock/`:

| Run | Evidence |
| --- | --- |
| `1a1186b821d_ab7095c9` | Initial eight passing scenarios, portrait boundary matrix, large roster and enlarged text; initial failure diagnostics retained. |
| `1a1186ed479_6ed497fd` | Archive/restore, table preferences, complete 60-match event and Chromium phone/tablet workflows passed; fixture assertion failures retained. |
| `1a118702bbb_6df05dd2` | Remote reset/deletion and both WebKit portrait workflows passed. |
| `1a1187103de_1dddc13c` | All five existing clock recovery/security/report-correction scenarios passed. |
| `1a118724d41_7537da9f` | Reproduced long-name clock overflow at 320px. |
| `1a11872f0a4_b70ed696` | Focused final layout verification: all four touch profiles, long names/agreements/history, nine-size clock geometry and precise corrections passed. |

The intentionally skipped duplicate boundary scenarios do not represent failed coverage: the boundary matrix runs once while the complete touch workflow runs in all four profiles. WebKit on this Windows host reports zero `maxTouchPoints`; actual trusted touch events and successful touch actions were verified instead of treating that property as proof of emulation.

One general app review was performed. Its focused layout repair addressed reproduced long-name clock overflow and the explicit 48px submit-action requirement. Only affected layout checks ran afterward; no second review was performed. Initial acceptance also exposed response-order handling under concurrent clocks and organizer review hidden by a revoked table cookie; those were corrected and verified. WebKit sign-in now waits for initialization before accepting input. The table test's pre-existing fixed-number assumption was corrected to account for byes; gameplay numbering was unchanged.

No proven automated blocker remains. Physical iPhone/iPad Safari keyboards, browser bars and sleep/wake remain unverified because hardware is unavailable. The pre-existing nonblocking Vite configuration warning was left unchanged. No production tournament was reset, archived or deleted to test this work.
