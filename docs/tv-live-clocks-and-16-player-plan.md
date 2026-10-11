# TV clocks scores and 16 player standings plan

October 11, 2026. Implementation authorized after planning. Application and migration source changes are recorded in [implementation status](tv-live-clocks-implementation-status.md); uncompleted verification and deployment remain explicit there.

Add remaining match time for both players, show submitted scores with an explicit pending label, and make sixteen standings rows occupy the full available height. Use a 1920×1080 TV at 100% browser zoom as the primary target. The user confirmed that submitted scores should appear before confirmation and become final afterward.

This extends the [TV plan](tv-display-and-visual-refresh-plan.md), [visual specification](tv-visual-design.md), [integration contract](integration-contract.md), and [clock contract](clock-integration-contract.md). For this feature, sixteen players replace eighteen as the normal layout assumption, and public pending scores replace the earlier final-only display policy. Pairing, scoring, confirmation, and official clock rules remain as specified in those contracts.

## Proposed screen

Give roughly 60% of the body width to eight table cards in two columns and four rows, and 40% to standings. Keep table order stable. At 1080p, retain the existing safe margins and approximately 740 px body height; eight compact cards fit into four roughly 173 px rows with 16 px gaps.

```text
Event name                         Round 3 of 5       3 of 8 final

Table 1              Table 2       Standings       Pts    +/−
Alex       12:34      Casey  09:18   1  Player name   2.5   +120
Morgan     08:52      Jamie  11:03   2  Player name   2     +85
Playing              Playing       3  Player name   2     +62
                                   4  Player name   2     +40
Table 3              Table 4        …
…                    …             …

Table 5              Table 6        …
…                    …             …

Table 7              Table 8       14  Player name   0.5   −60
Alex         410      Casey   389  15  Player name   0     −90
Morgan       385      Jamie   401  16  Player name   0     −110
Awaiting confirmation Final

Latest final result                    Connection          Public QR
```

Names, numbers, and positions above illustrate geometry rather than a consistent tournament dataset. The actual sixteen rows are evenly distributed from the column headings to the bottom of the body.

Each card has a compact table/status heading and two aligned player rows. Reserve the numeric area from first paint so replacing time with scores does not move the names. Use approximately 28–30 px match names and 30–34 px clock/score digits, existing tabular numerals, and the established paper/blue/green palette. “Playing,” “Paused,” “Awaiting confirmation,” and “Final” identify what the numbers mean. A running-side mark includes a text or shape cue, not color alone. Clock digits do not flip, pulse, or slide.

## Standings that fill the panel

Use the panel's available height, after its title, legend, and column headings, to size the rows. In the normal sixteen-player layout:

`row height = available standings row area / 16`

Center each name and its numbers vertically within its row. Start around 26 px name text and 24–26 px numeric text, retaining at least 24 px essential TV text. Keep rank, points, and difference columns narrow and aligned; allocate the remaining width to names. The last row should reach the bottom of the standings area, with no large blank block underneath.

Implement this using the existing semantic table and explicit measured row heights, or an equivalent accessible layout. Measure on viewport, font, roster, and name-width changes. Do not measure on each clock tick or heartbeat. When a name needs extra lines, give it its measured minimum height, then distribute the remaining height across the rows. If those minimum heights cannot fit, use the existing readable pagination fallback instead of clipping names or shrinking below the TV minimum.

With fewer than sixteen entrants, fill the panel with the actual rows; do not invent empty players. Withdrawn entrants still count as rows and retain their earned positions. With larger rosters, retain measured pagination, fifteen-second rotation, and pause/next controls. Preserve support for the existing eighteen-player fixture where it fits. Sixteen ordinary names require one page at 1080p. Lower resolutions and unusually long names may paginate. Final standings use the same full-height treatment across the wider final-results view.

## Score and clock states

| State | Table card | Standings and progress |
| --- | --- | --- |
| Ready | Both starting time allowances; Ready | Official results only |
| Playing | Both remaining times in m:ss; active-side marker | Unchanged until finalization |
| Overtime | Overtime duration with an explicit OT label | Existing server penalty rules determine the submitted score |
| Paused | Frozen saved times; Paused | Unchanged |
| Ended without a report | Frozen times; Reporting | Unchanged |
| Submitted | Both server-calculated adjusted scores; Awaiting confirmation in the waiting color | Pending scores do not award points or increment the final count |
| Submitted report edited | Replace the pending pair of scores together with the new report revision | Existing acknowledgements reset under the existing workflow |
| Disputed or timing review | Organizer review; hide provisional scores and stop live projection | Official standings remain unchanged |
| Final | Official adjusted scores and winner/draw treatment | Update standings and final count from the same response |
| No app clock or queued match | External timer, Result outstanding, or Later this round as appropriate | No invented countdown |
| Archived or finished | Recorded results; no running timers | Existing recorded/final standings behavior |

Use a brief background change on submission/finalization, with reduced-motion support. Keep cards in their table positions. The footer's latest result remains the latest **final** result; a pending report does not displace it. An organizer correction replaces the official scores and standings together. Do not expose form drafts or live in-game Crossplay scores.

## Keeping time smooth and trustworthy

Separate three concerns: the table phone's clock, the public network snapshot, and the TV's rendering cadence. A network response supplies a checkpoint; it does not drive every visible second.

The current implementation needs more than an extra countdown component. The display DTO has only saved statuses. Table phones flush queued switches on a one-second interval, and an uninterrupted turn can have no new saved event for a long time. Furthermore, `anchorAtMs` comes from the phone's wall clock. Subtracting it directly from TV or server time would mix different clocks. A fresh TV request also does not prove that a table phone is still synchronized.

### Controller checkpoints

Add a small, display-only checkpoint from the authenticated controlling phone every two seconds while the clock screen is visible, plus after accepted start, switch, pause, resume, and end events. Schedule switch saving immediately through the existing serialized flush mechanism; preserve local responsiveness and the existing journal/retry rules.

Capture a checkpoint only after pending gameplay events have been acknowledged, and only while the local journal considers timing reliable. Bind it to tournament generation, match, controller ownership, clock epoch, clock version, and event sequence. Derive the additional elapsed duration from the phone's existing monotonic journal. SQL reconstructs the display time from accepted used milliseconds plus that running-side duration. This is spectator telemetry; it must never update official elapsed time, overtime, reports, pairing inputs, or tournament versions.

Use a separate authenticated checkpoint endpoint and a function-only SQL capability. Retain only the latest checkpoint per match. Serialize validation with clock changes using the established lock order; reject outdated generations, owners, epochs, and versions, and ignore duplicate or older samples. Stop publishing on control loss, hidden screens, uncertain timing, or unsaved events. Do not queue or replay telemetry after an offline period; reconnect, reconcile, then send a newly captured sample. Existing older phone clients simply produce no live checkpoint.

Calibrate a server-time estimate against `performance.now()` using request send/receive samples, round-trip duration, and a server timestamp captured near response generation. Carry the sample time and uncertainty with telemetry; retain server receipt time separately. Apply this calibration on both the phone and TV. Reject late/future samples beyond the allowed uncertainty and expire against the original sample time, so a delayed upload cannot become fresh merely by arriving late. Do not compare `performance.now()` values from different devices.

Use one-second maximum combined timing uncertainty as the initial cutoff for displaying a live estimate. If the connection cannot support it, show a saved/stale clock instead of claiming precision. Server and controller sampling details, bounds, and SQL capability version must be recorded in the clock contract during implementation.

### Public feed

Keep one aggregate display request per TV. Poll on a one-second target cadence during active play, using at most one request in flight, and five seconds between rounds or after completion. Preserve failure backoff, focus/reconnection refresh, explicit retry, and clearing on authoritative unavailability. Bound slow requests so a hung call cannot keep the display apparently live.

Extend the public projection with safe clock samples and submitted adjusted scores. Read results, reports, clock versions, and telemetry coherently. Filter incompatible samples before projection. Keep the browser independent of the private clock endpoint and of table credentials.

Separate the content revision from clock sample revisions and response time. A heartbeat or fresh server timestamp must not invalidate the whole standings/table tree. Likewise, unchanged content must not discard fresh timing calibration: the current hook retains the entire previous DTO when its revision is unchanged, so synchronization metadata needs its own update path. Keep content ETag/revision semantics explicit if the response contract changes; do not use a content-only ETag as proof that timing metadata is unchanged.

Start with aggregate polling for this eight-table scope. Smooth digits do not require WebSockets. Push notifications can be considered separately if measured latency/load fails the acceptance targets; they should invalidate or deliver the same safe snapshots and preserve reconnect recovery. Do not add a second transport preemptively.

### Local rendering

Anchor each accepted sample to the TV's monotonic time. Compute running-side elapsed time from that anchor on each render opportunity. Reuse the existing rounding and overtime rules in `deriveClock`; never decrement a React counter by one and assume a timer fired on schedule. `performance.now()` is monotonic and unaffected by wall-clock adjustments. [MDN timing reference](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)

Use one shared visible-screen scheduler, checking approximately every 100 ms and committing only changed formatted digits/statuses. There is no need to rerender sixteen players at 60 fps. Give clock text its own subscribed component; keep standings, QR, names, pagination, and connection-age updates isolated. Stable props and memoized static regions can avoid unrelated React renders. [React memo reference](https://react.dev/reference/react/memo)

Keep old content visible while fetching; never replace it with a loading skeleton on a refresh. Preserve match and entrant keys. Reserve numeric widths and status space. Remove ticking content from hidden measurement samples; measure geometry only when a structural input changes. These changes avoid routine layout movement and repeated measurement work.

Apply an accepted pause, side change, final result, epoch change, or organizer correction immediately. Do not smooth away a real correction. For an unchanged running state, update the time anchor without remounting the card. On a delayed callback, render the currently derived time once rather than replaying missed ticks. Suspend work while hidden and require a fresh synchronization after visibility return or detected sleep. Animation callbacks may pause in background tabs, so callback counts cannot represent elapsed time. [MDN animation scheduling](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

### Freshness and outage behavior

Track TV-feed freshness and each controller checkpoint's freshness independently. Initially, expire live clock projection after six seconds without a valid table sample, or sooner if the TV feed is known to have failed. Freeze the last displayed estimate with Clock stale and the sample age; explain that it is the last estimate rather than a saved official time. Never roll silently back to an older checkpoint. A healthy aggregate poll must not refresh an old table sample's age.

On recovery, accept only a compatible newer sample, then resume projection. For a version change without a compatible sample, show the new saved state with Synchronizing instead of extrapolating the previous side. Keep the current fifteen-second stale threshold for the broader tournament feed; the more sensitive clock indicator acts sooner. Old samples must not revive clocks after finalization, archive, reset, deletion, or controller replacement.

## Application and database work

| Work | Main touchpoints |
| --- | --- |
| Clock and provisional-score contract | `src/domain/display.ts`, `src/server/display/model.ts`, `src/server/display/service.ts`; add clock sample and provisional result types separate from official `result` |
| Controller telemetry | `src/components/match-clock.tsx`, `src/client/clock-storage.ts`, clock API/validation/service modules, new authenticated checkpoint route; preserve existing event journal semantics |
| Feed and time projection | `src/client/use-tournament-display.ts`, new display timing hook/helper, public display route; separate content/timing/freshness updates |
| TV presentation | `src/components/tournament-display.tsx`, its CSS module, and `src/client/display-pagination.ts`; 2×4 normal grid, clocks/scores, height-filling standings |
| SQL capability | Additive migration only in `C:/Users/jfung/bite-open-card-draw`; private telemetry storage and authenticated writer, expanded published-only display projection, capability and focused permission checks |
| Contract documentation | Update the integration, clock, and TV visual contracts when implemented, including the intentional public pending-score policy change |

Allowlist only pending adjusted scores and their revision/state; omit submitter identity, dispute reasons, report internals, controller/device identities, credentials, and unpublished pairings. Derive pending adjusted values server-side using existing scoring rules. Keep actor verification and SQL access server-only. Public GET requests never write checkpoints or claim control.

Deploy the additive owner migration before enabling its application consumer. Capability-gate the richer response and controller writer. When unavailable, continue showing the existing official results and saved statuses; use no fabricated live clocks or provisional scores. Rollback can disable the richer capability in the app without rewriting tournament records.

## Implementation order and completion checks

1. **Layout and presentation:** implement the 1080p sixteen-player layout and fixture states for running clocks, submitted scores, and finals. Verify geometry before wiring live data. Preserve existing overflow and final-results views.
2. **Data and timing:** implement the owner capability, public pending projection, controller checkpoints, time calibration, and deterministic projection/freshness helpers. Verify authority and version boundaries before enabling live rendering.
3. **Integration:** connect the feed and isolated clock components. Confirm the shared result workflow submits, edits, confirms, disputes, and corrects scores without partial TV updates.
4. **Acceptance:** run relevant tests and one general review, make only evidenced focused repairs, rerun affected checks, and stop.

Direct acceptance criteria:

- At 1920×1080, all eight cards and all sixteen ordinary-name standings rows appear together without clipping, scrolling, or rotation. The final row ends within two CSS pixels of the standings row area's bottom. Essential text remains at least 24 px. Verify running, mixed pending/final, round-complete, and final-standings screenshots.
- Verify long names, shared ranks, negative differences, withdrawn players, byes, fewer/more players, and 1366×768 fallback. All overflow pages remain reachable; no clipped full names or invented rows.
- On a controlled healthy connection with requests completing within 300 ms, a committed submission/finalization appears within two seconds. Start, switch, pause, and end appear within three seconds of the action. Pending scores remain excluded from points, final counts, and latest-final notices.
- With fresh samples and no intervening state change, TV time stays within one displayed second of the controller over a ten-minute test. Exercise device wall-clock offsets, latency variation, a delayed callback, zero/overtime boundaries, and pause/resume. These are targets to verify, not guarantees established by this plan.
- At six seconds without a valid controller sample, a running clock is visibly stale and stops projecting. Test an offline phone while the TV remains online, TV disconnection, telemetry arriving late, hidden-tab return, and loss of control. Recovery cannot revive a prior epoch/run or a final match.
- Test rapid submit/edit/confirm and official correction: each response shows one coherent score revision, with no older response restoring a pending score after finalization. Test dispute and timing-review hiding of provisional scores.
- Test the expanded public allowlist with organizer cookies and the capability fallback. Check that unauthorized telemetry, stale clock versions, and previous controllers cannot publish accepted samples or change official scoring/time.
- Capture a production-build browser trace with eight active clocks and a result update. During steady ticking, standings geometry and card positions stay unchanged; no full-page remounts or per-tick row/card measurements occur. Target no recurring tasks over 50 ms attributable to display updates. Do a short venue-TV check for actual readability and stutter; viewport screenshots alone cannot prove either.
- Measure eight two-second checkpoint publishers plus one TV poller (about four telemetry writes and one aggregate read per second before action-triggered updates). Confirm sustained response times meet the latency target without a request backlog. Do not loosen timing claims or introduce extra infrastructure without evidence from this check.

Use focused unit tests for projection, rounding, version ordering, and freshness; server tests for pending-score privacy and coherent responses; browser tests for report transitions, outages, and layout. Extend `tests/server/display.test.ts`, `tests/e2e/clock/display-ui.spec.ts`, and relevant clock/journal tests. Run application lint, typecheck, relevant unit/browser suites, and build. Run only the new migration's relevant SQL checks in its owning repository.

No proven implementation blocker was found during planning. The required database capability and hardware timing/readability checks remain implementation dependencies. The earlier public-pending-score restriction and eighteen-player default are superseded only for this requested feature; broader website redesign and unrelated changes are outside this plan.
