# Crossplay tournament smoke test checklist

Use this checklist to verify tournament setup, Swiss pairing, scores and standings, shared clocks, player access, and recovery on phones and iPads. Run the quick pass before an event. Run the detailed checks for a release or a full rehearsal, with the automated suites providing the exact arithmetic, concurrency, and 60-match evidence.

Prepared 2026-10-06. All checkboxes below are unexecuted for this run. Earlier passing results are recorded in [clock release evidence](clock-release.md) and [Swiss validation results](swiss20-validation-results.md); they do not mark a new deployment or device as tested.

A subsequent [October 6 full tournament run](smoke-test-results-2026-10-06.md) completed all 60 shared-clock matches through the finished results screens. That focused result does not mark every checklist item complete; use the run record for its exact coverage.

## Record the run

| Field | Record |
| --- | --- |
| Tester and date | |
| App URL and deployed commit | |
| Database environment | Local / isolated preview / production |
| Tournament names and IDs | |
| Device and OS versions | |
| Browser and version | |
| Connection | Wi-Fi / cellular / offline scenario |
| Checks completed | Quick / detailed / automated / physical devices |
| Result | PASS / FAIL / BLOCKED / NOT RUN |
| Evidence directory or links | |

Check a box only after observing its expected result. For a failure, record the check ID, inputs, expected and actual values, device, time, and screenshot or sanitized response. A blocked or unrun check is not a pass.

## Prepare the test environment

- [ ] **SETUP-01** Use disposable tournaments named `SMOKE YYYY-MM-DD <scenario>`. Run simulated disconnects, races, clock changes, and fixture automation locally or against an isolated test environment. Never point the automated runners at production.
- [ ] **SETUP-02** For physical devices, use an HTTPS test URL accessible from the device and verify which database it uses. A phone's `localhost` is the phone itself. HTTPS is also needed for normal wake-lock testing.
- [ ] **SETUP-03** Prepare an organizer browser, a signed-out spectator browser, two separate browser profiles for individual players, and one shared phone or iPad. Two tabs in the same profile do not provide independent player identities.
- [ ] **SETUP-04** Use fresh matches for independent clock/report scenarios. A finalized match cannot be reset by players. Preserve failure evidence before replacing links or correcting results.
- [ ] **SETUP-05** Keep passwords, private invitation fragments, session cookies, and `.local/**/private-auth.json` out of screenshots and shared evidence. Record tournament/match IDs instead.

Recommended disposable events:

| Event | Players and rounds | Configuration and use |
| --- | --- | --- |
| Quick clock | 2 players, 1 round | Default 20 minutes, 2 points per completed 10 seconds |
| Short clock | 2 players, 1 round per scenario | 1 minute per player; same penalty for quick overtime and recovery exercises |
| Manual Swiss | 4 players, 2 rounds | Blank Minutes per player; hand-calculated standings exercise below |
| Full rehearsal | 20 players, 6 rounds | Default 20 minutes; automated accelerated clocks and frozen realistic scores |
| Odd field | 5 players, 3 rounds | Byes, withdrawals, forfeits |
| Impossible pairing | 4 players, 3 rounds | Deliberately reduce to two players who already met |
| Custom rules | 2 players, 1 round per configuration | 3 points per 15 seconds, then a separate zero-deduction event |

Scores of 300–450 are the normal dummy data range. Deliberately invalid or artificial numeric boundaries are separate checks, not typical games.

## Quick pass before an event

This pass takes approximately 15–25 minutes after setup. Physical sleep checks and the full rehearsal are separate.

- [ ] **QUICK-01** Open [the production site](https://crossplay-tournaments.vercel.app/) and the intended test environment. Public pages load; organizer sign-in succeeds only with the authorized account.
- [ ] **QUICK-02** Create Quick clock. Confirm 20 minutes per player, 2 points per 10 seconds, and one round. Paste two names into Player names; exactly two entrants appear after refresh.
- [ ] **QUICK-03** Preview round 1, inspect its single match, then publish. The spectator sees it only after publication. Competitive settings are now locked.
- [ ] **QUICK-04** Sign in on the shared device and choose Start Match on its match card. Correct names, round, table, two 20:00 clocks, and a starter appear. Wait five seconds: neither clock runs before Start Timer. No special timer link is needed or displayed.
- [ ] **QUICK-05** Start, switch turns several times, tap the inactive side, then pause and resume. Only the active side loses time; an inactive-side tap changes nothing; pause freezes both clocks.
- [ ] **QUICK-06** Refresh during play. The same side resumes with elapsed time accounted for. Pause and use Flip sides: names and their times move together without changing who is active.
- [ ] **QUICK-07** End game before time expires. Enter actual scores 401 and 399. Wait 15 seconds on the form: overtime and deductions stay frozen.
- [ ] **QUICK-08** Tap Review scores, then only the first named agreement. The result remains pending and standings remain unchanged. Tap the other agreement: Match complete appears and standings award 1/0 points and +2/−2 difference.
- [ ] **QUICK-09** Refresh the shared screen and spectator page. The same final result remains. Finish tournament; final standings and player history remain available.
- [ ] **QUICK-10** In Short clock, allow 20 completed overtime seconds on one side. That side loses 4 points; End game is highlighted and still usable. Report 401–399: adjusted scores are 397–399, with the winner reversed. Complete this on the device intended for play.

## Tournament setup and roster

- [ ] **SET-01** Create a tournament with a name and optional date. Refresh and reopen it from Your tournaments: both values and all rules persist. A blank name is rejected without creating a tournament.
- [ ] **SET-02** Leave Rounds blank. With 2, 3, 4, 5, 16, 20, and 33 active players, the automatic suggestion is respectively 1, 2, 2, 3, 4, 5, and 6. Use separate drafts or the automated roster checks for this matrix. Twenty players do not automatically imply six rounds.
- [ ] **SET-03** Set 20 players to six rounds explicitly. Save, refresh, and publish round 1: the tournament retains six rounds. Changing rounds, time limit, or penalties after publication is unavailable and rejected at the server boundary.
- [ ] **SET-04** Before publication, save a custom time limit and 3 points per 15 seconds. The Rules page agrees. A separate blank time limit enables external-clock/manual reporting; it does not silently become 20 minutes.
- [ ] **SET-05** Reject zero/negative/fractional rounds, negative deductions, zero penalty interval, and excessive settings. Enforced limits are rounds 1–255, deduction 0–100 whole points, interval 1–3,600 whole seconds, and time limit 1–86,400 whole stored seconds. A zero deduction is valid.
- [ ] **SET-06** With fewer than two active entrants, starting is unavailable. Reject an impossible requested round count before play: four players allow at most three no-rematch rounds, five allow at most five. These limits do not guarantee feasibility after withdrawals.
- [ ] **ROSTER-01** Paste the 20 names below in one box. Preview says 20 players to add. Add players persists exactly 20, with no padded slots or duplicates after refresh.
- [ ] **ROSTER-02** In a separate draft, paste names with leading/trailing spaces, blank lines, Windows line endings, and ordinary Unicode names such as `Élodie Martin` and `山田 太郎`. Blank lines are ignored and valid names display correctly.
- [ ] **ROSTER-03** Try `Alex Rowan` and ` alex rowan ` in the same batch, then against an existing entrant. A line-specific duplicate error prevents the entire invalid batch from being saved. Fix the input and submit: each new name appears once.
- [ ] **ROSTER-04** Reject an 81-character name, control characters, and a roster exceeding 256 players. Ordinary punctuation and valid Unicode do not create extra players. Exercise 256/257 locally with automation.
- [ ] **ROSTER-05** Rename and remove a draft entrant. Counts update; a duplicate rename is rejected. After publication, Withdraw replaces removal and preserves the entrant's history. New entrants cannot be added after play starts.
- [ ] **SET-07** Copy settings from an existing event. The copy is a new editable draft with the same rules, no entrants, no rounds/results, and no inherited private links. The original remains unchanged.

```text
Morgan Vale
Alex Rowan
Samira Holt
Theo Bennett
Priya Marsh
Elliot Park
Nadia Wells
Jules Avery
Robin Calder
Casey Flynn
Maya Linden
Owen Brooks
Lena Mercer
Arun Ellis
Quinn Hale
Tessa Reed
Noah Finch
Iris Morgan
Dylan Shaw
Cleo Hart
```

These are the companion fixture's names. Manually pasting them does not reproduce its saved seed, pairings, or final standings; use the frozen automated fixture for the exact named witnesses below.

## Round publication and Swiss pairing

- [ ] **PAIR-01** Preview round 1 of the 20-player event. There are exactly ten matches and each active entrant appears exactly once. Inspect names and tables before publication.
- [ ] **PAIR-02** A spectator cannot see unpublished pairings. Publish once, refresh both views, and confirm identical opponents and table assignments. Refreshing does not redraw pairs.
- [ ] **PAIR-03** Leave a match unreported, then pending, then disputed in separate exercises. Each state blocks the next round. Ended clocks alone are not final results.
- [ ] **PAIR-04** Once every current match is official, preview the next round. Players with equal match points meet where possible; necessary moves between score groups remain legal. Do not require all matches to be within one score group when no such complete pairing exists.
- [ ] **PAIR-05** Across six rounds, each of the 20 players appears once per round, has six different opponents, and receives no bye. Ten matches per round produce exactly 60 official matches.
- [ ] **PAIR-06** Correct an official result after generating an unpublished next-round draft. The draft becomes invalid and must be regenerated. A stale browser cannot publish it using the old results.
- [ ] **PAIR-07** Correct a result after later pairings have already been published. Standings update; all published opponents and table assignments stay fixed.
- [ ] **PAIR-08** Two organizer tabs attempt to publish the same draft. Exactly one round is published; the other action refreshes or reports a conflict. No duplicate round or partial set of matches appears. Use the local concurrency suite for exact overlapping requests.

## Shared clock and starting player

- [ ] **CLOCK-01** On a published match, Start Match opens the correct match on a signed-in shared device. Opening the page alone does not start timing. Return to the tournament and reopen: the same clock and controller are preserved. Old timer invitation creation is rejected and the old claim endpoint is absent.
- [ ] **CLOCK-02** Refresh the ready clock several times. The saved starter does not change. Starter selection does not change opponents, standings, or the pairing draft.
- [ ] **START-01** With unequal prior first counts, the player with fewer firsts starts, even if the other player has more seconds. With equal first counts, more prior seconds wins. With both counts tied, one saved server draw selects the starter. Compare Clock and first-player records with prior rounds; use controlled local fixtures to exercise all three branches.
- [ ] **START-02** Check starter history separately from standings. Byes add neither a first nor a second. A match actually started records its played start once. External-clock games need Record external-clock first player; missing earlier played-start history must be resolved before a later balanced selection.
- [ ] **START-03** In local administrative fixtures, unplayed forfeits alternate the forfeiting player's first/second accounting and do not credit the opponent with a played start. A forfeit after play began keeps its actual start. Corrections with a reason update history without double-counting.
- [ ] **CLOCK-03** Start Timer charges only the saved starter. No increment or delay is added. Tap the running panel to pass the turn; verify the other panel starts immediately even on a slow connection.
- [ ] **CLOCK-04** Tap the inactive panel, then exercise quick alternating valid taps. Inactive taps have no effect, each valid tap switches once, and neither player gains time. On desktop, Enter/Space on the active panel also switches once.
- [ ] **CLOCK-05** Pause for ten seconds. Both clocks stay unchanged. Resume runs the same side with its existing time. Flip sides while stopped changes only placement; landscape Face to face changes only orientation.
- [ ] **CLOCK-06** Reach zero. The active clock continues into overtime, displays the increasing deduction, and does not automatically end or decide the winner. End game becomes prominent without moving out of reach.
- [ ] **CLOCK-07** End during play, then separately while paused. Both clocks freeze at that action. Before submitting any report, Resume game returns to the previously active side. After a report is submitted, players cannot resume or reset the game.

## Overtime and score arithmetic

Enter actual game scores before tournament overtime deductions. The app deducts once. The rule is `floor(overtime seconds / interval seconds) × deduction points`; whole completed intervals count.

Use manual reports for exact whole-second inputs. For exact clock millisecond boundaries, use controlled time in the automated tests. A person's stopwatch tap is not millisecond evidence.

| Case | Actual A–B | Overtime A/B | Rule | Deduction A/B | Adjusted A–B | Match points A/B | Difference A/B |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Normal | 401–399 | 0/0 seconds | 2 per 10 seconds | 0/0 | 401–399 | 1/0 | +2/−2 |
| Before interval | 401–399 | 9/0 | Default | 0/0 | 401–399 | 1/0 | +2/−2 |
| First interval | 401–399 | 10/0 | Default | 2/0 | 399–399 | 0.5/0.5 | 0/0 |
| Partial next interval | 401–399 | 11/0 and 19/0 | Default | 2/0 | 399–399 | 0.5/0.5 | 0/0 |
| Winner reversal | 401–399 | 20/0 | Default | 4/0 | 397–399 | 0/1 | −2/+2 |
| Both over | 405–404 | 20/10 | Default | 4/2 | 401–402 | 0/1 | −1/+1 |
| Custom rule | 401–399 | 30/15 | 3 per 15 seconds | 6/3 | 395–396 | 0/1 | −1/+1 |
| Zero deduction | 401–399 | 30/15 | 0 per 10 seconds | 0/0 | 401–399 | 1/0 | +2/−2 |

- [ ] **SCORE-01** Verify every table row against preview, saved result, public standings, and player history. Winner selection is calculated from adjusted scores, never supplied separately for a played match.
- [ ] **SCORE-02** At 9.999, 10.000, 19.999, and 20.000 overtime seconds, clock deductions are exactly 0, 2, 2, and 4. Overtime turns of 3 + 3 + 4 seconds accumulate to a 2-point deduction; rounding is not performed separately on each turn.
- [ ] **SCORE-03** With default 20-minute clocks, use A 20:20 and B 19:50. Report 401–399 and confirm 397–399. Time spent entering scores, awaiting save, and acknowledging adds no overtime.
- [ ] **SCORE-04** Blank manual overtime means zero. Blank scores, decimal scores, negative overtime, decimal overtime, and out-of-range values are rejected without changing an official result. Valid score bounds are −100,000 through 100,000; overtime is 0–86,400 whole seconds.
- [ ] **SCORE-05** In a labeled artificial boundary test, actual scores 1–0 with A overtime 10 seconds yield −1–0. Negative adjusted scores are allowed; they are not clamped to zero. Do not use this as a realistic game fixture.

## Shared score reporting and corrections

- [ ] **REPORT-01** End a shared game. Report scores shows exactly two Game score inputs, the correct names, and read-only clock-derived overtime/deductions. Ordinary players cannot type a different overtime to bypass the clock.
- [ ] **REPORT-02** Submit for Review scores. Neither submission nor the first named agreement makes the result official. Both names must acknowledge the same report; only the second agreement finalizes it.
- [ ] **REPORT-03** After one agreement, refresh. The saved report and that agreement remain; the other player can still agree. Then edit a score and submit the revision: both previous acknowledgements are cleared. A stale agreement cannot confirm the replacement revision.
- [ ] **REPORT-04** Use Report issue and enter a reason. Organizer review appears; no player can finalize the dispute, and standings/next-round readiness exclude it. Resolve result with an organizer reason makes the chosen result official.
- [ ] **REPORT-05** While a report is pending, have the organizer Review / correct used time with a reason. The pending report and its acknowledgements are invalidated. On the shared device, review the new timing and submit a new score report; both acknowledgements are required again.
- [ ] **REPORT-06** After a shared result is final, correct it as organizer to actual 405–401 and overtime 40/10 seconds. Final totals remain 397–399, but the shared screen must now show 405/401 actual scores, deductions 8/2, overtime 40/10, and Organizer finalized. It must not retain the old raw scores or claim Both players confirmed for the organizer's replacement result.
- [ ] **REPORT-07** Open an organizer score form in two tabs. Save a change in one, then submit the stale form in the other. The stale write is rejected or requires Load latest result. Existing final scores are not overwritten silently.
- [ ] **REPORT-08** While a clock is running or its ended record is unsaved, report submission cannot finalize a result. Repeated clicks or a retry after a lost response produce one effective report/result, not extra points.

## Individual player links and manual reporting

- [ ] **PLAYER-01** In Manual Swiss, issue New player link for each participant. Claim each in a separate browser profile. Your match shows that player's actual current match; choosing a public name does not grant reporting authority.
- [ ] **PLAYER-02** One player uses Report result to enter both scores and overtime. The opponent sees Confirm result and Report issue; the submitter waits for the opponent. A submitter cannot independently confirm their own report.
- [ ] **PLAYER-03** Edit a pending report, refresh both profiles, and confirm the latest revision. A stale confirmation fails. Check that standings exclude both pending and disputed manual reports.
- [ ] **PLAYER-04** Dispute a report and resolve it as organizer with a reason. The two players and public page agree on the final result after refresh.
- [ ] **PLAYER-05** Replace a private player link. The old link and its existing session lose write access; the new link works. An unrelated player cannot submit, confirm, or dispute a different match.
- [ ] **PLAYER-06** For a match that already has a shared clock, the individual manual path cannot override clock-derived overtime. A legacy/manual match without a clock continues to support ordinary reporting.

## Hand calculated standings exercise

Create Manual Swiss with four entrants and two rounds. After round 1 publication, label the two actual pairings A–B and C–D in your notes. These letters stand for the published names; do not assume seed or table order. All overtime is zero. Finalize through player confirmation or organizer entry.

| Step | Enter | Expected official standings |
| --- | --- | --- |
| Round 1, match 1 | A 400, B 380 | A 1 point/+20; B 0/−20; C and D still 0/0 |
| Round 1, match 2 | C 400, D 390 | A 1/+20, C 1/+10, D 0/−10, B 0/−20 |
| Round 2 | A–C draw 380–380; B–D draw 370–370 | A 1.5/+20 rank 1; C 1.5/+10 rank 2; D 0.5/−10 rank 3; B 0.5/−20 rank 4 |
| Correction after round 2 | Change only A's round 1 actual score from 400 to 390, with a reason | A and C both 1.5/+10, shared rank 1; B and D both 0.5/−10, shared rank 3 |

- [ ] **TIE-01** The two round 1 winners are paired in round 2 and the two losers meet. Verify every standings row after each official result, not just the leader.
- [ ] **TIE-02** Before a draw receives its required confirmation, totals stay at the previous official state. Once confirmed, each side gains 0.5 match points and zero difference.
- [ ] **TIE-03** At the end, total match points are 4 and total differential is 0. Each entrant has two results. After the correction, both exact ties share ranks: 1, 1, 3, 3. Published opponents remain unchanged.
- [ ] **TIE-04** Restore A's score to 400 with a second correction reason. The original four distinct ranks return. Organizer history retains the correction actions and reasons.

For the complete six-round companion fixture, verify these additional witnesses. Their exact names and numbers require the frozen fixture, not a manually seeded event.

| Principle | Expected final witness |
| --- | --- |
| Difference breaks equal match points | Priya Marsh 4.5/+155 ranks above Samira Holt 4.5/+154 |
| Match points remain primary | Robin Calder 4.5/+16 ranks above Quinn Hale 4/+25 |
| No hidden extra tiebreaker | Quinn Hale and Nadia Wells both 4/+25 share rank 4; next rank is 6, despite different head-to-head, opponent totals, seeds, and raw totals |
| Negative differences sort correctly | Owen Brooks 3.5/−35 ranks above Noah Finch 3.5/−56 |
| Adjusted difference matters | Theo Bennett 3/+25 ranks above Morgan Vale 3/+24, although their raw differences are +25/+26 |
| Difference is not a substitute for wins | Lena Mercer 2.5/+88 ranks below Robin Calder 4.5/+16 |

- [ ] **TIE-05** Confirm all six witnesses in the browser, persisted results, and independent calculations. Stable ordering of equal-ranked rows must not be presented as a third competitive tiebreaker.

## Byes withdrawals and impossible pairings

- [ ] **ODD-01** Publish a five-player round: exactly two played matches and one bye. The bye is final, awards 1 match point and zero differential, has no artificial game score, and requires neither a clock nor a confirmation.
- [ ] **ODD-02** In subsequent rounds, the bye goes to an eligible player in the lowest points group that permits a complete legal pairing. Anyone already given a bye or a full-point unplayed win is ineligible for another allocated bye.
- [ ] **ODD-03** Withdraw a player after a round is published. Their current match stays assigned and needs a played result or administrative resolution. Future rounds exclude them; earlier results and standings remain visible.
- [ ] **ODD-04** Record a forfeit with a winner and reason. It awards 1/0 points and zero differential. Record a separate double forfeit: both players receive zero points and zero differential. Neither is a 0–0 played draw.
- [ ] **ODD-05** For a 20-player rehearsal, withdraw one player after a completed round. The next round contains nine two-player matches and one eligible bye, with all 19 active entrants assigned exactly once.
- [ ] **ODD-06** In Impossible pairing, finish both round 1 matches as 372–372. Withdraw both players from one match. The remaining two have already met. Preview round 2 must fail clearly, publish nothing, preserve the existing round, and never silently permit a rematch. Finish early with a reason remains the administrative exit once all results are final.

## Recovery and one controlling device

Run these on separate disposable matches as needed. Use an independent stopwatch for physical checks; compare stopped totals rather than continuously changing screenshots. Allow approximately two seconds for human observation, not for systematic per-turn loss. Exact timing uses automated controlled clocks.

- [ ] **REC-01** Run a side for about 15 seconds, refresh, and pause after another five. Its total reflects approximately 20 seconds including reload time; the other side is unchanged. It never resets to the starting allowance or silently pauses during reload.
- [ ] **REC-02** Refresh while paused, and separately after End game. Paused/ended time stays fixed. Reload a pending report after one acknowledgement and confirm it remains usable.
- [ ] **REC-03** Once a clock is claimed and running, disconnect the network, switch several times, and End game. The device still switches locally and freezes immediately on end. Waiting to save is visible; result submission/finalization waits for synchronization.
- [ ] **REC-04** Reconnect. Queued events save in order exactly once. Active side, stopped totals, and deductions match the offline record; no interval is charged twice. Reporting becomes available only after acceptance.
- [ ] **REC-05** In a local network simulation, let a save commit but drop its response, then refresh/retry. The accepted events and result are not duplicated. Starting a brand-new unclaimed match offline cannot fabricate an authoritative clock or report.
- [ ] **REC-06** Open the same claimed match in another tab and another device. The additional view cannot create a second accepted timeline. A second tab shows read-only behavior; an unauthorized device must claim valid access or receive a denial.
- [ ] **REC-07** With unsaved events on the old device, revoke its shared device access as organizer. The old device cannot overwrite a transferred controller after reconnecting. Review / correct used time with a reason is required after an organizer takeover before ordinary play/reporting continues.
- [ ] **REC-08** Correct used time while a device has pending local taps. Its old queue must not be silently added onto the corrected totals. A conflict/reload or organizer-review path preserves the correction and makes the state understandable.
- [ ] **REC-09** In local automation, simulate an inconsistent wall-clock jump or suspended time source. The app preserves the record and requires timing review rather than inventing elapsed time. Reporting stays blocked until an organizer records the correction.
- [ ] **REC-10** Restart the local app server after saving a paused/ended game and pending report. Reopen organizer, player, and spectator pages: stored state remains. Do not restart production for this check.

## Physical phone and iPad checks

Run on at least one physical iPhone with Safari and one physical iPad with Safari. Also run on the actual event device/browser if different. Record model, OS, orientation, and browser; Chromium viewport emulation does not complete these boxes.

- [ ] **DEVICE-01** In phone portrait, phone landscape, iPad portrait, iPad landscape, and iPad split view, both names, timers, deductions, Pause/Resume, and End game are legible and reachable. At normal text size, essential clock controls fit without page scrolling or horizontal clipping.
- [ ] **DEVICE-02** Rotate during a running turn. The active player and accumulated time remain correct. Safe areas, browser bars, and the home indicator do not cover a necessary control.
- [ ] **DEVICE-03** In landscape, try Face to face and Flip sides while stopped. Each player can read their panel from the intended side of the table; orientation never swaps time ownership or the saved starter.
- [ ] **DEVICE-04** Tap near panel edges and use ordinary fast taps. Scrolling, selection, or accidental double activation does not interfere with passing the turn. Controls remain distinguishable without relying only on color.
- [ ] **DEVICE-05** Open both score inputs with the software keyboard. The correct field stays visible, names and values are identifiable, and Review scores remains reachable by normal scrolling. Dismissing the keyboard does not lose entered scores.
- [ ] **DEVICE-06** Increase text size/zoom and use long names. Clock and report controls remain reachable and names do not cover numbers or buttons. Scrolling is acceptable for an enlarged report; clipped or unreachable actions are a failure.
- [ ] **DEVICE-07** Start a clock, lock the device for approximately 60 seconds, then unlock and pause. The elapsed gap belongs to the player who was running. Repeat while explicitly paused: neither player gains used time. An unresolved timing-review message is BLOCKED for unattended recovery, not a precise-time pass.
- [ ] **DEVICE-08** Background Safari for approximately 60 seconds, including switching apps or an interruption. Return and pause: the same recovery expectations hold. Repeat on the event's actual browser.
- [ ] **DEVICE-09** Observe screen wake behavior during play, then with low-power mode or wake lock unavailable. If the screen can sleep, Keep this screen awake appears when appropriate. The app must remain usable and recover elapsed time; successful wake lock alone is not timing evidence.
- [ ] **DEVICE-10** Complete one entire default-time shared match workflow on each device: claim, start, switch, pause, end, two scores, two acknowledgements, refresh final result, and verify spectator standings.

Useful browser layout sizes for an additional automated pass: 320×568, 375×667, 390×844, 844×390, 768×1024, 1024×768, 820×1180, 1180×820, and 507×768 split view.

## Public pages access and lifecycle

- [ ] **PUBLIC-01** As a signed-out spectator, navigate tournament, Standings, Rules, each published round, and player history. Names, opponent links, points, adjusted difference, and W–D–L agree. The current match is easy to find for an authenticated player.
- [ ] **PUBLIC-02** Confirm an ordinary result in another browser. A visible active tournament updates on its normal refresh cycle (about 20 seconds plus request time), or immediately after focus/manual refresh. Do not require instantaneous push updates.
- [ ] **ACCESS-01** Anonymous visitors cannot administer, submit a report, or control a private clock. A valid shared Supabase account that is not a Crossplay organizer cannot manage tournaments.
- [ ] **ACCESS-02** A player/shared credential for one match cannot write to another match or administer the tournament. An organizer without access to a different tournament cannot manage it. Exercise forged IDs and request bodies only in the isolated test suite.
- [ ] **ACCESS-03** An invalid, already consumed, replaced, or revoked private link does not create unauthorized write access. Public pages and public response bodies contain no invitation secrets, session hashes, or organizer-only audit details.
- [ ] **ACCESS-04** Sign out of the organizer browser and revisit a management URL. Management requires sign-in; cached UI is not sufficient to make a write. Unknown tournament/player/match routes produce an understandable missing/denied state instead of exposing unrelated records.
- [ ] **LIFE-01** Normal Finish tournament is available only after all scheduled rounds and results are complete. No seventh round is created for a six-round event.
- [ ] **LIFE-02** Before all scheduled rounds are played, Finish early requires a reason and no unresolved current matches. Final standings retain exactly the rounds actually played.
- [ ] **LIFE-03** Reopen a finished event using Reopen results for a correction and a reason. Correct a result, inspect the history, and finish again. Reopening permits corrections; it does not start extra competitive rounds.
- [ ] **LIFE-04** Archive a finished event. It is hidden from the ordinary organizer list unless Show archived is enabled; retained public/history data remains readable. Scores and roster are no longer editable through normal archived-event controls.
- [ ] **PUBLIC-03** Use keyboard navigation through sign-in, roster, score entry, and confirmations. Focus is visible, fields have labels, error messages identify the problem, and failed saves do not falsely show success. Check long names and narrow standings tables.

## Full local rehearsal and automated evidence

Follow [local test setup](local-swiss20-testing.md) first: Node 24, installed dependencies/Chromium, the running local Supabase Auth stack, the dedicated loopback PostgreSQL 17 container, ignored local Auth fixture, canonical migration files, and port 3001 available. The runners create isolated databases and synthetic accounts; they do not reset the shared database.

Run from this repository in order. These commands are instructions for a test run, not results of creating this checklist.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:swiss20
npm run test:e2e:clock
```

- [ ] **AUTO-01** Lint, types, unit tests, and the production build all pass. Save command output and the tested commit/source hashes. Record failures instead of omitting failed commands.
- [ ] **AUTO-02** The Swiss runner completes both full 20-player, six-round manual-report events, supplementary scenarios, independent reference checks, and database contention checks. All normal scores are 300–450. Preserve its complete requirement summary.
- [ ] **AUTO-03** The clock runner completes all 60 matches using ten table contexts with saved starters, clock start/switch/end, two actual scores, and both shared acknowledgements. Recovery, report corrections, layout/overtime, and existing reporting scenarios also pass.
- [ ] **AUTO-04** At every round checkpoint, compare every player's points, adjusted cumulative difference, rank, opponents, and activity against the independent reference. For the all-played 20-player event, round r has 10r total match points and zero summed differential; at the end there are 60 match points and each player's W+D+L is six.
- [ ] **AUTO-05** Check independent pairing legality and score-group/float costs, deterministic regeneration from the same saved input, no repeated opponents, and no duplicate assignments. Visual inspection alone cannot establish optimal matching.
- [ ] **AUTO-06** Verify every saved starter against prior-round first/second counts and the recorded tie draw. Record final first/second totals. Do not require every player to end exactly 3/3 or treat a small draw sample as statistical proof of randomness.
- [ ] **AUTO-07** Confirm ten simultaneous tables do not generate false rate-limit failures, duplicate accepted events, or tournament-version changes merely from clock taps. Exact overlapping publish/report/clock races use the dedicated local PostgreSQL tests, not human double clicks alone.
- [ ] **AUTO-08** Inspect screenshots and machine-readable results. Keep `.local/evidence/swiss20/<run-id>/` and `.local/evidence/clock/<run-id>/` with source/fixture identity. Link sanitized screenshots, final standings, match ledgers, round checks, and failure records; exclude private Auth artifacts.

For Swiss evidence, produce its requirement summary from the actual completed run:

```powershell
node scripts/summarize-swiss20.mjs .local/evidence/swiss20/<run-id>
```

Exact companion witnesses are defined in [the fixture notes](../tests/fixtures/swiss20/README.md). Never regenerate expected fixtures merely to make a failed run pass. After a demonstrated failure and focused fix, rerun affected checks and keep the original attempt; a partial rerun alone is not evidence that the entire suite passed.

The canonical database owner is `C:/Users/jfung/bite-open-card-draw`. If a new migration is part of a release, run only that migration's focused checks there, inspect the intended target and pending migrations, and verify post-deploy parity. Do not turn a smoke test into an unrelated shared-database reset or sibling-app test campaign.

## Production release smoke

Use production for read-only checks by default. A complete hosted write rehearsal needs a designated disposable event and deliberate test participants; do not alter a real event to obtain test coverage.

- [ ] **DEPLOY-01** Record the actual production deployment/commit and confirm the canonical URL serves it. Recheck the homepage, organizer login, public tournament, round, history, and rules routes for server errors.
- [ ] **DEPLOY-02** With authorized read-only operational access, verify the intended Supabase project, base schema capability `20260928010000`, clock capability `20260930020000`, and the restricted runtime role. Never put database credentials in browser code or evidence.
- [ ] **DEPLOY-03** Confirm anonymous admin access is denied and a cross-origin mutation is rejected. If doing a designated hosted write rehearsal, complete one shared-clock game and one separate manual-report game, then verify public standings after refresh.
- [ ] **DEPLOY-04** Finish/archive the designated test events once all matches are resolved. Preserve links to evidence and avoid leaving confusing active test tournaments. Do not delete audit/history records as cleanup.

## Completion and follow up

- [ ] **DONE-01** Every applicable check has PASS, FAIL, BLOCKED, or NOT RUN recorded with evidence. Physical-device results name the devices actually used. Previous release results are labeled historical.
- [ ] **DONE-02** No unresolved failure affects score arithmetic, standings/tiebreaks, legal pairings, required confirmations, persistence, access control, or the intended device's clock/report workflow. Any remaining device or environment gap is stated explicitly before relying on that setup for an event.
- [ ] **DONE-03** Failed behavior has a reproducible report: check ID, tournament/match, actions, expected/actual numbers, environment, timestamp, and sanitized evidence. Fix only demonstrated issues within the authorized scope; rerun the affected verification and stop when acceptance passes.

| Check ID | Status | Actual result and evidence | Blocker or follow up |
| --- | --- | --- | --- |
| | | | |
| | | | |
| | | | |

Passing the quick pass shows that the main event flow is usable. Passing the detailed, automated, and physical-device checks provides evidence for the listed rules and scenarios; it does not establish that every possible browser, network failure, or tournament history has been tested.

## Reference documents

- [App setup and current behavior](../README.md)
- [Accepted tournament rules](implementation-plan.md)
- [Shared clock plan](shared-match-clock-plan.md) and [integration contract](clock-integration-contract.md)
- [Local Swiss runner and evidence instructions](local-swiss20-testing.md)
- [Previous Swiss validation](swiss20-validation-results.md) and [clock release evidence](clock-release.md)
