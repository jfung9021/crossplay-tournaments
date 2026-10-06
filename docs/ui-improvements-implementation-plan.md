# Crossplay UI improvements implementation plan

Plan prepared October 6, 2026, covering the eight accepted [UI review suggestions](ui-design-review-2026-10-06.md) and consistent minutes and seconds formatting. The intended experience remains nine shared phones or iPads signed into one organizer account, each used to time a game played outside the app and report its result.

Implementation was subsequently requested and is recorded in [the implementation and verification report](ui-improvements-release.md).

The changes can use the existing APIs and database schema. This phase changes navigation, presentation and duration inputs; the Swiss pairing rules, score differential tiebreaker, overtime arithmetic, starter selection, result confirmation policies and controller protections remain the acceptance baseline.

## Duration format everywhere

Use `m:ss` for every displayed tournament duration and duration input. Minutes are not padded; seconds always have two digits. Minutes may exceed 59.

| Context | Example |
| --- | --- |
| Default time per player | `20:00` |
| Remaining time | `9:24` |
| Zero time | `0:00` |
| Live overtime clock | `+0:10` |
| Reported overtime | `0:10 overtime` |
| Default penalty rule | `2 points per completed 0:10 overtime` |
| Longer duration | `60:00` |

Apply this to the live clock, settings, rules and examples, manual overtime inputs, score entry/review/completion, match cards, player history, organizer time corrections, and user-facing messages that specify a duration. Calendar dates and audit timestamps remain dates and timestamps. First/second-player counts are counts, not durations.

Add a shared `src/domain/duration.ts` formatter/parser and a compact `DurationInput` component. The current live timer already uses the requested appearance; move its formatting into the shared helper without changing its timing calculation.

Inputs accept trimmed `m:ss` with seconds from `00` through `59`. Normalize valid input on blur, preserving incomplete text while typing. Reject bare numbers such as `20`, negatives, decimal notation and hours notation so the duration is unambiguous. Use a text input with a keyboard that allows the colon, a concise `m:ss` hint, an accessible label and inline format/range errors. Do not use an HTML time-of-day input or a numeric keyboard that prevents entering a colon.

| Input | Accepted range | Value sent to the existing API |
| --- | --- | --- |
| App time per player | `0:01` through `1440:00` | Integer seconds |
| Penalty interval | `0:01` through `60:00` | Integer seconds |
| Manual overtime | `0:00` through `1440:00` | Integer seconds |
| Organizer time used | `0:00` through `2880:00` | Integer milliseconds |

Required durations cannot be blank. Optional manual overtime may remain blank and mean zero. Format validation bounds as durations as well.

### Preserve precise timing

Keep the clock journal, accumulated milliseconds, event sequences and scoring calculations unchanged. Remaining time continues to round up for display; elapsed overtime rounds down. Penalties still use completed intervals of the precise accumulated duration, not the formatted string.

Organizer correction forms display whole seconds but retain each field's original millisecond value until that field is intentionally edited. Saving a reason, active side or the other player's time must not truncate an untouched value. An edited field sets the exact entered whole-second duration. Server clock versions and correction reasons remain required.

## Match actions and organizer controls

Read current clock state through the existing authenticated clock endpoint. Share refresh scheduling with the tournament's existing mount, focus, visibility and 20-second refresh lifecycle; avoid a separate polling interval per card. Request only eligible visible matches, deduplicate IDs, discard obsolete responses when switching views, and distinguish loading/failure from a successful response with no clock.

Do not place private clock/controller details in public tournament snapshots or pairing data. The existing match-open operation remains responsible for permission checks, controller reservation and preventing takeover.

Use the following action rules for an organizer's shared device. Match finalization, report state and review requirements take precedence over an older clock state.

| State | Main action | Status when useful |
| --- | --- | --- |
| No clock and no report | **Start Match** | No additional explanation |
| Clock ready | **Start Match** | Ready |
| Clock running | **Continue match** | In progress |
| Clock paused | **Continue match** | Paused |
| Game ended, no report | **Report scores** | Game ended |
| Shared report awaiting agreements | **Review scores** | Awaiting confirmation |
| Shared report disputed | **Review scores** | Needs organizer review |
| Time requires organizer review | **Review time** | Time review needed |
| Existing clock belongs to another device | **View match** | Clock on another device |
| Clock state could not be refreshed | **Open match**, plus retry/error indication | Do not guess that the match is unstarted |
| Final match, bye, unpublished pairing, or completed tournament | No start/report action | Existing result or appropriate status |

Opening or continuing never automatically starts or resumes the timer. **Start Timer**, **Resume**, **Pause** and **End game** retain their existing behavior on the match screen. A displayed button never grants control by itself. Read an existing browser controller ID without creating one just to label a card.

Pending or disputed individual/manual reports must not acquire a timer action. Distinguish the report's existing confirmation method from the presence of a clock. Existing result review handles those reports. Offline navigation can retain the last known status with an unavailable-refresh indication; this phase adds no new offline entry or device-transfer mechanism.

For app-timer events, place manual result entry/correction, dispute resolution, time corrections, starter records and device revocation inside a single **Organizer actions** disclosure. Keep **Needs organizer review** visible and provide a clear way to expand the relevant resolution controls. Avoid nested copies of the current clock-record disclosure.

For external-timer events, **Report result** remains the primary action on signed-in table devices, including the ordinary tournament page. Pending or disputed results open the existing review/resolve form. Wire the existing organizer score form into this view without exposing every management control. Preserve organizer finalization, required reasons and revision checks; do not invent a shared external-clock session or a new confirmation policy.

## Remember the device table

Add a compact **Table** selector to the current round on the ordinary tournament page: **All tables**, **Table 1**, **Table 2**, and so on. Show the selected table's one match card, including the current round and both player names. Default a new device to All tables.

Persist the choice in browser storage under the canonical tournament ID. This is a display preference, not an account permission. Nine devices using one account therefore keep independent choices.

- Returning from a timer or score sheet and refreshing restores the selection.
- A new round retains the physical table number and displays its new opponents; never persist the old match ID as the table preference.
- A missing table after withdrawals shows **Table N has no match this round** and **Show all tables**. Never silently select a different table.
- All tables includes byes. Historical round pages and draft previews show all matches and do not overwrite the current preference.
- The management overview retains its complete operational view; a remembered table must not hide other unresolved matches there.
- If browser storage is unavailable, selection works for the current page without persistence.
- Table selection does not filter standings, automatically open a match, start a timer, or require a special URL.

## Explicit timer settings and accurate rules

Add a visible **App timer / External timer** choice to creation and editable settings. New tournaments default to App timer with **20:00** per player and a **0:10** penalty interval.

Show **Time per player (m:ss)** only for App timer. Clearing it is a validation error and never changes mode. Keep a duration typed during the current edit when switching modes. If an existing external-timer event is explicitly switched to App timer before publication, offer **20:00** as the initial value.

The mode is a form-only value: App timer serializes to the existing integer `timeLimitSeconds`; External timer serializes to `null`. Keep competitive settings locked after the first round is published. Editing permitted name/date fields must preserve the locked configuration. Copy settings retains the exact server-stored values and opens a new draft with the correct mode and formatted durations.

Rules describe the selected workflow:

- App timer: **Start Match → Start Timer → End game → enter scores → both players agree**. State that overtime comes from the timer.
- External timer: use an external timer and have the organizer record both game scores and overtime.
- Describe individual reporting as an optional alternative in a collapsed section, retaining opponent confirmation and the restriction against manually bypassing an already created app clock.

Show **20:00 per player** and format all penalty examples as durations, such as **0:09** and **0:10**. Preserve the existing match points, differential tiebreaker, equal-rank, bye, forfeit, pairing and dispute rules.

## Final standings and optional player access

On finished or archived tournament overviews, show **Final standings** before the final-round match cards in both public and organizer views. Preserve the `#standings` shortcut, round navigation, exact ranks, player-history links and organizer archive/copy/reopen controls. Display tied first places using the existing rank data; do not invent a sole winner. Active events retain their match-first emphasis. Reopening results returns the overview to its active correction workflow.

Move **New player link** and its generated output out of ordinary roster rows. Add a collapsed **Individual player access** section below the roster, with an active-player selector and an explicit create/replace invitation action. Keep rename, removal/withdrawal and bulk addition in their existing roster workflow.

Preserve the existing invitation replacement behavior and explain that a replacement invalidates earlier player access. Clear a displayed invitation when its selected player changes or becomes ineligible. Keep invitation values transient and out of persistent browser storage. These optional player invitations remain separate from timer entry; timer links do not return.

## Compact score and overtime presentation

Apply the same rules to score entry, review, completion, live penalty labels, match cards and history:

- No overtime and no deduction: omit overtime and penalty detail.
- Positive overtime without a deduction: show the duration, such as **0:09 overtime**, and omit **−0 points**.
- A deduction applies: show actual game score, formatted overtime, deducted points and final score clearly.

Preserve both named agreements, invalidation of agreements after a score edit, disputes and the authoritative display of organizer-corrected results. Removing duplicate or zero-value text must not hide a real penalty or change a saved result.

## Implementation ownership and order

Use three focused implementation agents with one integration owner. Several changes meet in `tournament-app.tsx`; one owner edits that file to prevent conflicting changes.

| Owner | Files and responsibility |
| --- | --- |
| Duration agent | New duration helper/input, live-clock formatter adoption, formatter/parser tests. Defines the input/precision contract for all consumers. |
| Navigation agent | `start-match.tsx`, a focused match-entry state hook, table selector/persistence component, focused navigation tests. Reuses current API responses. |
| Reporting agent | `shared-match-report.tsx`, optional individual-access component, relevant focused presentation tests and component-scoped styles. |
| Integration owner | `tournament-app.tsx` settings/rules/roster/match wiring/standings order, `organizer-match-clock.tsx` correction fields and disclosure integration, shared styles, existing browser helpers, documentation and release verification. |

1. Establish the shared duration contract and match-action matrix first.
2. Build the focused components in their separate files; keep APIs/storage numerical.
3. Integrate them into the tournament screens, with the integration owner making the overlapping edits sequentially.
4. Update existing browser helpers and expectations for duration inputs, new disclosures and state-dependent labels. Keep realistic numerical fixtures and independent reference calculations unchanged.
5. Run direct acceptance checks, perform one general logic review, and make only focused repairs for evidenced failures. Rerun affected checks after a repair without restarting a general review.
6. When implementation is requested and passes acceptance, merge/deploy and run production checks that do not mutate tournament data. Stop when the defined acceptance criteria pass.

## Verification and evidence

### Focused logic checks

- Formatter/parser covers `0:00`, `0:10`, `9:24`, `20:00`, `59:59`, `60:00`, all field bounds, invalid syntax and normalization.
- A saved value of 564 seconds loads as **9:24** and saves/copies without alteration.
- Overtime at 9.999 seconds displays **+0:09** with no deduction; 10.000 displays **+0:10** and deducts 2 points under defaults. Existing custom-interval and accumulation checks remain valid.
- Correct one player's time while the other retains a fractional-second record. Assert the untouched integer millisecond value survives exactly.
- Match action selection follows the state precedence above, including another controller, a manual pending report, review-required timing, stale reads and failed reads.

### Browser acceptance

| Check | Required evidence |
| --- | --- |
| App/external settings | Default **20:00**, custom **9:24**, interval **0:10**, explicit mode switching, blank/malformed rejection, exact reload/copy, and locking after publication. |
| One full match | Correct card action through ready/running/paused/ended/pending/final; same controller on reentry; score edits and both acknowledgements still work. |
| Nine devices | Same organizer account, independent table preferences and timers; a second device cannot take over a match. Sign-in cap stays 16 attempts per minute per network address. |
| Table selection across rounds | New opponents at the remembered table, history unaffected, missing-table message, byes in All tables and safe behavior without browser storage. |
| Organizer tools | One primary app-clock action; manual correction/dispute/time controls accessible in Organizer actions with existing reasons and version checks. |
| External reporting | Primary Report result works from the ordinary tournament page, with m:ss overtime and unchanged organizer finalization. |
| Optional player invitations | Hidden by default, correct selected player, explicit generation/copy/replacement, stale displayed link cleared, existing individual reporting/confirmation works. |
| Penalty presentation | Zero overtime, **0:09** with no deduction, **0:10** with 2 points, positive overtime with zero configured deduction, and corrected official results. |
| Arithmetic witness | Actual scores 401–399 with **0:20** overtime yield 397–399; score review, history and standings agree. |
| Completed event | Finished and archived views lead with final standings; ranks, points and differential including ties are identical to the independent reference. |
| Existing protection | Removed timer-link routes stay unavailable; authentication, stale revisions, concurrent entry, offline recovery and clock saving continue to pass. |

Extend the existing local clock acceptance suite rather than creating another tournament simulator. Run its 20-player, six-round, 60-match fixture through the revised controls and final screen once, retaining realistic scores of 300–450, independent pairing/standings checks and the existing tiebreak witnesses. Update selectors where needed without weakening assertions or changing the numerical oracle.

Run TypeScript, lint, unit tests and the production build. Capture phone and iPad screenshots for the selected-table view, settings, organizer disclosure, optional access, rules, score review and final standings. Verify no horizontal overflow, reachable controls, clear keyboard focus and duration entry. Cover the existing phone portrait/landscape and iPad portrait/landscape/split-view sizes. Physical Safari keyboard and sleep/wake checks remain a separate hardware check if devices are available; emulation is not proof of those behaviors.

Retain the test manifest, browser results, numerical ledger and representative screenshots under a new local evidence directory. Record any failed attempt and its focused repair; do not treat unexecuted hardware checks as passing.

## Scope and completion

This request produces the plan only. No application changes, database migrations, deployment, tournament reset or slow two-round walkthrough are part of this planning phase. The earlier demonstration tournament remains preserved. Implementation is complete when these changes and their direct acceptance checks pass; unrelated cleanup or speculative improvements do not extend the phase.
