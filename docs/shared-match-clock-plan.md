# Shared match clock implementation plan

Date: 2026-09-30

Status: Accepted for implementation on 2026-09-30, including the proposed defaults and shared-device attestation. The user authorized subagent implementation, one code review, merge and deployment. See `clock-integration-contract.md` for implementation interfaces and the clock release record for verification/deployment status.

The requested experience is one shared mobile phone for playing and reporting, with a layout that also works on an iPad. Each player starts with 20 minutes. Players tap their own running clock to pass the turn, see overtime deductions as they accumulate, manually end the game, then enter scores. The existing Swiss rules and differential ranking continue to apply.

## 1. Proposed behavior

| Item | Proposed default |
| --- | --- |
| Device | One shared phone or iPad per match; one controlling browser at a time. |
| Starting time | 20:00 per player, configurable before the tournament starts. |
| Time control | Simple countdown; no increment or delay. Only the active player's time runs. |
| Starting player | Automatically balance starts using tournament history: fewer firsts, then more seconds, then a saved 50/50 digital draw. Show the named starter before a separate Start clock action. Pairing order does not imply move order. |
| Switching | Tap the active player's panel to stop that clock and start the opponent's immediately. Tapping the inactive panel does nothing. |
| At zero | Continue into overtime. Zero does not automatically end the game or declare a loss. |
| Live penalty | Show overtime and the current points deduction using the tournament's existing rule. Default: two points per completed ten seconds. |
| Pause | A small central Pause/Resume control; pause intervals are recorded and excluded from thinking time. |
| End | End game is always visible and works at any time. Its first tap freezes both clocks immediately and opens score entry. |
| End reminder | Give End game a stronger border/background when either clock reaches zero. No flashing, modal interruption, or automatic ending. |
| Accidental end | Resume game is available before any score report has been submitted. Resume preserves time already used and records the intervening pause. After submission, an organizer handles corrections. |
| Final scores | Players enter actual game scores. Recorded overtime and deductions are supplied automatically. |

The 20-minute default, shared device, live deduction, manual ending, mobile/iPad support and automatic starter selection using a Scrabble tournament method are explicit user requirements. The detailed adaptation and other defaults above are recommendations for this implementation.

### Starting-player selection

Use NASPA's balancing order as the basis: fewer previous starts, then more previous second turns; a remaining tie is decided by drawing tiles alphabetically, with blanks first. Its rules also specify special first/second accounting for unplayed forfeits and byes. Source: [NASPA Official Tournament Rules, III.D](https://www.scrabbleplayers.org/rules/rules-20161201.pdf). WESPA also permits software-assigned starts and describes balancing starts across a tournament. [WESPA rules, 2.1](https://wespa.org/docs/WESPA%20Rules-V5.1.pdf)

For this Crossplay app, apply these steps to the two already-paired players:

1. Give the start to the player with fewer recorded firsts in this tournament.
2. If tied, give it to the player with more recorded seconds.
3. If both counts are tied, choose either player with equal probability using a server-side cryptographic random draw. This replaces the physical tile draw and is an explicit Crossplay adaptation. Round one normally reaches this step.

This aims to balance opportunities over the event; it does not guarantee exactly three starts each in six Swiss rounds. Opponents remain determined by the existing Swiss pairing rules, and start history has no role in standings or score-differential tiebreaks.

Keep a per-match starter record independent of clock ticks, including entrant ID, selection method, prior-round first/second counts and any organizer correction. Resolve and save the choice once, transactionally, before play. Refreshes, retries, another device, pause/resume and score corrections must not redraw it. Display only “[Name] starts” and Start clock in the ordinary player setup; detailed selection history belongs in organizer records. Selecting the starter does not run either clock. Allow an audited organizer correction for an externally determined or incorrectly recorded starter, rather than a player reroll button.

For played games, record one first and one second when play starts, including games later forfeited; do not count a pregame selection as played. For a forfeit before play, follow NASPA's accounting: assign the forfeiting player a first for their first such forfeit, a second for their next, alternating thereafter; assign neither to the opponent. Byes assign neither. Record these accounting entries once per match, including manual-clock games, and distinguish an unplayed forfeit from a game forfeited after play began. Do not infer missing historical starts from pairing order; require organizer input if importing earlier games into this mode.

## 2. Phone and iPad layout

Use a dedicated match screen so the clock does not compete with standings, all-table pairings, site navigation, or explanatory rules. Names, running side, remaining time/overtime, current deduction, and the essential controls should be visible together.

| Screen | Layout |
| --- | --- |
| Phone portrait | Two large clock panels stacked vertically, separated by a compact Pause / End game bar. Support facing players by rotating the upper panel's contents 180 degrees. |
| Phone landscape | Two panels side by side with a narrow shared control bar. Reduce gaps before reducing timer readability. |
| iPad portrait | The same opposing-player arrangement, with larger tap surfaces and type. Keep the action bar reachable from either side. |
| iPad landscape | Two generous side-by-side clock panels with centered controls. No extra dashboard content just because there is more space. |
| iPad split view | Choose layout from available viewport width/height, not an iPad device check; fall back to the compact phone arrangement. |

Provide a small Flip sides control before play and while paused. It changes visual placement only; entrant IDs, score ownership and timing totals never swap. In landscape, use an explicit face-to-face option if rotated content is useful; do not assume every tablet is lying between opposing seats.

The clock screen fits the available viewport at 320×568, 375×667 and 390×844, plus iPad 768×1024, 820×1180 and their landscape equivalents. Use dynamic viewport height and safe-area padding. Minimum essential touch target: 44×44 CSS pixels. Keep browser zoom, keyboard activation and focus indicators usable. Distinguish Running, Paused and Overtime with text as well as color. Screen-reader announcements happen on state/penalty changes, not every display refresh.

The compact reporting screen contains two named rows/cards, each with one score field and a read-only overtime/deduction summary, followed by the computed final scores and confirmation controls. On a phone, allow short vertical scrolling when the numeric keyboard or enlarged text is present rather than shrinking controls or obscuring the focused input. On an iPad, use two columns within a readable width. Do not force the full clock and the score form into the same viewport.

## 3. Shared-phone result confirmation

The existing implementation authenticates one entrant per player session and requires the opponent's separate session to confirm. Simply adding two confirmation buttons to that session would not satisfy its current authorization model.

Recommended addition: an **organizer-issued private match link** that authorizes a shared device for one published match. It opens only that match's clock, score entry and review. The organizer can copy the link or display its QR code at the table. Keep the ordinary individual-player invitation flow available for existing/manual tournaments.

The shared-device flow is:

1. Open the private match link, see the two names and the automatically selected starter, then tap Start clock when ready.
2. Play, switching the active clock with panel taps.
3. Tap End game. Both clocks freeze at the tap time.
4. Enter both actual scores; view recorded overtime, deductions and computed final scores.
5. Submit for review on the same phone. Each player taps their named agreement control after reviewing the result.
6. After both acknowledgements of the same report revision, finalize the result and show Match complete.

This is an explicit **shared-device attestation**, not proof that two separate accounts authenticated. The organizer-issued match credential authorizes that workflow. Record `confirmationMethod: shared_device` in result history and show an ordinary “Both players confirmed” completion message only after both acknowledgements. Existing individually authenticated confirmations remain identifiable separately.

The accepted feature contract uses shared-device attestation and records it separately from independent-session confirmation. The match-scoped credential keeps the intended shared-phone experience compact.

Any score edit invalidates both acknowledgements. A disputed value goes to the organizer. A shared match link cannot administer the tournament, read another match's private reports, impersonate an organizer, or independently start another match's clock. Revocation removes its write authority.

## 4. Time and penalty calculation

Reuse the existing `timeLimitSeconds` concept: 1,200 seconds for a new clock-enabled tournament. Present it as “Minutes per player” in settings; store integer seconds and preserve any existing precise value when editing. Freeze timing and penalty rules when round one is published, and copy that frozen configuration into each clock session.

The current source has the settings field and manual overtime calculations but no running clock. New tournament defaults may change; existing active, finished and archived events must retain their frozen rules. Legacy drafts can explicitly adopt the clock before starting. A legacy null time limit must not acquire a retroactive 20-minute rule.

Track accumulated time in milliseconds. Round only after summing all of a player's turns:

```text
usedMs[player] = completed active intervals + current active interval
remainingMs[player] = initialTimeMs - usedMs[player]
overtimeMs[player] = max(0, usedMs[player] - initialTimeMs)
deduction[player] = floor(overtimeMs[player] / (intervalSeconds * 1000)) * penaltyPoints
```

Before zero, display remaining whole seconds rounded up. In overtime, display elapsed whole seconds rounded down and the deduction calculated from the unrounded total. This prevents a display from claiming a completed penalty interval before it has elapsed. Persist the millisecond total; the existing report receives `floor(overtimeMs / 1000)`, which preserves the completed-interval deduction exactly for integer-second intervals.

| Accumulated overtime | Displayed deduction at the default rule |
| --- | ---: |
| 0–9.999 seconds | 0 points |
| 10–19.999 seconds | 2 points |
| 20–29.999 seconds | 4 points |
| 30–39.999 seconds | 6 points |

Overtime stops accumulating when that player is inactive, the game is paused, or the game has ended. It resumes from the existing total when that player's turn resumes. For example, overtime turns of 3, 3 and 4 seconds total ten seconds and deduct two points. Never round each turn independently.

After End game, time spent entering or confirming scores adds no overtime. The server derives overtime from the accepted ended clock record and calculates adjusted scores using the existing scoring rules. Never trust a client-supplied deduction or deduct again from an already adjusted score. Negative adjusted scores remain allowed. Standings still rank match points, then cumulative adjusted score differential.

## 5. Clock engine and recovery

Implement a small pure clock state machine, separate from React rendering:

```text
ready -> running(A or B) <-> paused -> ended -> score review -> final
                 A <-> B
ended -> running(previous side), only before report submission
```

“Ended” is a timing state; it is not an official tournament result. Zero time is also not a result state. A bye has no clock. An organizer's forfeit/finalization must close or supersede any active clock with an audit reason.

Use timestamps and accumulated durations rather than subtracting one second per `setInterval` callback. Foreground timing uses a monotonic source; render updates only redraw the derived state. Capture turn transitions locally at tap time so network latency does not move time from one player to the other. Ignore duplicate events from one gesture and taps on the inactive side, while preserving legitimate rapid alternating turns.

Browser timers can be delayed in background tabs. Also, `performance.now()` is monotonic but has cross-platform sleep behavior differences, whereas wall-clock time can be adjusted. Store both monotonic and wall/server-calibrated anchors and define a recovery path for hidden pages, reloads and suspension. Do not claim that a render loop or wake lock alone solves recovery. Sources: [timer throttling](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout) and [monotonic timing and sleep](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now).

Recovery rules:

- Every accepted local transition writes an ordered event and checkpoint to durable browser storage. The event contains side/action, precise elapsed totals, clock epoch and sequence; it contains no player invitation secret.
- Backgrounding or locking the phone does not silently pause play. On return, charge the elapsed gap to the side that was running. An explicit Pause is the only ordinary way to stop both clocks.
- Reconcile wall-time gaps with persisted server-calibrated anchors when online. When trustworthy sources disagree enough to affect timing, preserve the records and require an organizer-reviewed time correction instead of silently resetting, granting time, or claiming exact recovery.
- A page refresh restores the active side, totals, pending event journal and original running anchor. It must not restart at 20:00 or freeze the elapsed refresh time.
- Request a screen wake lock after starting and try to reacquire it after visibility returns. If unavailable or released, keep timing correct and show a compact “Keep this screen awake” notice when useful. Wake locks require a secure context and may be released by the browser/device. [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- Brief network loss does not interrupt taps on the controlling device. Store events locally and replay them in order on reconnect. Offline End game freezes the local clock immediately, but submission/finalization waits for the end record to be accepted. Show “Waiting to save” only while this affects the next action.
- Starting a new clock and taking over control require a connection. Offline continuation is limited to an already claimed match; this is not a general offline tournament mode.

Both the clock engine and recovery adapter take injected time sources so these behaviors can be tested without waiting 40 minutes. Clock recovery is a release gate, not a promise inferred from timer unit tests.

## 6. Persistence and API boundaries

All canonical migrations remain in `C:/Users/jfung/bite-open-card-draw`. App code remains in this repository. Extend the private `crossplay` schema; keep browser base-table access prohibited.

Proposed records:

| Record | Purpose |
| --- | --- |
| Match start records | Persist the selected entrant, balancing/draw method, prior-round count snapshot, first/second accounting and organizer corrections independently of timing events. Unique per match; usable by manual-clock games too. |
| `match_clock_sessions` | Match/entrant IDs, starter-record reference, frozen rules, state, active side, accumulated milliseconds, running anchor, controller epoch, accepted sequence/version, started/ended timestamps and timing-review state. |
| `match_clock_events` | Append-only ordered start/switch/pause/resume/end/recovery/takeover records, unique by session + epoch + sequence. Enough detail to reconstruct totals and diagnose a disputed clock. |
| Shared match credentials/sessions | Hash-only private credentials restricted to one match, with expiry and revocation following the existing private-link pattern. |
| Report/revision timing metadata | Timing source, clock ID and ended revision, confirmation method, acknowledgements and any organizer override reason. Preserve existing raw/overtime/result fields. |

Suggested app endpoints under a match resource:

- Read the current clock and report summary for an authorized participant/shared session/organizer.
- Claim the clock and resolve/read its saved starter; start separately with that entrant as the first active side.
- Append an ordered batch of timing events/checkpoints with an idempotency key and expected clock version.
- End or resume the pre-report clock.
- Submit raw scores linked to an accepted ended clock revision; acknowledge or dispute that report.
- Organizer-only revoke/takeover/time correction with a reason.

Use current actor verification, same-origin checks, idempotent retries and database transaction/version checks. Clock control is match-scoped. Use its own revision/version; individual taps must not increment the tournament results version, invalidate pairing drafts, or change pairing hashes. Keep live clock data out of the domain `Round`/pairing input; the existing service currently hashes whole pairing inputs, so appending moving clock fields there would be incorrect.

Store local transitions immediately and send ordered batches/checkpoints, with immediate flushes for pause/end/reporting. There are no per-second database writes. On submission, SQL/server code replays or validates accepted timing events and computes the frozen overtime; result writes retain the existing transactional behavior.

The current ordinary-command rate limit is 180/minute per IP. Ten tables may share Wi-Fi, so clock traffic needs a separate authenticated per-match/controller budget and a coarse IP safeguard sized for ten simultaneous tables. Do not disable existing protections or route every tap through the general tournament command bucket.

The server can validate event order, nonnegative elapsed time, bounds and state transitions, but a shared browser clock is not tamper-proof external timing hardware. Audited correction and participant review remain the resolution path for timing disagreements.

## 7. One controlling device and score handoff

At most one live controller owns a clock. Bind control to a match-scoped authenticated session and controller epoch, not a caller-supplied entrant ID. Other views are read-only. Also coordinate browser tabs locally; server version checks remain the final conflict guard.

Do not expire control just because a phone briefly disconnects: that would allow conflicting offline clocks. An organizer can transfer control explicitly. Transfer increments the epoch and preserves prior records; events from the old controller cannot overwrite the replacement. If the lost device has unsaved time, require a reviewed recovery rather than inventing an exact total.

End and score submission must be ordered atomically with the timing record. Reject reporting against a running clock or stale ended revision. Once a report exists, reject player resumption/reset of the clock. Organizer corrections preserve the original timing record and require a reason. A manual override is visible in review/history and still goes through the appropriate report confirmation process.

For the normal shared-phone flow, show the two raw score inputs and read-only clock-derived overtime. Expose manual overtime entry only in an explicit external-clock/manual mode or organizer correction. Existing manual tournaments retain their current behavior; they do not need a fabricated clock record.

## 8. Implementation sequence

1. **Finalize the feature contract.** Record the accepted shared-device attestation, defaults, legacy compatibility, event precision, recovery rules and version handling in an additive clock contract.
2. **Clock engine.** Add the pure timing state machine and deterministic boundary tests. No DOM, network or direct database dependencies.
3. **Private storage and service.** Implement additive migrations, match-scoped credentials, ordered event acceptance, controller conflicts, recovery metadata and ended-clock/report transactions against isolated local PostgreSQL.
4. **Responsive clock screen.** Add a dedicated shared match route, phone/iPad layouts, immediate tap switching, pause/end controls, live deductions, wake-lock handling and durable local recovery.
5. **Score and confirmation integration.** Reuse existing score calculation/presentation, add the compact two-score handoff, shared-device revision acknowledgements, and organizer correction controls. Preserve the existing individual/manual reporting path.
6. **Bounded local verification and evidence.** Execute the checks below, capture concrete results, perform one scoped review, and repair only evidenced failures. Rerun affected verification and stop when acceptance passes.
7. **Release preparation.** Deploy an additive compatible schema before enabling the new app flow. The current app requires an exact base schema version, so do not change that response in a migration that would break the still-running app; use a separate clock capability/version check during rollout. Verify this explicitly locally. Retain the manual path for legacy events.

Suggested files: `src/domain/clock.ts`, `src/domain/clock-types.ts`, `src/components/match-clock.tsx`, `src/components/shared-match-report.tsx`, `src/client/clock-storage.ts`, `src/server/clocks/service.ts`, match-clock/shared-session routes, and focused clock unit/browser/database tests. Extract only the existing reporting UI pieces needed for reuse; avoid a general rewrite of `tournament-app.tsx`.

## 9. Acceptance tests and evidence

| Group | Required proof |
| --- | --- |
| Defaults/rules | New clock defaults to 20:00 each; custom time and penalty values persist; first publication freezes rules; legacy active/final events retain their original settings. |
| Starter selection | Verify fewer firsts wins even against more seconds; equal firsts uses more seconds; exact ties exercise either outcome with injected randomness. Save one choice across refresh/retry/concurrent-device requests; no ticking before Start and no redraw on resume. Verify byes, alternating unplayed-forfeit accounting, played forfeits, manual games and organizer corrections. Selection must not change opponents or standings. |
| Switching | Only one clock runs; exact millisecond conservation across alternating turns; inactive taps, duplicate pointer events and keyboard activation behave correctly. |
| Boundaries | At 9.999/10.000/19.999/20.000 overtime seconds, deductions are 0/2/2/4. Repeated short turns accumulate correctly. Custom 3/15 and zero-deduction rules agree with scoring. |
| Manual end | Can end before either player reaches zero; ending freezes at the action time. Report entry and network delays add no overtime. Highlight appears at zero without moving the control. |
| Pause/resume | Both totals freeze while paused. Resume returns to the correct player and preserves elapsed time. Accidental end can resume only before a report exists. |
| Phone/iPad | Screenshot and interaction evidence at the viewport sizes above, both orientations and tablet split view. Essential clock controls fit without scrolling; report fields remain usable with the keyboard and enlarged text. |
| Recovery | Refresh, navigation back, hidden tab, simulated suspension, lost wake lock, delayed rendering, offline taps/end, reconnect and server restart preserve valid time/state. Ambiguous clock jumps are surfaced for review. |
| Controllers/security | Another match, anonymous visitor, revoked device or stale epoch cannot control/report this game; two tabs/devices cannot create divergent accepted timelines. Shared credentials are not exposed in public snapshots. |
| Report revisions | Both shared-device acknowledgements must reference the same raw-score and timing revision; editing clears them. Stale acknowledgements and reporting while running are rejected. |
| Scoring/tiebreak | Realistic 401–399 game: A uses 20:20 and B uses 19:50; deductions 4/0 produce 397–399 and differential −2 for A. Verify preview, stored result, public standings, and a resulting tied-point reorder. |
| Concurrent tables | Ten local table controllers can switch, checkpoint and report under shared-IP limits without clock drift, duplicate events, tournament-version churn or false rate-limit failures. |
| Compatibility | Existing manual reporting/dispute/confirmation and organizer correction behavior still passes directly affected tests; byes/forfeits do not require clock play. Old app/schema compatibility is checked before rollout. |

Use Playwright's controlled time for automated boundary/workflow tests and an independent elapsed-time oracle, not the production clock reducer as its own expected answer. Preserve zero automatic retries and sanitized failure artifacts. Browser emulation is not proof of physical iOS sleep or virtual-keyboard behavior: record one physical iPhone Safari and iPad Safari smoke check when devices are available, and label that evidence pending until performed.

After the targeted checks pass, run one clock-enabled 20-player/six-round local event with frozen realistic 300–450 scores, accelerated time and ten table contexts. Route all 60 matches through starter selection, clock start/switch/end and shared-device reporting. Independently verify every starter against the prior-round first/second counts and recorded draw; report each player's final counts without requiring an exact 3/3 split or claiming that a small sample proves random fairness. Compare all six standings checkpoints and pairings with the existing independent reference checks. Capture starter/method/counts, raw score, used milliseconds, overtime, deduction, report revision, confirmation method and expected/actual standings in the evidence ledger. Reuse the existing broader tiebreak proofs rather than inventing another unrelated test campaign.

Completion means the requested clock/report flow works, every directly applicable acceptance group has evidence, required physical-device checks are either performed or explicitly unresolved, and no production application behavior has been changed merely to accommodate a test. Implementation, one bounded logic review, merge and deployment are authorized.
