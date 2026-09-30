# Frozen Swiss acceptance fixtures

These are synthetic, reproducible test inputs, not recorded Crossplay games or measured score distributions. Each event contains 20 fictional players, six rounds and 60 played matches. Every raw score is in the user-specified typical range, 300–450. The middle band (340–410), margins and overtime frequency are explicit test-design assumptions.

Prepare explicitly with `npx tsx scripts/prepare-swiss20-fixtures.ts`. This separate, bounded discovery step may use the production pairing engine, but it does not run during browser acceptance. It derives stable entrant IDs and seeds from the recorded create/roster request UUIDs. It freezes all scores, expected standings, pairing costs, witness values, correction inputs and a canonical JSON SHA-256. Runtime tests must verify that hash before use. Tournament database IDs are intentionally absent: the normal database creates those IDs.

`tests/support/swiss-reference.ts` imports no production calculator, standings helper, pairing graph or solver. It independently computes penalties, integer half-point units, cumulative adjusted differences and competition ranks. Its memoized bitmask matching algorithm verifies the minimum lexicographic `(total point-unit gap, repeated-float cost)` of every round. It does not require its own independent solver to choose the engine's seed tie resolution among equal-cost matchings.

Both fixtures preserve six hand-calculated first-round examples: 401/399 with overtime 9, 10, 11, 19 and 20 seconds on the first player; then 405/404 with overtime 20/10. These respectively produce +2, 0, 0, 0, −2 and −1 adjusted differential. The zero-clamping boundary 1/0 is supplementary calculator evidence only.

The full companion event, `tiebreak-witnesses-v1.json`, includes these concrete final witnesses:

| Rule | Witness |
| --- | --- |
| TB-01 | Priya Marsh and Samira Holt both have 4.5 match points; +155 ranks above +154. |
| TB-02 | Robin Calder has 4.5 points/+16 and ranks above Quinn Hale at 4 points/+25. |
| TB-03 / TB-09 | Quinn Hale and Nadia Wells both have 4 points/+25 and share rank 4 despite different raw totals, seeds, opponent-point totals and a decisive head-to-head match. Next rank is 6. |
| TB-04 | Owen Brooks and Noah Finch both have 3.5 points; −35 ranks above −56. |
| TB-05 | Theo Bennett and Morgan Vale both have 3 points. Adjusted +25 ranks above +24 although raw differences are +25 and +26. |
| TB-06 | Lena Mercer has 2.5 points/+88 after a large win and narrow losses; Robin Calder has 4.5 points/+16 through narrow wins and ranks higher. |

TB-07 is a browser workflow assertion that pending/disputed submissions do not count; TB-08 uses the frozen outcome-preserving correction and subsequent restoration. The fixture file alone is not evidence that the website persisted or displayed these values. That evidence comes only from the corresponding local browser/database run.
