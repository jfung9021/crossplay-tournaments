# Live tournament TV and website visual refresh plan

October 8, 2026. Implementation authorized. Three subagents own public data, the TV page and the visual refresh; the parent integrates and verifies the complete scope, then performs one general review. Release evidence will record the direct acceptance results and any hardware limitations.

Build a public tournament display for a computer connected to a 1920×1080 TV, alongside a consistent visual refresh of the existing phone, iPad and desktop website. The normal event has eighteen players, nine matches and nine phones serving nine tables. Keep all nine current matches and all eighteen standings visible together at this size.

This supplements the [application specification](implementation-plan.md), [integration contract](integration-contract.md), [clock contract](clock-integration-contract.md) and [completed table workflow](table-device-workflow-implementation-plan.md). Application work belongs here; any production SQL migration belongs only in `C:/Users/jfung/bite-open-card-draw`.

## Confirmed tournament behavior

Swiss opponents for later rounds depend on completed earlier results. A table assignment persists for the device, while players change when the organizer publishes each round. The TV must never predict opponents or expose an unpublished pairing preview.

For the expected nine matches and nine phones, the normal flow is:

1. Publish the round and show the nine pairings at their physical tables.
2. Each phone opens its assigned match, operates the timer and reports the result.
3. After its result becomes official, that phone retains its table assignment and waits for the next round. The TV keeps the completed match visible while the other tables finish.
4. Once all results are resolved, the organizer generates and publishes the next round. The TV and phones then show those newly published pairings.

Same-round queues remain an existing fallback for fewer usable tables; they are not the normal event workflow. If needed, label them explicitly as “Later this round at Table 3.” A spare phone can replace another at the same table without closing that physical table. No automatic device reassignment, round publication or timer start is added.

Standings continue to award one point for a win and half a point for a draw, then use adjusted score difference. Exact ties share a rank. Withdrawn players retain their earned rank and historical results and are excluded only from future pairings.

## The default 1080p screen

Use `/t/[slug]/display` without the normal site header, navigation or footer. Start with a 48 px safe margin on each edge, no page scrolling, and a prominent fullscreen button that fades after entry and returns on pointer or keyboard activity. Browser fullscreen requires an explicit click. The display remains useful without fullscreen.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Event name                 Round 3 of 5         6 of 9 results final  │
├───────────────────────────────────────────┬──────────────────────────┤
│ Table 1       Table 2       Table 3        │ Standings                │
│ players       players       players       │ Rank  Player  Points  Δ  │
│ status        status        status        │ 1     …                  │
│                                           │ 2     …                  │
│ Table 4       Table 5       Table 6        │ …                        │
│ players       players       players       │ All 18 players           │
│ status        status        status        │                          │
│                                           │                          │
│ Table 7       Table 8       Table 9        │                          │
│ players       players       players       │                          │
│ status        status        status        │                          │
├───────────────────────────────────────────┴──────────────────────────┤
│ Latest confirmed result     Updated 4 seconds ago       Public QR    │
└──────────────────────────────────────────────────────────────────────┘
```

Allocate approximately two thirds of the body to the 3×3 table grid and one third to standings. At 1080p, start with a 100 px header, 740 px body and 104 px footer, separated by 20 px gaps inside the safe area. These are layout targets to verify with actual text, not fixed heights for the ordinary website.

| Area | Content and behavior |
| --- | --- |
| Header | Event name, current published round, event phase and official result progress. Use actual match totals after departures; a published bye is shown separately from the played-match count. |
| Nine table cards | Stable physical table number, both player names and a readable text status. Keep cards in table order so spectators can find their table immediately. Show adjusted scores only after an official result. |
| Standings | Rank, player, points and signed adjusted difference, with a short legend. Show all eighteen entrants in the normal layout, including withdrawn entrants. Never force shared ranks into distinct podium positions. |
| Footer | Most recent confirmed result, connection freshness and QR/link to public standings. With no confirmed result, show a short event instruction. Avoid a moving ticker. |

Use approximately 44–52 px for the event heading, 28–32 px for match names and table labels, and at least 24 px for standings and supporting TV text. Use tabular numerals for points, scores and progress. Leave room for two-line names on cards. Unusually long standings names switch the sidebar to fewer rows per page rather than shrinking text below the minimum; the full name must appear on its page.

With more than nine tables or more entrants than fit, rotate only the overflowing region every 15 seconds, with visible page numbers and a pause control. Reset table pagination on a new published round. The normal eighteen-player event needs no automatic page rotation. At lower browser viewport sizes, use fewer items per page rather than clipping or compressing everything; 1920×1080 at 100% zoom remains the primary target.

## Event states and truthful live status

| State | What spectators see |
| --- | --- |
| Before first publication | “Tournament not yet available” with retry. Private event names and rosters remain hidden; the display loads them once the first round is published. |
| Round underway | All current published pairings, official standings to date and per-table status. Results update in place without reordering table cards. |
| Match complete | Official score and winner or draw; the card remains until the next round is published. |
| All results final | “Round complete — waiting for the next round to be published.” No predicted names or countdown to an unscheduled start. |
| Tournament finished | Final standings become the main content, with tied ranks and withdrawn players preserved. The final-results QR remains available. |
| Archived published event | Recorded results with an archived label; no suggestion that play is ongoing. |
| Reset or deleted event | Clear prior pairings and results. A reset draft becomes unavailable publicly; deletion shows an unavailable state. |
| Connection interrupted | Retain the last successful snapshot with “Connection lost — last updated …”. Do not silently present it as current. |

The first release shows status, not a ticking match countdown. The current clock saves authoritative checkpoints while phones may continue locally; extrapolating an old checkpoint could misrepresent remaining time. Labels such as Ready, Playing, Paused, Reporting, Awaiting confirmation, Organizer review and Final must derive from explicit server states. Where reliable clock status is unavailable, use “Result outstanding” rather than infer that a match is running.

Display connection freshness describes the TV's connection. It must not imply that a table phone is connected or synchronized. Treat a clock state as the last saved state; display no player turn indicator or device health claim. A later live-clock feature would need a separate freshness and synchronization design.

## Public data and update design

Add one aggregate `GET /api/tournaments/[idOrSlug]/display` response containing only public display information: event phase, run generation, published rounds and locations, official results, standings, safe status labels and server time. Exclude organizer identities, device IDs and labels, access tokens, report drafts, unconfirmed scores, dispute reasons, audit notes and unpublished pairings. Force this public projection even when the TV browser happens to be signed in as an organizer.

The existing snapshot contains locations and official standings, but full clock reads are authorized per match. Add an additive, function-only public display projection in the SQL owner repository to expose only the allowed status fields. Avoid nine authorized clock requests or widening the existing clock endpoint. Reuse the established standings calculation and location helpers so TV results match the website.

Build the projection from one coherent database read. Its revision must reflect every visible result, round, location and clock-status change; tournament version alone may not change for clock operations. Return a stable display revision or ETag separately from `serverNow`. Use that revision for efficient refreshes, while request sequencing prevents older responses from replacing newer snapshots.

Poll every five seconds with at most one request in flight. Retain the last good data on transient failures, show a stale indicator after fifteen seconds without a successful response, and back off to at most thirty seconds between failed attempts. Refresh immediately on focus, reconnection and manual retry. Authoritative not-found/private responses clear the old display. A generation change discards prior-round local state. No display action writes tournament or timer state.

Capability-gate the richer display read. If the database extension is absent, keep the display useful with published pairings, standings and coarse result status from the existing public read. Deploy the additive migration before enabling its consuming app build. Keep credentials and actor verification server-only and preserve private-schema permissions.

## Website visual direction

Use a restrained word-game look: light paper surfaces, dark readable type, strong table-number tiles, consistent spacing and a small set of accents inspired by Crossplay. The publisher's [Crossplay Google Play listing](https://play.google.com/store/apps/details?hl=en&id=com.nytimes.wordgame) and [App Store listing](https://apps.apple.com/us/app/nyt-crossplay-word-games/id6615086509) provide the visual references. Choose exact accent values from those references during the design step and record them as project tokens; do not label sampled values as official NYT specifications.

The current site uses a system font and a mostly white/green palette. Replace isolated color rules with shared roles for text, muted text, paper, surface, border, brand accent, active navigation, focus, success, waiting and danger. Brand color should connect the product visually; status must also have words and icons. Preserve distinct clock sides and the existing face-to-face layout.

| Element | Proposed treatment |
| --- | --- |
| Brand and headings | An original tournament wordmark with a simple letter-tile motif, heavier headings and a consistent hierarchy. Keep decorative lettering out of forms and clocks. |
| Typography | Self-host Inter for controls, names, standings and tabular numbers. Compare a Roboto Slab heading treatment with bold Inter in the first mockup. These are proposed alternatives, not claims about Crossplay's actual fonts. |
| Color | A Crossplay-inspired accent family on warm white surfaces, with dark text and separately defined status colors. Approve concrete swatches with contrast measurements before applying them globally. |
| Navigation | Clear active tabs, a prominent assigned-table summary and one obvious next action. On phones, reserve the top of the table page for match or waiting status. |
| Match cards and results | Consistent table tiles, aligned player/score columns, legible states and a distinct saved-result receipt. Omit queue-position decoration when a table has only one match in that round. |
| Forms and organizer tools | Group related fields, preserve labels, strengthen primary/secondary/destructive distinctions and provide at least 44 px touch targets. Keep attention filters and departure consequences easy to scan. |
| Standings | Aligned numerical columns, restrained row separators and clear withdrawn labels without visually demoting a player's rank. |
| Motion | Static by default with brief, restrained result transitions. Respect system reduced-motion preferences; no flashing, marquee text or compulsory celebration animation. |

Inter is designed for screen interfaces and supports tabular figures under the SIL Open Font License. Roboto Slab's upstream repository identifies an Apache 2.0 license. Preserve the license distributed with whichever pinned font files are shipped. [Inter](https://rsms.me/inter/), [Roboto Slab](https://github.com/googlefonts/robotoslab).

Exact NYT Crossplay font families and webfont permissions remain unverified. Use an exact branded font only if suitable files and permission are available; the licensed alternatives allow the refresh to proceed. Keep the tournament's own identity rather than adding an NYT masthead or implying official sponsorship.

## Implementation sequence

| Phase | Work and completion evidence |
| --- | --- |
| 1 — Visual specification | Establish palette/type/spacing tokens and make concrete 1080p mockups for nine matches, between rounds and final standings. Show matching phone and iPad table/report screens. Record the selected font files and licenses. Resolve the one-match queue label as part of the planned UI refresh. |
| 2 — Public display data | Add the scoped owner migration and safe display contract. Test only that new migration's projection, permissions, published-only behavior and consistent result/status reads. Add app response shaping and the capability fallback. |
| 3 — TV page | Implement the dedicated route, 3×3 grid, eighteen-row standings, state transitions, polling/recovery, public QR, fullscreen and overflow pagination. Add “Open TV display” to the tournament overview with a copyable public URL. Isolate display layout without disrupting existing routes. |
| 4 — Website refresh | Apply shared tokens and components across tournament lists, sign-in, setup, matches, My table, clock/reporting, table management, departures, standings and history. Preserve form drafts, navigation, keyboard focus and timer touch behavior. |
| 5 — Acceptance and release | Run directly relevant checks, capture TV/phone/iPad evidence, complete one general review and only evidenced repairs. Release the additive database work first, then the app. Verify production with read-only checks and stop when acceptance passes. |

Likely application touchpoints are `src/app/globals.css`, `src/app/layout.tsx`, existing tournament/table/clock/report components, a new display page and API route, and a small public display model. Put shared visual tokens and primitives in dedicated files so component-specific clock geometry remains controlled. No pairing engine or scoring changes are planned.

If visual work needs another iteration, the TV route and new styles can be released separately. Rollback can disable the display link/route or restore prior styles while leaving the additive projection in place; no tournament records need to be rewritten or removed.

## Direct acceptance checks

- At 1920×1080, the normal eighteen-player round shows all nine table cards and all eighteen standings without scrolling, clipping or tiny text. Capture ready, playing, mixed final/pending, between-round and final states.
- Each phone's completed match leads to its persistent table waiting state. The TV and phones show later opponents only after publication; all-nine-complete alone must not publish or invent a round.
- Departures reduce later match totals correctly, retain prior results/rank and show byes separately. Exact ties retain shared ranks on both live and final displays.
- A published result or round change appears within ten seconds on a healthy connection. Delayed responses cannot reverse updates. Disconnect, retry, reset, archive and deletion have the specified visible behavior.
- Unconfirmed scores, private reasons, device/session details and draft pairings never appear in public display responses, including a request carrying an organizer cookie. Status remains accurate when clocks are unavailable or unsynchronized.
- Longer names, one table, more than nine tables and the existing maximum roster size paginate without hiding entrants permanently. All pages remain reachable. TV controls work with keyboard and fullscreen exit.
- Phone 390×844, iPad portrait 820×1180 and iPad landscape retain usable table/report/organizer flows. Font changes do not clip timer digits or invert player-side identity. Verify contrast, visible focus and touch targets.
- Run app typecheck, lint, unit tests and build, plus focused browser scenarios for display updates, overflow, public privacy and the affected existing workflows. Do not rerun unrelated database suites. Perform one general implementation review, then only focused repair checks.

Physical TV readability at the actual venue distance and computer display scaling require a short check on the user's hardware. Automated viewport screenshots can confirm fitting and state behavior but cannot establish across-room readability.

## Deferred features

Live ticking match clocks, live move-by-move Crossplay scores, predicted pairings, remote match control, announcement editing, scheduled break countdowns, audio alerts and broadcast overlays are outside this first implementation. The app currently receives official reported results, so it cannot show a live in-game score without a separate source. A later announcement feature can add a deliberate organizer message without changing the default nine-table display.
