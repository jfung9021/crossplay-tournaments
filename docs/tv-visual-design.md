# Tournament visual specification

October 8, 2026. Concrete design choices for the approved [TV display and visual refresh plan](tv-display-and-visual-refresh-plan.md). These are the tournament project's design values, not official New York Times brand specifications.

## Reference and identity

The publisher's [Google Play listing](https://play.google.com/store/apps/details?hl=en&id=com.nytimes.wordgame) identifies The New York Times Company and provides the [Crossplay icon](https://play-lh.googleusercontent.com/Ptvds48pZel6go9wNexOH_cSAO52n31hRZ7DSUMqYVIu-1h9SFIR1efksE19x_kOuhE8DNBeVEa9Y8VfoTdN7oY=w240-h480). The public image was opened in Chromium and visually inspected on October 8. Its blue letter tile, sage and lilac board squares, warm gray square and dark type informed this direction. No publisher artwork or masthead is shipped.

The local reference screenshot is `.local/design-reference/publisher-icon-page.png` (1000 × 800). Pixels sampled from flat areas were blue `#3F7FDE` at (415,330), sage `#B1C78C` at (570,320), lilac `#D0A8D9` at (420,490) and warm gray `#E5E2E0` at (590,490). These values reflect this rendered reference, not a verified publisher palette. The sample blue gives only 3.96:1 with white, so the project darkens action blue to `#245EB5` for ordinary button labels.

The original wordmark uses a single rounded C tile, a restrained offset sage edge, and a two-line Crossplay / Tournaments label. It does not reproduce the icon composition, NYT letterform, tile score or masthead. Wordmark decoration is hidden from assistive technology; its link is named “Crossplay tournaments.”

## Typography decision and font provenance

Use **Inter 4.1 throughout**: 800 for page headings and the wordmark, 700–750 for section headings and scores, 600–650 for controls, and 400 for body copy. Body copy is 16 px, input text is at least 16 px, and numeric scores/standings use tabular figures. The TV applies its larger layout-specific type sizes to the same font.

A side-by-side mockup compared Inter 800 with Roboto Slab Bold for the same event title, table card, names and round heading. Inter was selected because its compact heading shapes remain consistent with the denser table and standings UI. Roboto Slab adds a more literary tone but introduces a second shape system and font payload. Neither family is claimed to be Crossplay's actual typeface. The inspected comparison is `.local/design-reference/type-comparison.png`; its self-contained source is beside it as `type-comparison.html`.

| Asset | Source and pin | License and use |
| --- | --- | --- |
| InterVariable-4.1.woff2 | `web/InterVariable.woff2` from the official [Inter 4.1 release](https://github.com/rsms/inter/releases/tag/v4.1), [release archive](https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip) | Original, unmodified 352,240-byte WOFF2 shipped in `public/fonts`. SIL Open Font License 1.1 copied verbatim from the same archive as `Inter-LICENSE.txt`. |
| RobotoSlab-Bold.woff2 | [googlefonts/robotoslab](https://github.com/googlefonts/robotoslab) commit `67af3ce9c4ca574419e1295b6165a2eeee112e6e`, path `fonts/webfonts/RobotoSlab-Bold.woff2` | Apache 2.0 license from the same commit. Comparison only, kept with its license in ignored `.local/design-reference`; not shipped to users. |

`public/fonts/manifest.json` records source URLs, date, byte lengths and SHA-256 hashes. Inter WOFF2 SHA-256: `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`. The original license hash is `262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a`. The comparison Roboto Slab WOFF2 hash is `66d9a209cc91bc68a4427e5b008cd460465fc83b48e14989d81cff2df6c8fa75`.

The root layout uses `next/font/local` with the shipped Inter file, preload support, `font-display: swap` and a fallback. Build and user requests require no external font service.

## Shared roles and measured contrast

`src/app/tokens.css` owns the palette. The TV and ordinary website consume the same roles. Sage/lilac are decorative accents; they never communicate a result by themselves. Visible status words remain present alongside small status marks.

| Role | Token/value | Measured contrast |
| --- | --- | --- |
| Main text | `--ink: #182433` | 14.50:1 on paper |
| Secondary text | `--muted: #556274` | 5.74:1 on paper; 6.20:1 on white |
| Paper / cards / neutral inset | `--paper: #F7F6F2`, `--surface: #FFFFFF`, `--wash: #F0F3F7` | Background roles |
| Decorative border | `--line: #D4DCE6` | Separators only |
| Input/control boundary | `--control-border: #8290A3` | 3.25:1 on white |
| Primary / active navigation | `--brand: #245EB5`, `--brand-soft: #EAF1FD` | White on primary 6.28:1; primary text on soft 5.53:1 |
| Reference accents | `--brand-tile: #3F7FDE`, `--sage: #B1C78C`, `--lilac: #D0A8D9` | Decorative use; not small white-text backgrounds |
| Focus | `--focus: #245EB5` | 5.81:1 on paper, 3 px outline with 4 px offset |
| Success / official result | `--success: #276044`, `--success-soft: #EAF4EC` | 6.56:1 |
| Waiting | `--waiting: #765514`, `--waiting-soft: #FFF4D9` | 6.23:1 |
| Danger / organizer review | `--danger: #A12E36`, `--danger-soft: #FFF0F1` | 6.42:1 |

Ratios were calculated from sRGB relative luminance with the WCAG contrast formula. Text pair measurements exceed 4.5:1; input outlines exceed 3:1. Decorative dividers need not stand in for input boundaries. Disabled controls retain native disabled semantics.

## Application treatment

- Warm paper holds white bordered cards with restrained 14 px rounding and a light shadow. The 1120 px website container remains, with single-column layouts on phones and portrait tablets.
- Page headings increase in weight and size without a promotional hero above operational controls. Phone pages retain compact top spacing. Navigation has a soft blue selected state and a strong bottom marker.
- Match cards receive a stable blue table tile, aligned player/score columns, distinct textual status badges and clear action grouping. Saved-result receipts use a green inset with the recorded result still visible.
- The assigned-table summary has a strong blue edge and larger table heading. Device assignment, departure and organizer form behavior are unchanged by styling.
- Buttons and navigation controls are at least 44 px high; primary actions are at least 48 px. Inputs remain 16 px or larger on phones. Visible labels, keyboard focus and native control behavior remain.
- Standings retain earned ranks and player-history links. Per the user's final visual preference, inactive names use neutral gray (`#686868`) and italics across standings, roster, history and match cards, without a visible withdrawal badge or label. No style places an inactive entrant below their earned position.
- The match-clock module retains its existing face-to-face geometry and player-side colors. It inherits Inter and shared surface/text/control roles. No timer, reporting or pairing logic is changed by this visual work.
- Motion is limited to short color changes on ordinary controls when the operating system allows motion. Clock side buttons receive no hover animation or transform.
- The dedicated TV component isolates its layout using `[data-tournament-display]` and CSS `:has()` to hide ordinary chrome and reset the container before first paint. It shares color/type roles, while owning its 1080p geometry and overflow pagination.

## Direct verification and release evidence

Completed for the visual subtask: publisher reference inspection, font comparison screenshot inspection, same-release license preservation, WOFF2 asset/hash verification, measured role contrast, and implementation of shared tokens/styles/layout. No production data was accessed or changed. The comparison is a design artifact, not a substitute for browser acceptance evidence.

The integrated release checks must capture the actual nine-table/eighteen-player TV states and phone/iPad table/report screens, confirm loaded Inter, and verify timer digits and responsive geometry. Those checks are coordinated by the parent implementation and recorded with the TV release evidence. Physical across-room readability remains a venue check.
