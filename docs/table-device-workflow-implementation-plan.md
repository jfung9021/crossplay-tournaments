# Table device and tournament workflow implementation plan

Date: October 8, 2026

Status: Approved and implemented October 8, 2026. Covers all twelve investigated issues. Verification and release evidence are recorded in [the release record](table-device-workflow-release.md).

Each shared phone or tablet should have a clear table home, continue naturally from playing to reporting to the next pairing, and be replaceable without losing the match. Organizers should be able to close tables, resolve outstanding work and withdraw departing players while preserving their standings and tournament history.

This plan supplements the [accepted application specification](implementation-plan.md), [application contract](integration-contract.md), [clock contract](clock-integration-contract.md) and [existing portrait requirements](portrait-ui-implementation-plan.md). App code belongs in this repository. Canonical database migrations belong only in `C:/Users/jfung/bite-open-card-draw`.

## Required outcomes and confirmed ranking rule

The user's additional requirement is explicit: a player who leaves early remains ranked at the end based on their earned record, and historical rounds remain available.

The user confirmed the established ranking on October 8: win = 1 match point, draw = 0.5, loss = 0; rank by accumulated match points, then cumulative adjusted score difference, with shared ranks for exact ties. Apply this identically to active and withdrawn players. Withdrawal never moves someone below an active player with a worse record.

For example, a player who withdraws with three wins and one loss retains three points. They may finish above an active player with two points. Their final position can change as others earn points, but withdrawal itself changes neither their points nor their tie-break value. An unfinished match already published for the departing player still needs an actual result or an explicit administrative outcome. Unplayed future rounds add no matches, losses, forfeits or zero scores for that player.

All published opponents, official results, adjustments, acknowledgements and history must remain intact except through existing explicit correction workflows. Neither a change of device nor a move to another physical table may rerun pairings, redraw the starter or reset time.

## Scope and issue coverage

| Issue | Deliverable | Direct acceptance condition |
| --- | --- | --- |
| 1 | A persistent table home and return destination after sign-in | A configured device reopens its event at its assigned table; the organizer overview remains available. |
| 2 | Separate temporary browsing from explicit device assignment | Browsing All tables or another table never changes the assignment. Change table uses the handoff rules below. |
| 3 | Result completion and next-match continuation | After reporting, the table screen shows saved/pending status, then its next available match without a trip through the full list. |
| 4 | Remember clock layout | Face-to-face preference survives reopening; player placement persists for the same match without changing player identities. |
| 5 | Recover unfinished reporting drafts | Reloading restores unsubmitted score/reason fields and requires review if the underlying record changed. |
| 6 | An actionable organizer queue | Filter and open unresolved results, confirmations, disputes, timing reviews and table coverage problems. |
| 7 | Explicit setup continuation | Roster/settings success provides the applicable Add players or Preview round action. |
| 8 | A clear departure workflow | Withdrawn players never enter subsequent pairings, remain normally ranked, and retain all published history. |
| 9 | Retry after a competing timer tab closes | The blocked tab can acquire control through an explicit retry, while two tabs cannot control simultaneously. |
| 10 | Correct individual reporting guidance | A player is not invited to fill a form that the current clock/report state disallows. |
| 11 | Guided device movement, retirement and replacement | Control moves deliberately, old writes are rejected, saved time survives, and any uncertain time is reviewed before continuation. |
| 12 | Available physical tables and queued matches | Unavailable tables receive no new assignments; excess matches wait visibly without changing Swiss pairings or allowing overlapping use of a table. |

Out of scope: changing Swiss priorities, late entry or player reinstatement, automatically deciding forfeits, introducing a restricted kiosk account, remotely signing devices out of the shared organizer account, or creating a new per-match external-timer mode. Existing manual organizer result overrides remain available with their current reasons and audit rules.

## Device and table concepts

Keep these concepts separate in both data and UI:

| Concept | Meaning and lifetime |
| --- | --- |
| Device | This browser profile, identified by an opaque identifier and an optional organizer-visible label. Its identifier is not authorization. |
| Assigned table | The physical table this device serves in this tournament. An explicit assignment survives browsing, reload and later rounds. |
| Physical table | A stable tournament resource with a visible number and an available/unavailable state. Closing it does not renumber the others. |
| Pairing | The immutable opponents and match identity in a published round. The current numeric pairing slot remains available for compatibility. |
| Match location | The physical table and queue position for a pairing. Moving it changes location only, with an audit record. |
| Timer control | The existing single-controller authority for one match. Table assignment alone never grants or transfers it. |

The same organizer account can continue to operate several independent devices. A device serves one assigned table at a time; a table has at most one designated shared device. The full organizer overview can view any table without taking control or changing assignment.

Persist the assigned tournament/table separately from the temporary browsing filter. Migrate an existing `crossplay.table.<tournamentId>` number into a suggested assignment on first setup; do not silently register or transfer control merely because that filter existed. A new or copied tournament requires an explicit assignment. Do not carry an old event's table number into a new event automatically.

Table preferences and clock layout preferences are browser-local conveniences. Server records govern registered device duty, physical availability, match locations and timer authority. When local storage is unavailable, explain that assignment cannot be remembered; retain the existing clock storage requirements rather than promising recoverable timing without a journal.

## Table home and normal match flow

Add `/t/[slug]/table` as the dedicated device workflow. Use canonical tournament IDs for persistence even when entered through a slug. Its first visit offers Use this device at Table N. Once assigned, show the tournament, Table N, current round, opponents and one primary action. Provide My table, Browse tables, Standings and Manage as distinct navigation choices.

Sign-in retains a validated same-origin local destination. An explicit destination takes priority; otherwise a registered device can return to its last active table. Missing, archived or inaccessible tournaments show a clear fallback and never redirect in a loop. An explicit visit to Manage continues to show the complete organizer view.

| Table state | Display and primary action |
| --- | --- |
| No published match yet | Waiting for pairings; show the assignment and refresh status. |
| Ready match | Show both names and Open match. The clock screen still requires Start Timer. |
| Running or paused match controlled here | Continue match; retain the same timer and controller. |
| Clock controlled elsewhere | View match and an organizer replacement action; opening alone cannot take over. |
| Ended game | Report scores, including automatic clock-derived overtime. |
| Pending shared report | Review scores and show exactly whose acknowledgement is missing. |
| Pending individual/manual report | Open its appropriate existing review workflow; do not manufacture a shared timer report. |
| Dispute or timing review | Show the required organizer action and open the relevant controls directly. |
| Official result saved | Show the result receipt, then the next queued match at this table or Waiting for next round. |
| Table unavailable or no match | Explain the state and offer explicit reassignment or temporary browsing. |
| Event finished | Final standings, including withdrawn entrants and links to historical rounds. |

Unify the destination after both the shared timer report and the general result form when entered from table mode. Return to the assigned table after a successful save without implying that a pending report is final. Keep the completed result visible until the user opens the next match or dismisses the receipt. An organizer entering a result from the operational queue stays in that queue with a saved-result acknowledgement.

The table home reads tournament/table state on mount, focus and visibility return, and through the existing refresh lifecycle. The completed match screen must discover later pairings through table state rather than polling only its old match forever. Announce a new pairing accessibly; never navigate away during typing, replace an active clock or start/resume timing automatically. Failed refreshes preserve the last known view with a retry and stale-state indication.

## Changing or replacing a device

Provide three clearly named actions: Change this device's table, Remove this device from table duty, and Replace this table's device. Show the affected table, players and saved clock state before the organizer completes the action.

For an idle device or a completed match, moving or retiring duty is straightforward. Clear/reassign its duty record without modifying the old result. A device with an unfinished controlled match first completes a handoff; changing a selector or leaving a page is insufficient.

For an available old device, pause the timer through the clock journal, flush pending events and confirm the accepted sequence/version. Keep it on a waiting-for-handoff screen. For an unavailable device, identify the last server-saved time as potentially incomplete. The organizer must review time; never infer that a disconnected device stopped counting or discard uncertainty because the saved status was ready, paused or ended.

Replacement is a transactional operation initiated on the receiving device by a verified organizer. It compares the expected clock epoch/version and table assignment version, revokes the old match credential/controller, creates the replacement's match session, reserves its controller and records the duty change together. Preserve the existing review requirement when control changes. Use the existing time-correction rules to approve precise saved milliseconds or enter reviewed times before explicit Resume. Preserve ready and ended states where applicable.

Do not implement replacement as an unguarded client sequence of revoke, open and claim, or simply connect the current staff `takeover_clock` endpoint to a button. The replacement needs a shared match session that can complete both acknowledgements. A server transaction can compose the existing private clock capabilities with the new duty records, while checking versions before any mutation.

Retry the same operation with the same request ID and return its receipt without taking control a second time. A lost cookie response must be recoverable. Competing replacements have one winner; stale tabs and old-device queued events cannot overwrite it. Never expire ownership or transfer it automatically on heartbeat loss.

If time review invalidates an unfinalized report under existing rules, explain that its scores must be reviewed and acknowledged again. Official results are unaffected. The old browser stops editing when it learns its control was revoked. Do not delete its journal merely because a request had a transient network failure.

Removing table duty does not revoke the device's organizer login. This plan keeps the accepted full-organizer account model and labels that distinction explicitly.

## Closing tables and handling fewer devices

Add a Tables view to tournament management with available tables, registered device labels, current match/queue and coverage status. Device presence is informational; absence must never be interpreted as an automatic release of control.

For existing events, initialize physical tables from the existing non-bye table numbers, preserving gaps and current locations. A bye consumes no physical table in the new allocation model. Retain the legacy numeric pairing slot independently so existing rounds and references are not rewritten. For new events, suggest the table count from the active field, but permit explicit numbers and fewer tables. Available table numbers remain stable after withdrawals.

Keep the Swiss engine's output independent of tables. After opponents are determined, assign physical locations deterministically using available table numbers in ascending order and the existing pairing order. For a round with more matches than available tables, the proposed default is queued play: first matches occupy each table and later matches wait there in stable order. Nine matches with eight tables means eight first matches and one later match, within the same round. Queue position is shown on the public match listing so players know when to sit down.

Only the released head of a table's queue can be opened for play. Opening, starting or resuming a match validates its location, table availability and queue eligibility server-side, including old direct links and queued clock commands. One unfinished released match holds a table until its official result is saved. A pause, ended clock or pending/disputed report does not release it. This deliberately conservative first version avoids overlapping clocks and players at a table. The next round still requires every published match to be resolved.

Closing a table prevents new allocations there. If it has a running match, require a saved pause or reviewed recovery and a destination before the move. An occupied destination places a paused match in the queue; its clock and report remain attached to its match ID. Unstarted queued matches can move together or individually. Show and confirm the relocation summary, then apply it atomically. Reordering queued matches is organizer-only and does not change opponents or starter selection.

The relocation flow also states whether the same device moves with the match or the destination device receives control. The former updates its table duty; the latter requires the replacement procedure. A location change alone never transfers clock authority. Refuse a closure that leaves unfinished matches without any available destination, with a clear instruction to provide a replacement or reopen a table. An event with no available tables cannot release a match for play.

A device replacement at the same physical table leaves locations unchanged. Retiring a device leaves a visible device-coverage problem until a replacement is assigned or the organizer explicitly closes the table. Do not silently change the event's frozen timer mode. An organizer may use existing audited manual result tools, but automatic external-timer fallback is not part of this plan.

Changing availability invalidates an unpublished preview's allocation and requires a refreshed preview. Published opponents stay fixed. Record original and subsequent locations for the current round; completed historical rounds retain where matches were actually played, even if a table is later closed or reused.

## Departures and final standings

Keep the existing `withdraw_entrant` operation and active-player filter. Label the action Remove from future rounds, with a concise explanation that historical results and final ranking remain. Use Withdrawn consistently as the resulting status.

After withdrawal, show the player's retained record and any unresolved published match with Resolve Table N. Let the organizer select the actual played result, forfeit or double forfeit through existing audited controls. If an unpublished preview was discarded, offer Preview next round again. If the reduced field makes legal pairings impossible, explain the existing constraint and offer the existing early-finish path after outstanding matches are resolved.

Final and live standings include all entrants, with Withdrawn beside departed players and an accessible wins/draws/losses record alongside points and difference. Do not sort by activity, win percentage, attendance or rounds completed. Keep historical round pages and player history available after withdrawal. Filtering the active roster must not filter the tournament standings.

No per-player reinstatement is added in this scope. Do not suggest tournament reset as an undo for a departure, since reset deletes play. The existing round count remains locked; withdrawal does not silently shorten it.

## Reporting and smaller workflow improvements

Remember face-to-face mode per browser and flipped player placement per tournament run and match. Apply saved placement only to the same player identities. New matches get the device's viewing mode but do not inherit the previous opponents' side mapping. Display choices never affect active side, starter accounting or score ownership.

Persist unfinished shared and manual scores, overtime text and dispute/correction reasons as local drafts. Key them by tournament, run generation, match, actor/reporting path and report revision, retaining the clock version/epoch used for context. Store editable input only, never authority, derived penalties, credentials or acknowledgements. On return, fetch current state first, offer Restore draft or Discard, and require fresh review when context changed. Clear after a confirmed save/finalization, explicit discard, reset, deletion or sign-out. A lost response requires a current-state read before retry. Storage failure falls back to preserved in-page input with an honest notice. Restoring a draft never submits it automatically.

Make the organizer's unresolved count a filterable queue. Include All matches, Needs attention, Awaiting confirmation and Unreported, with table/player search and direct links to actions. Show result state separately from clock state. Reuse permission-appropriate match-status reads in the shared refresh lifecycle; deduplicate them and do not treat a failed read as an unstarted match. Fetch the data needed for correct counts rather than counting only currently visible cards. Completed matches stay accessible for corrections.

After adding at least two players, offer Preview round 1. After saving copied settings, offer Add players when the roster is empty. Keep explicit preview and Publish controls. Pairings never publish merely because a form was saved.

For competing-tab recovery, expose an explicit Try controlling on this tab action when lock acquisition failed before journal creation. It retries the lock and re-reads server authority; it does not override another device or clear unsaved events.

For individual players, obtain an authoritative reporting capability appropriate to the verified viewer and current match state. A match with an app clock directs players to its table for score entry; a manual individual report keeps its existing submit/confirm/dispute rules. Do not disable valid manual reporting merely because the tournament is configured with app timing when no clock has been created. Server enforcement remains authoritative if a clock appears after the form was opened. Reproduce the investigated competing-tab and individual-reporting paths in focused acceptance tests before applying their fixes.

## Data and API boundaries

Proposed additions are confined to the private Crossplay schema and existing server-only access layer. Final SQL names and migration timestamp are assigned in the database-owner phase; do not start a second migration history here.

| Addition | Required behavior |
| --- | --- |
| Physical table records | Stable ID/number, availability and revision; tournament scoped, no renumbering on close. |
| Device duty records | Browser identifier/label, assigned table, active or retired duty, run generation and revision; unique active table/device bindings. These records confer no account permission. |
| Match location records | Match ID, physical table, queue order/release state, allocation revision and original location; separate from immutable opponent pairing data. |
| Location and handoff audit | Preserve actor, reason, old/new location or duty and relevant accepted versions. |
| Operations capability | An additive version check and snapshot capability so old schemas keep ordinary workflows functional while new controls remain disabled. |

Expose the table resource state needed for public locations/queues without exposing device identifiers, private labels, sessions or controller details. Staff-only reads supply device coverage and recovery actions. Individual reporting capabilities contain only allowed actions for that player. Add physical table/location fields to clock snapshots without changing their timing representation.

Proposed tournament operations cover configuring tables, changing availability, assigning/retiring device duty and moving/reordering matches. A dedicated authenticated match replacement endpoint creates its secure HttpOnly match cookie after the transactional handoff. Extend existing match-open, clock-start and clock-resume boundaries to enforce location and queue eligibility once the tournament uses managed tables; do not rely on buttons alone.

All writes verify staff server-side, reject client-supplied actors, validate tournament/run ownership and use fingerprinted request IDs. Table/duty/location writes compare their expected revisions; combined published-match moves also compare the match and clock state they affect. Keep tournament-first locking, then affected tables/matches/clocks in a stable order consistent with existing clock/lifecycle wrappers. Ordinary timer taps retain their existing match clock versions and must not churn the table configuration revision.

Maintain a shared location projection rather than changing the meaning of existing `Match.tableNumber` for legacy callers. Expose nullable physical table and queue fields when supported; new displays use the physical location, while legacy history retains its original pairing slot. A location-only mutation cannot invalidate score acknowledgements or recalculate the Swiss pairing hash. If time correction is also required, its existing report-invalidation rule applies separately and is explained to the user.

Lifecycle integration is part of the schema work: archive suspends duty/queue release and clocks; restore revalidates assignments and reviews interrupted time; reset retains configured table numbers/availability, clears match locations and active duty, and requires each device to confirm its suggested table for the new generation; delete removes operational records. Browser drafts and match placement are cleared for obsolete generations. No stale handoff receipt can revive a reset/deleted match.

## Implementation phases

| Phase | Scope and principal files | Completion gate |
| --- | --- | --- |
| A | Attendance and everyday reporting improvements: issues 4–10. Work in `tournament-app.tsx`, `shared-match-report.tsx`, `match-clock.tsx`, shared preference/draft helpers and permission-safe status reads. Add the departed-player ranking/history witnesses. | Focused workflow/domain checks pass; existing confirmation, scoring and portrait behavior retained. |
| B | Canonical table, duty, location, queue and transactional handoff capability for issues 11–12; lifecycle integration and restricted APIs. Database changes only in the owner repository; consuming types/validation/server adapters here. | New migration's focused SQL, permission, idempotency and race checks pass; app gates operate before/after the capability is present. |
| C | Table home and complete navigation: issues 1–3, device setup/movement/replacement and table-management UI using phase B. Integrate remembered viewing and reporting drafts from phase A. | End-to-end device flow passes from sign-in through two rounds, including replacement and fewer available tables. |
| D | Integrated acceptance, release notes and interface documentation. Update README, the application/clock contracts and a scoped release record to describe final implemented behavior. | Acceptance matrix below passes and release prerequisites are recorded. Stop; do not start another general review cycle. |

Each implementation phase has at most one general review. Repair only demonstrated regressions or explicit acceptance failures, rerun affected checks and do not restart that review. Work outside these twelve items needs a separate scope decision. Do not add reviewer agents simply to search for more issues after the gates pass.

## Verification and acceptance matrix

Use an isolated local database and disposable tournaments for writes. Automated mobile workflows cover representative phone and portrait tablet sizes in Chromium and WebKit, with the existing smallest/long-name checks for changed screens. Actual iPhone/iPad Safari and Android browser checks cover persistent assignment, keyboards, sleep/wake and device replacement when hardware is available; emulation is not evidence of physical-device behavior.

| Scenario | Required evidence |
| --- | --- |
| Remembered table and browsing | Two browsers sharing one organizer account retain independent duties through sign-in, reload, match return and temporary All tables browsing. |
| Reporting continuation | App timer and general result entry return to the correct context; pending and final are distinct; both exact-revision acknowledgements remain required for shared reports. |
| Later pairing or queued match | Finalization makes the correct next match available; no auto-start, no old-opponent reuse and no navigation during editing. |
| Layout and draft recovery | Layout survives reopening; refresh restores raw draft inputs; changed revision/clock requires review; reset/sign-out clear inappropriate drafts. |
| Organizer operations | Filter counts match the data, actions open the affected match, setup continuation works, and refresh failure is not displayed as an empty queue. |
| Departure after completed play | A player with three wins withdraws; later rounds exclude them; final rank uses their retained record; all prior rounds and player history remain. |
| Departure during play or after preview | Published match stays resolvable, no automatic forfeit; unpublished preview is discarded; fresh generation uses active entrants only. |
| Odd or infeasible reduced field | Eligible bye or explicit pairing failure; no withdrawn player, repeated opponent or fabricated result is introduced. |
| Duplicate tab and individual report | Retry succeeds only after exclusive lock becomes available; individual app-clock reporting is guided correctly while valid manual reports still work. |
| Device handoff | Available-device save/pause and unavailable-device recovery preserve precise saved time; replacement can report and acknowledge; old events fail; pending-report invalidation follows time review. |
| Handoff races and retries | Competing replacements, replacement versus clock append/report/finalization and reset/archive cannot produce two controllers; identical retry/lost-cookie response recovers the committed result. |
| Table closure and queue | Nine matches on eight tables complete in one round without overlapping occupancy; closing/moving an occupied table requires safe state; opponents, starter and results remain unchanged. |
| Allocation races and stale URLs | Table move/close versus open/start/resume/finalization/next-round publication is serialized; an old match link or queued resume cannot bypass table eligibility; closure with no valid destination is rejected without partial changes. |
| Historical locations | Completed earlier rounds retain original opponents/results and recorded locations after device removal, withdrawal or future table closure. |
| Compatibility and lifecycle | Pre-capability app works; managed-tables controls are gated; archive/restore/reset/delete clear or retain each resource as specified and stale operations cannot revive old play. |

Run app lint, typecheck, relevant unit tests and production build at integrated implementation gates, plus focused browser scenarios for the changed workflows. Use one representative multi-round event with departures, replacement and reduced table capacity rather than repeatedly running unrelated full-tournament campaigns. Test assertions should inspect persisted official state and invariants, not merely button labels.

In the database-owner repository, obey its migration-only exception: test only the new migration against an isolated database, including focused behavior and observed-lock concurrency cases. Do not run sibling application suites, whole-repository checks, full database resets or schema-wide lint as substitute gates. Retain target verification, migration parity inspection and reviewed push dry-run evidence for an eventual deployment.

Existing baseline evidence: the investigation ran all 19 pairing tests successfully, including withdrawn-player exclusion and odd-field handling. Planning ran all three standings tests successfully, including keeping withdrawn entrants. Existing browser tests cover retained scores/history after withdrawal and controller revocation. These are baseline evidence, not acceptance of the proposed features.

## Release order and rollback

First deploy the additive private schema capability from the owner repository using its scoped release process. Preserve existing base/clock/lifecycle versions and permissions. Then release the compatible app and enable managed tables explicitly per tournament after its existing matches and physical numbers are mapped. Existing active clocks keep their current controller until deliberate adoption or replacement; an unregistered legacy device is not proof that its clock is unowned.

Old APIs must respect managed-table queue and availability constraints, including requests from older open pages. Do not enable queuing on a tournament until its operating devices use the compatible UI. Ordinary matches in tournaments that have not enabled managed tables continue under the existing contract.

Rollback to a compatibility build that understands physical locations and blocked queued matches. Do not return an active queued tournament to an older UI that would display misleading table numbers. Retain operational/audit records and reviewed clock epochs; an app rollback cannot restore revoked controller authority. If rollback requires stopping new starts, leave saved results/history readable and preserve current clocks for controlled recovery.

Completion means all twelve acceptance outcomes pass, withdrawn players remain fully ranked with historical rounds intact, and the user-facing device flow is documented. No additional cleanup or speculative hardening is part of completion.
