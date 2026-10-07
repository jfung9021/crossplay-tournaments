# Portrait UI and tournament management implementation plan

Date: October 8, 2026

Status: Implemented and automated acceptance passed October 8, 2026; see [release evidence](portrait-lifecycle-release.md). Physical Safari acceptance remains pending. The planning-scope references below describe the original investigation.

Make portrait iPhone and iPad use the primary design target for tournament setup, finding a table, running its match, reporting scores and reviewing standings. Add reversible archiving from any tournament state, permanent deletion, and reset to an editable draft. The portrait changes focus on larger touch targets, less navigation before the current match, and a full-width primary workflow on iPads. Preserve the existing face-to-face clock layout.

This plan supplements [the accepted application specification](implementation-plan.md) and [the implemented October 6 UI improvements](ui-improvements-release.md). It preserves their gameplay rules and proposes the lifecycle interface extensions below. Three subagents investigated the portrait work. The subsequent lifecycle investigation inspected the app and both canonical Crossplay SQL migrations. Source findings refer to app commit `6a9e169`; portrait renderings are retained October 6 screenshots.

The user confirmed on October 8 that reset keeps the current players and settings, and archiving must work for draft, active and finished tournaments with an option to restore them. These lifecycle additions require a migration owned by `C:/Users/jfung/bite-open-card-draw`; implementation and deployment are not part of this planning request.

## Findings and priorities

| Priority | Current behavior and evidence | Planned adjustment |
| --- | --- | --- |
| P1 | Ordinary buttons are at least 40px tall, fields 42px and text buttons 32px. Inputs inherit 15px body text. Navigation and disclosure targets have no consistent minimum. See `src/app/globals.css:3–11,29–30,44,110,116`. | Establish a 44px minimum touch target and 48px primary action height. Use at least 16px editable field text. Apply this to phone and tablet layouts. |
| P1 | The 760px breakpoint leaves the fixed 310px sidebar beside settings on portrait iPads. After margins and the 32px column gap, the main form is only 362px wide at a 768px viewport and 414px at 820px. The 820×1180 settings screenshot confirms the narrow form beside the copy-settings panel. See `globals.css:49,125–130` and `tournament-app.tsx:244`. | Keep settings and roster in one primary column throughout tablet portrait, including 1024px width. Put secondary content below the primary task. |
| P1 | On the retained 390px phone screen, Round 1 begins around y390 and the first card around y537. Header, backlink, metadata, title, Manage button, tabs and round links precede the table and match. See `tournament-app.tsx:181–183,284–288`. | Compact the tournament heading and navigation. Put the current table and its match before historical round navigation. |
| P2 | The draft roster renders Add players after the complete roster and optional player access when columns stack. Rename places input, Save and Cancel in one unwrapped row. See `tournament-app.tsx:207–209,226`. | Move bulk addition to the beginning of the roster workflow and stack phone rename fields above their actions. |
| P2 | The clock already uses top/bottom panels, an inverted upper panel, `100dvh`, safe-area padding and 44px buttons. Its Tournament link and the report's Back to tournament link lack equivalent target sizing. See `match-clock.module.css:1–19`, `match-clock.tsx:213` and `shared-match-report.tsx:59`. | Preserve the clock composition and enlarge its navigation targets. Verify busy and recovery states within the same portrait layout. |
| P1 verification | Current projects use Desktop Chrome and Chromium. The nine-size clock geometry loop checks the ready screen; changing viewport dimensions does not establish touch or Safari coverage. See `playwright.clock.config.ts:15–16` and `tests/e2e/clock/shared-clock.spec.ts:149–156`. | Add a focused portrait gate in Chromium and WebKit, with touch-enabled device contexts and representative state checks. Keep physical Safari checks separate. |

The retained phone standings and shared score sheet are readable. They need touch and long-content verification, not a replacement design. Long-name overflow, keyboard-induced zoom and short-screen recovery collisions have not been reproduced; do not describe them as existing defects or build new controls to fix them without evidence.

Representative evidence under `.local/evidence/clock/`:

- `1a10f9d66e3_7ce08ac7/ui-workflow/ipad-locked-settings.png`: portrait tablet settings with competing sidebar.
- `1a10f9f1b9b_380fca68/ui-workflow/phone-external-score-entry.png`: phone heading, round controls and score entry.
- `1a10f9f1b9b_380fca68/ui-workflow/phone-final-standings.png`: existing compact four-column standings.
- `1a10f992dda_8f234e1a/layout-320x568.png`, `layout-768x1024.png` and `layout-820x1180.png`: existing ready-clock layouts.

## Layout and interaction contract

Use available CSS width for ordinary layout decisions. Use orientation only where the table-facing clock or portrait tablet arrangement needs it. Do not infer device type from user-agent strings or lock screen orientation. Landscape and desktop remain usable compatibility layouts.

| Surface | iPhone portrait | iPad portrait |
| --- | --- | --- |
| Page shell | Compact heading, roughly 16px side gutters, wrapping actions and a short route to the current task. | Roughly 24px side gutters and a centered reading width. Give the main task the available width instead of reserving a fixed sidebar. |
| Settings | One main column; stack field pairs below 480px except the short score/overtime pair where both remain readable. | Main form up to approximately 720px wide; short field pairs can share a row. Copy settings follows the form. |
| Current table | Round and table selector, both names, match status and the state-appropriate action form one compact sequence. | The same sequence in a comfortably sized card. Keep the complete match list in table order for All tables. |
| Roster | Add players near the start; rename input above Save and Cancel. | Add players and roster in the same reading order, with adequate input width. |
| Clock | Two large stacked player panels around the center controls; upper content faces the opposite player. | Preserve the same arrangement, using the larger display for legibility and large tap areas. |
| Shared score sheet | One player card per row; full-width primary action and scrollable page content. | Keep the existing two-card layout when each card has sufficient width; secondary actions may wrap. |
| Standings | Retain Rank, Player, Points and Difference with wrapping names and stable numeric alignment. | Retain the same four columns and more breathing room. |

Use a single main column for task-plus-sidebar layouts below 1100px. This includes all portrait tablet targets in this plan and narrow split views. Keep the existing desktop arrangement above that threshold. This breakpoint is a starting implementation value; adjust it only if the specified acceptance sizes demonstrate a better boundary. Do not indiscriminately collapse every two-field grid or the tablet score cards.

Interactive buttons, form controls, navigation links used as controls, disclosure summaries and checkbox labels should expose at least a 44×44 CSS-pixel target. Primary Start Match, Continue match, Report scores, Review scores and Save actions should be at least 48px tall. Ordinary inline links in prose need not become block buttons. Maintain visible focus, accessible names and enough separation for adjacent actions. These sizes are this project's acceptance targets.

Increase editable field text to at least 16px, retaining the shared score inputs' existing 20px text. Preserve pinch zoom and text enlargement. Keep labels and errors beside their fields. Forms use normal document scrolling; a fixed action bar is not part of this phase. Preserve the current duration text keyboard so users can enter the colon in `m:ss`. Check signed scores on actual Safari before considering any keyboard-specific change.

## Screen changes

### Tournament navigation and current match

Reduce the vertical margins around the backlink, metadata, tournament heading and tabs. Keep Manage, Rules and Standings available and large enough to tap. Let long titles and actions wrap without overlapping.

On the active public tournament view, show the round heading, table selector and selected match before historical round links. Omit round navigation when only one published round exists. For multiple rounds, put the existing links in a clearly labeled Rounds disclosure after the current match section. Historical round pages retain direct access to other rounds and do not change the remembered table.

Keep the current state-dependent action labels and missing-table message. Table selection remains a browser preference keyed by tournament ID. It must not hide unresolved matches on the organizer overview. Preserve a signed-in player's own-match priority and final standings first on finished or archived events.

With ordinary fixture names, a tournament title of at most two lines and a remembered table, the current round, selector, both opponents and primary match action should fit without scrolling at 390×844. At 375×667, prioritize the same sequence with minimal scrolling. Long valid names may increase height; readability takes precedence over a rigid fold target.

### Settings and roster

Put the copy-settings panel below the settings form. Keep the form at a readable maximum width and maintain the existing explicit timer mode, exact duration parsing, locked competitive settings and save feedback.

For draft rosters, place a single Add players disclosure before the roster, initially open for an empty roster and otherwise collapsed. Preserve entered names if the disclosure is toggled. Keep the count and batch validation inside it, and keep optional individual player access below the roster. Use one DOM instance so keyboard and screen-reader order match the visible order.

Below 480px, put the rename field on its own full-width row, with Save and Cancel beneath it. Preserve all draft versus active permissions, atomic batch addition and existing error behavior.

### Clock and reporting

Retain the inverted upper clock panel, Flip sides behavior, current active-panel tap logic and landscape option. Enlarge the Tournament and Back to tournament link targets without turning them into competing primary actions. Preserve the current safe-area padding and dynamic viewport sizing.

Measure ready, running, paused, overtime and recovery states after target sizes change. Fit normal live-clock controls and readable player/time content into the target portrait viewport without scrolling. Recovery messages must remain readable and controls reachable; if those states exceed available height, allow deliberate scrolling rather than clipping a message or shrinking the clock beyond legibility. Adjust spacing only where the measurements show a failure.

Keep score entry in normal scroll flow, with both named agreements and their current invalidation after edits. Ensure long names wrap in agreement buttons. Preserve entered scores during transient errors, automatic overtime, organizer correction reasons and the authoritative final result.

Do not add `viewport-fit=cover` solely to satisfy this plan. Safari's default insetting and an edge-to-edge viewport have different safe-area responsibilities; the current app already adds clock/report inset padding. If implementation changes viewport coverage, update the whole page shell and verify all affected screens together. [WebKit's safe-area guidance](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) explains that relationship.

## Archive restore reset and permanent deletion

### Current behavior and implementation constraints

The app already offers Archive tournament after finishing and Show archived on the organizer list. Archiving hides the event from the normal rendered lists but leaves its published history accessible by URL. There is no restore, reset or delete command. Reopen results returns a finished event to corrections-only mode; it does not unlock the roster. Copy settings creates a different tournament without players or results.

The app command allowlist is in `src/server/validation.ts:19–39`; organizer controls are in `src/components/tournament-app.tsx:307–343`. The canonical base migration, `20260928010000_crossplay_schema.sql`, permits archive only from finished at lines 458–460 and locks roster changes using both `status` and `started_at`. Merely changing status to draft would leave settings locked and historical results in place.

Deletion cannot be a single unqualified tournament-row delete. The base migration contains non-cascading references from staff, entrants, rounds and audit events, plus circular match/report/result pointers. The clock migration, `20260930020000_crossplay_shared_clock.sql`, adds clock events and report-clock metadata with non-cascading dependencies. Its `crossplay.execute` wrapper also protects clock reporting before calling `execute_base`; preserve that wrapper behavior when extending lifecycle commands.

The shared request ledger stores responses without a tournament foreign key. Clock responses can contain player names, times and scores. It therefore needs explicit handling during permanent deletion and reset, as well as the ordinary gameplay tables. Current clock clients also do not consistently treat a 404 as terminal, and tournament refresh retains the old snapshot on an error. Those paths must change when tournaments or matches can disappear intentionally.

### User facing behavior

| Action | Available from | Result |
| --- | --- | --- |
| Archive tournament | Draft, active or finished | Hide from ordinary lists, preserve the roster, settings and published history, and suspend tournament writes. Remember its previous state. |
| Restore tournament | Archived | Return to the remembered draft, active or finished state. An existing corrections-only flag is preserved. Previously running clocks remain paused pending time review. |
| Reset tournament | Draft, active, finished or archived | Keep the tournament and current roster/settings, discard all play, and return to an editable draft with Round 1 next. |
| Delete permanently | Any state | Remove the tournament and its associated application records. Its old tournament and match URLs become unavailable. No in-app undo. |

Archived events stay accessible to their organizers through Show archived. Preserve the existing public-history convention for previously published events: they remain read-only by their direct URL. An archived draft must remain private. Exclude archived events from the public collection response as well as the rendered list. Use Archive copy that explicitly says published links remain accessible; archive is not a privacy setting.

An archived active event must say Archived tournament and Standings at archive, rather than Tournament complete or Final standings. An archived finished event can retain Final standings. Restore does not finalize unresolved matches, reopen finished results or automatically resume a timer. An unpublished pairing preview may be discarded on archive and regenerated after restore; published assignments and results are preserved.

Put these controls in a collapsed **Tournament actions** section on organizer settings, available in every state, including read-only finished/archived settings. Replace the existing duplicate archive entry with a route to this section or the same action component. Use **Archive tournament**, **Restore tournament**, **Reset tournament** and **Delete permanently** as distinct labels. Keep them out of table match cards and the ordinary player workflow.

Reset and delete first show a portrait-friendly inline confirmation with the tournament name and the affected player, round and match counts. Require the exact current tournament name before the destructive button enables, and validate it again on the server. Reset copy states that players/settings are kept, withdrawn players return to the draft roster, all match play is discarded and private player access must be reissued. Delete copy states that the roster, results and history are removed. Cancel performs no mutation. Confirmations remain scrollable when the keyboard is open; do not depend on native `window.confirm`.

Archive and restore do not require typing the name. Archiving an active event shows a concise confirmation explaining that table clocks and submissions stop, and unfinished clock control must be re-established after restoration. Archive preserves recorded history; it cannot capture unsent changes from an offline device.

### Reset contract

Reset runs as one server-authorized database transaction:

1. Preserve tournament ID, slug, name, date, current config, tournament seed, creation time and staff membership. Keep current entrant IDs, names and seed order; reactivate retained withdrawn entrants so the draft roster can be edited normally. Do not resurrect entrants previously removed from the database.
2. Delete every draft/published/completed round, match, match side, report, result revision, shared acknowledgement, clock session/event, match credential/session, starter record and first/second-start accounting record belonging to that tournament. Invalidate all entrant invitations and player sessions as well. Other tournaments and the shared organizer account are unaffected.
3. Set `status='draft'`, clear `started_at`, `finished_at`, `frozen_config` and archive metadata, and set `corrections_only=false`. Increment the tournament version; never reset it to zero. Add/increment a `run_generation` value so open screens can recognize a new run of the same tournament.
4. Preserve organizer audit history and append a reset record with actor, timestamp, prior state, generation and removed-record counts. Previous audit entries do not contribute to player history, standings, pairing or starter counts. Reset is not the permanent-erasure action.
5. Return the resulting ID, slug, version and generation, refresh the snapshot and navigate to Players. Remount stale settings, result and match-entry state for the new generation. Show **Tournament reset. Edit players and settings, then preview Round 1.**

The preserved config is the config currently saved, including its numeric round count. Publication currently replaces Automatic with the resolved count in `config`; the original choice cannot always be recovered. Do not guess it. The reset draft unlocks Rounds so the organizer can choose Automatic again or set a different count. Unchanged roster/seeds and settings should produce the same deterministic first-round pairings; reset does not silently randomize seeds.

Standings after reset have zero played matches, points and difference for the retained roster. Player history and previous-opponent/bye/starter history are empty. New rounds and matches receive fresh IDs. Old invitations, confirmations, clocks and offline journals can never address the new matches. The physical-table preference may remain because it identifies the table, not the old match; the existing missing-table behavior still applies after roster changes.

### Archive and restore contract

Add `archived_from_status` and `archived_at` to the private tournament record, constrained consistently with `status='archived'`. Backfill existing archived tournaments as previously finished: the current SQL only permits that transition. Include enough metadata in the read model to distinguish archived drafts, active events and completed events without exposing internal authorization data.

Archive locks the tournament and affected matches in the same order as existing writes, records the prior status, removes any unpublished preview, and changes status atomically. It must not resolve reports, invent results or mark an unfinished event complete.

For unfinished matches, invalidate outstanding match writes by advancing their revisions and invalidate table clock controllers by revoking their match credentials/sessions and advancing clock epochs/versions. Preserve saved times, reports and acknowledgements. A recorded running clock becomes paused with its anchor cleared and timing review required, using the existing takeover/review semantics; do not fabricate an exact elapsed interval for an offline device. Ready/paused clocks with a controller also require reconciliation where unsent activity cannot be excluded. Ended, submitted reports retain their recorded times and report content. Keep entrant identities and player invitations; claims and submissions remain blocked while archived.

Restore returns to `archived_from_status`, clears archive metadata, advances version and records the action. It restores access to the appropriate draft workflow or tournament view. It never resumes a running clock: table devices re-enter through Start Match, and any flagged time is reviewed through existing organizer controls before resuming. Generate a fresh preview if archiving discarded one. Closed or revoked credentials do not become valid merely because the event was restored.

Update archived read/write handling together. The current clock read returns `canControl` without checking tournament state; add the state to the response and ensure archived/finished reads cannot offer live controls. The current UI groups all archived events with finished events; use the remembered state for headings and read-only presentation. At the database boundary, reject every gameplay/settings/roster write while archived, allowing only lifecycle actions, authorized reads and the existing copy-settings operation.

### Permanent deletion contract

Use a true deletion of live application records, not another hidden status. The delete transaction removes all tournament-owned gameplay and access rows listed for reset, then entrants, staff assignments, audit events and the tournament row. Organizer/Auth accounts are shared and must remain. Tournament and match IDs must never be reused.

Use a deliberate dependency order: clear current-report/official-result pointers, delete report-clock metadata and clock events, delete reports and result revisions, then delete rounds/matches and their cascading clock/start/session rows. Clear entrant credentials/sessions before deleting entrants; clear audit/staff rows before the tournament. Verify the full set against the actual migration schema when implementing; do not replace foreign keys with broad cascades merely to simplify the operation.

Remove stored request responses that contain this tournament's names, scores, time records or access data. Keep only minimal request receipts needed to prevent destructive-command retries or old create/copy requests from running again. A receipt may contain an opaque tournament ID, organizer/request identity, fingerprint and outcome, but no roster, scores, credentials or recoverable tournament snapshot. Do not insert a normal tournament audit event after its referenced tournament has been deleted.

After successful deletion, navigate directly to Your tournaments with a success notice. Do not call the generic refresh-the-deleted-tournament path. Open clients clear stale rendered records on authoritative unavailability and show a neutral unavailable message with a safe route back. Permanent deletion covers the live app data; it does not claim to erase database backups or copies already downloaded to another device.

### API transactions and replay protection

Reuse `POST /api/tournaments/[id]/commands`, the existing same-origin check, verified organizer identity and restricted runtime SQL interface. Add the following strict payloads. All four commands require `requestId` and `expectedVersion`; the server injects tournament ID and verifies existing tournament staff authority. Player and match sessions cannot perform them.

| Command | Payload | Response behavior |
| --- | --- | --- |
| `archive_tournament` | `{}` | Broaden to draft/active/finished and return updated lifecycle state. |
| `restore_tournament` | `{}` | Restore only an archived tournament; return updated state. |
| `reset_tournament` | `{confirmationName}` | Return `ok`, ID, slug, draft status, incremented version and generation. |
| `delete_tournament` | `{confirmationName}` | Return `ok`, deleted ID and `deleted: true`; no subsequent snapshot read. |

An optional organizer-only lifecycle summary in the snapshot can supply confirmation counts and action availability. It is display data; the database rechecks the latest name, state and version inside the transaction. Live-clock activity can change without incrementing the tournament version, so lock and re-read affected matches/clocks as well. Confirmation copy must cover all active clocks rather than rely on a stale displayed count.

Keep the gameplay lock order of tournament before match before clock/credential rows. Normalize invitation-claim paths to that order and recheck state/access under the lock; the current player invitation claim only locks its credential and reads the tournament without a lock. Keep advisory-lock acquisition consistent across the command wrapper and replay path to avoid an inversion. Serialize lifecycle request replay with an actor/request advisory lock and a fingerprint covering command, target, payload and expected version. A lost response followed by the exact same reset/delete request returns the original minimal success receipt without repeating the operation; reuse with a different payload fails. A different stale request returns a conflict. Recheck row existence after waiting for locks, including clock commands that looked up a match before reset/delete committed.

Add explicit tournament/generation association to new request receipts. Backfill legacy association where it can be determined from response tournament IDs, created IDs or round/match references. Unattributable legacy generic `ok` receipts contain no tournament content; do not purge unrelated receipts by actor or time. Before deleting dependent rows, identify all attributable clock/report responses so cleanup does not lose the relationship needed to remove them.

Retire prior-run gameplay responses on reset and preserve rejection markers where removing a receipt could re-execute an old request. Deleted create/copy targets require the same protection against resurrection. An obsolete report/clock request must not replay a cached pre-reset snapshot or return a misleading fresh success. Use the retained minimal lifecycle receipt for duplicate reset/delete success even after the tournament row or original state has gone. This behavior needs focused tests for both ordinary and clock request paths.

On the client, use the generation/version and request sequencing to ignore snapshot responses started before a successful lifecycle action. Treat authoritative match removal as terminal in clock initialization, flushing and reconciliation; stop input and retries and release the local tab/wake lock. Clear the affected local journal/controller data when removal is confirmed, not on a transient network failure. Other offline devices can only discard their old data after reconnecting; the server rejects their old writes immediately once reset/delete commits.

### Migration ownership and release order

Create one new canonical migration and its focused tests in `C:/Users/jfung/bite-open-card-draw/supabase/`. Do not edit the two already-applied Crossplay migrations or introduce another migration history in this app. Extend the existing command wrapper/base functions, private read model and clock guards deliberately; retain server-only actor verification, ACLs and existing clock/manual-report protections.

Expose an additive lifecycle capability/version check, keeping the existing base and clock version contracts compatible. Gate new actions on that capability so app code deployed ahead of the migration shows them as unavailable and ordinary tournament use continues. Update `docs/integration-contract.md`, `docs/clock-integration-contract.md`, app types, validation, error mappings and database adapter when implementing, not by claiming these interfaces exist now.

The database-owning repository requires a scoped migration plan and checklist, focused tests for the new SQL, read-only target/parity verification and a reviewed push dry-run. It specifically excludes unrelated application suites, older migration test suites and full shared-database resets for migration-only work. App tests remain this repository's responsibility. Extend the existing isolated app runner to apply the new canonical migration and record its capability/hash; its current hard-coded two-migration setup will otherwise test an obsolete schema.

Release the additive migration before enabling the app controls, then run the focused app acceptance below. Rollback disables the new controls while retaining the additive schema; it cannot undo a completed reset or deletion. Because older UI assumes every archived event was finished, a rollback after archiving unfinished events must retain the small archived-state compatibility fix or disable those views. An unmodified old app is not a safe rollback target for that new data shape.

## Implementation order and ownership

| Step | Owner and files | Completion criterion |
| --- | --- | --- |
| 1 | Database owner: new migration, focused SQL/concurrency tests and migration plan in `C:/Users/jfung/bite-open-card-draw`; coordinate the proposed contract here. | Lifecycle semantics, cleanup, replay and concurrency gates pass; additive capability ready. |
| 2 | App integration owner: `src/server/validation.ts`, `src/server/tournaments/service.ts`, `src/server/db/client.ts`, `src/server/errors.ts`, domain/clock snapshot types and the two integration-contract documents. | Capability-gated commands, correct responses and terminal-state handling match the SQL contract. |
| 3 | Layout owner: `src/app/globals.css`; inspect `src/app/layout.tsx`, changing it only if required. | Touch sizes, field text, compact headings and main-column tablet layout established. This work can proceed independently of the SQL. |
| 4 | Tournament UI owner: `src/components/tournament-app.tsx`; focused action component and selector/access components only if needed. | Portrait layout, Tournament actions, confirmations, archive restoration and reset/delete navigation meet acceptance. |
| 5 | Clock/report owner: `match-clock.module.css`, `match-clock.tsx`, `shared-match-report.tsx`, `src/client/match-clock-api.ts` and local clock storage only where needed. | Portrait targets pass; archived or removed matches stop accepting local actions and stale writes. |
| 6 | Integration owner: focused browser tests, device-context helpers, Playwright configuration, `scripts/run-local-swiss20.mjs` and evidence summary. | New migration loaded by local fixtures; portrait and lifecycle gates pass; hardware gaps recorded precisely. |

Give each overlapping stylesheet and `tournament-app.tsx` one editor. Establish shared sizes before integrating screen changes, and settle the lifecycle response contract before wiring destructive actions. The portrait work remains primarily CSS and presentation; the lifecycle work includes the explicit server/database/client-state changes above. Avoid routing rewrites, unrelated component extraction or dependency upgrades.

## Acceptance and verification

Use the existing isolated local database and Auth harness. Add a focused `tests/e2e/clock/portrait-ui.spec.ts` suite with `PORTRAIT` scenario titles and narrowly scoped portrait projects in `playwright.clock.config.ts`. Reuse current tournament helpers and independent scoring calculations. New device projects in both engines should match only the portrait suite, so they do not multiply the entire 60-match tournament or recovery/security suite; exclude that suite from the existing general project to avoid duplicate executions.

Device settings must reach every browser context used by these scenarios, including helper-created contexts. Several helpers currently hard-code 390×844 or 1180×820 through `browser.newContext`; a project label alone will not change those contexts. Pass the intended device options explicitly or use the configured context fixture. Configure mobile/touch behavior as well as viewport size, following [Playwright's emulation documentation](https://playwright.dev/docs/emulation).

| Gate | Sizes in CSS pixels | Coverage |
| --- | --- | --- |
| Primary phone | 390×844 | Complete focused portrait workflow in Chromium and WebKit with touch. |
| Primary tablet | 820×1180 | Same focused workflow in Chromium and WebKit with touch. |
| Layout boundaries | 375×667, 430×932, 768×1024, 1024×1366 | Layout/state checks and representative screenshots; no repeated full tournament simulation. |
| Narrow compatibility | 320×568 and 507×768 split view | No page overflow; fields/actions remain readable and reachable with vertical scrolling where appropriate. |
| Landscape compatibility | 844×390 and 1180×820 | One focused check of clock orientation/controls and ordinary navigation. |

Required assertions and evidence:

1. No horizontal page overflow on current-table, settings, roster, rules, history, standings, clock or report screens. Check controls and content bounds as well as document width so hidden overflow cannot mask clipped content. Ordinary pages may scroll vertically.
2. Measured touch targets meet the contract, focused controls remain visible and touch taps activate the intended action. Check the clock panels for overlap with center controls. Preserve keyboard navigation and test enlarged text at 200% on representative forms and navigation without clipping.
3. At 390×844 the ordinary selected-table fixture meets the initial-viewport target. At tablet portrait sizes the settings form has no side-by-side copy panel. Historical rounds remain reachable without preceding the selected match.
4. At 20 and 256 roster entries, Add players stays at the start of the roster workflow. Rename, validation and an unsuccessful submission preserve their existing behavior. Use existing helpers or local test data setup; do not create a new tournament simulator.
5. Include the accepted 80-character entrant and 120-character tournament name limits, a long unbroken name and representative wide text. Preserve complete accessible player names and distinguish both agreement controls. Keep all four standings values legible; do not hide Difference to make a screen fit.
6. Check ready/running/paused/overtime and disconnected or review-required clock states at phone and tablet portrait sizes. Verify Flip sides, pause/resume, End game and return navigation without controller or time changes caused by layout.
7. Complete one app-timer match per primary browser/device profile through score entry, edit and both acknowledgements. Check one external-timer result and one organizer correction using existing revision/reason protections. The 401–399 score with 0:20 overtime must still finalize as 397–399. Verify the final standings and history agree.
8. Confirm that table persistence, missing-table recovery, the full organizer overview and finished standings order survive the presentation changes. Reuse existing focused scenarios rather than duplicating their detailed assertions.

Run app lint, TypeScript, unit tests and a production build once after integration. Run the portrait and lifecycle gates plus directly affected existing UI/settings/reporting scenarios. Because the combined lifecycle work changes shared command guards and clock reconciliation, run the established 20-player, six-round app scenario once as the normal-play regression gate. Do not multiply it by viewport or browser engine. A separate portrait-only implementation phase would not require another numerical simulation. These app checks do not override the database owner's migration-only testing exception.

The current harness supports filtered runs, for example `npm run test:e2e:clock -- --grep "PORTRAIT|UI-WORKFLOW"` after the new suite exists. Expand the filter only for directly affected existing scenarios. Retain viewport screenshots, geometry results, browser/project identities and functional results under a new ignored evidence directory. Exclude private invitations, passwords and Auth fixture contents from screenshots or shared reports.

On a physical iPhone and iPad in Safari, reuse the [existing physical-device checklist](smoke-test-checklist.md#physical-phone-and-ipad-checks). Verify portrait use with browser bars shown and hidden, the keyboard open on both score fields and duration/reason fields, scrolling to errors and actions, pinch zoom, and the prescribed pause/background/return checks during a match. Confirm negative score entry and colon entry without changing the accepted numeric contract. Emulation cannot substitute for this check. If hardware is unavailable, automated acceptance can be reported separately; physical Safari acceptance remains pending.

### Lifecycle acceptance

Add a focused lifecycle browser spec and server-boundary tests here, with the new migration's SQL/permission/concurrency tests in its owning repository. Use disposable local events only. Exercise the full data/state matrix in SQL; use a short two-device browser fixture for interaction and stale-screen behavior. Do not replay every lifecycle variant on every viewport.

| Check | Required result |
| --- | --- |
| Archive and restore | Draft, active and finished events return to their original state, with retained roster/settings/published results. Test an active unresolved/disputed event and a legacy archived finished event. Archived drafts remain inaccessible publicly; published archive links remain read-only; ordinary public lists omit archives. Unfinished archives never claim final standings. |
| Archive during a live clock | Running time is not fabricated or automatically resumed. Controllers are invalidated; saved milliseconds/report content are retained; restoration requires the prescribed review and fresh control entry. An offline old controller cannot append into the restored clock epoch. |
| Reset in every state | Draft previews, active play, finished and archived events all become editable drafts. IDs/name/date/config/seeds/staff/retained players stay as specified; withdrawn players reactivate. All prior gameplay/access rows are cleared, statistics are zero, and version/generation increase. Audit records show reset. |
| Fresh play after reset | Add, rename and remove players; edit locked rules; generate and publish Round 1 and finish a short new match. No prior rematch/bye/starter constraint or old result survives. Current numeric round count is retained until explicitly edited. Unchanged inputs remain deterministic. |
| Delete completely | Test a draft and an event containing clock events, reports, revisions, credentials, sessions, starter accounting and audit records. Assert no dependent live records or sensitive cached responses remain. Shared Auth users, unrelated tournaments and their request receipts remain unchanged. Old public/admin/match URLs are unavailable. |
| Authority and confirmation | Anonymous, entrant, shared-table session and unrelated organizer attempts fail. Authorized tournament staff can act. Wrong/missing name confirmation, stale expected version and invalid source state fail without partial changes. A renamed event cannot be deleted under an old confirmation. |
| Retry and rollback | Simulate a lost response and replay the same archive/restore/reset/delete request. No second mutation or duplicate audit record occurs. Retry reset after new rounds exist: it must not clear those rounds again. Retry delete after removal succeeds only through the original authorized receipt. Changed payload fails; old create/copy retries cannot recreate deleted data. An injected transaction failure leaves the prior state intact. |
| Concurrent devices | Race reset/delete/archive with report submission, round publication, clock append/open and invitation claim. Verify serialized outcomes, no orphan/session recreation and no accepted write into a new run. Include a clock request that resolved its match ID before the lifecycle transaction committed. |
| Client recovery | Test an already open tournament, score form and clock while a second organizer resets/deletes/archives. Ignore late old responses; stop invalid clock controls and retry loops; show the correct archived/draft/unavailable screen. A temporary network failure still preserves local entries. |
| Portrait controls | On primary phone/tablet profiles, expand Tournament actions, cancel once, enter the name, reset to Players and delete back to Your tournaments. Archive/restore are reachable through Show archived. Confirmation and errors remain reachable with enlarged text and the keyboard open. |
| Migration compatibility | Without the new capability, ordinary tournament use still works and new actions are unavailable. With it, actions operate through the restricted runtime role. Verify capability metadata and legacy archive backfill; document the archived-state rollback requirement. |

Lifecycle browser scenarios can use a `LIFECYCLE` title prefix and the existing guarded runner's filter. Configure the two primary portrait profiles to run the compact actions scenario only; keep deeper lifecycle cases in their focused project so adding WebKit does not duplicate concurrency fixtures or the long tournament scenario.

## Scope and stopping point

Preserve pairing determinism, standings arithmetic, verified session authority, precise clock storage, idempotency, transactional revisions and current score-confirmation rules. Lifecycle actions intentionally clear or suspend the specific state described above. Their implementation requires the new database migration, but this planning task performs no migration, account change, tournament mutation or deployment. Native app conversion and a PWA installation flow remain outside scope.

The planning investigation used source, canonical SQL and retained renderings; no fresh live-browser workflow or database mutation ran. During the portrait investigation, the verification subagent found no local preview listener and the Docker daemon unavailable. Recheck those prerequisites before later isolated runs; they do not block delivery of this plan. Actual Safari keyboard and sleep/wake behavior also remain unverified, as recorded in the existing release notes.

Implementation is complete when the listed changes and directly relevant checks pass. Perform at most one general review after integration. If it reveals a proven regression caused by this work, make one focused repair and rerun only affected verification; do not restart the review. Record unrelated observations without editing them. Do not expand the plan into a standings redesign, custom keyboard or clock redesign unless a direct acceptance failure establishes the need.
