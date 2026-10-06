# UI observations after match entry adjustment

Inspected October 6, 2026, after the Start Match flow passed acceptance. These are suggestions only; none of the changes below was implemented.

The intended experience is one shared phone or iPad per table, all nine devices signed into the same organizer account, with a compact clock and score sheet for a game played outside the app. Separate table accounts or restricted table mode are not required for that setup. The devices currently retain full tournament management access, as discussed.

| Priority | Observed behavior | Suggested change |
| --- | --- | --- |
| High | A paused match still says **Start Match** and **No result** on its card. The entry correctly reopens the saved clock, but its label does not communicate that. | Use **Continue match** or **Review scores**, and a short clock status when relevant. |
| High | Management cards offer **Start Match**, **Enter result**, and **Clock and first-player records** together. A table user has two apparent ways to finish/report the same game. | Keep the clock workflow primary and move manual result entry and corrections into an organizer actions menu. The existing public tournament view is already less cluttered for table devices. |
| High | Rules say either player reports scores and overtime and the opponent confirms. They also show **1200 seconds per player**. This describes the optional individual reporting flow rather than the shared-clock flow. | Describe the configured clock/reporting flow and show **20 minutes per player**. |
| Medium | Every shared device sees the full round list. On a phone, lower tables require substantial scrolling each time the user returns to the tournament. | Offer a compact table selector or remember the table chosen on that device, within the normal tournament page. No private link is needed. |
| Medium | After a tournament finishes, ten final-round match cards appear before the standings. The winner and final ranking sit far down the mobile page, although a Standings shortcut exists. | Lead with final standings after completion; put final-round matches below them. |
| Medium | The roster prominently offers **New player link** for every entrant. These are optional individual score-reporting invitations, separate from the removed timer links, and unnecessary for the nine-admin-device setup. | Put individual player invitations under an optional reporting/access section. |
| Low | Score review prints **−0 points** and **0s overtime** for a player who incurred no penalty. | Show overtime detail only when it is relevant; retain actual score, deduction and final score for affected players. |
| Low | Clearing **Minutes per player** silently selects an external clock mode, explained in helper text. | Offer an explicit **App timer / External timer** choice so an empty duration is not also a mode switch. |

Evidence: `.local/evidence/clock/1a10f820b73_d7661d7b/design-review/` contains screenshots of public matches, management matches, roster, new tournament, final results and rules, plus their observed text. The same run's `match-entry/phone-ready.png` and `overtime-score-review.png` show the clock and score review screens.

No tournament reset or slow two-round walkthrough was performed.
