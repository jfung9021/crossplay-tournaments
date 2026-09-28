# Crossplay implementation and release

Date: 2026-09-28

The user accepted all proposed defaults and authorized implementation with subagents. This replaces the planning-only status in the initial handoff.

## Implemented

- Next.js application, plain responsive organizer/public/player screens and authenticated HTTP interface.
- Deterministic Swiss engine, score/time calculations, standings, shared ties, bulk roster validation, and 256-player bounds.
- Canonical private schema in the Bite repository, atomic publication/reporting, revisions, invitations, restricted runtime permissions and rate limiting.
- Complete organizer tournament workflow, entrant sessions, confirmation/disputes, corrections, withdrawal and lifecycle controls.
- GitHub CI and environment/setup documentation.

## Verification evidence

- 60 tests passed: 54 domain tests (including small-graph brute-force matching oracles and scored-history fixtures) and six server validation/origin/error-boundary tests.
- 256-player eight-round benchmark: 2.374 seconds total, slowest round 465ms on this machine. This is local evidence, not a hosted performance promise.
- Two browser acceptance tests passed against the production build, isolated PostgreSQL 17, and actual local Supabase Auth. Covered complete even/odd events, separate player sessions, confirmations/disputes, stale confirmations, corrections, withdrawals, settings copy/locking and public authorization.
- 375px public mobile screenshot visually checked for overflow and readability.
- Focused database SQL and true concurrent-session tests passed. Exactly one round publication/report wins overlapping conflicting requests.
- Application production build, typecheck, and lint passed. TypeScript 6 and ESLint 9 are pinned because the current Next lint plugins fail with TypeScript 7/ESLint 10; this was a reproducible tooling incompatibility, not an application defect.

The player-reporting browser scenario was rerun after the focused UI effect repair and passed. No further general review cycle was started.

## Release state

- Live website: https://crossplay-tournaments.vercel.app
- Application repository: https://github.com/jfung9021/crossplay-tournaments
- Verified application release: `dc6cca0b11e4fe290a6bd675ba03df87c51142fa`.
- Application CI: https://github.com/jfung9021/crossplay-tournaments/actions/runs/36372498576 — all checks passed.
- Canonical schema PR: https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/159 — merged, focused CI passed, migration `20260928010000` applied to the verified existing project. Local/remote migration parity exact; no unrelated migrations applied.
- Hosted runtime connection verified through transaction pooling with the project's CA certificate and hostname/certificate verification enabled. The initial default trust store rejected this Supabase CA; supplying the CA fixed the demonstrated connection failure.
- Hosted catalog verification: 15 Crossplay tables with RLS, no runtime base-table grants, four approved runtime functions, no browser-role schema access, Crossplay absent from Data API exposure, no usable sibling-table access. Existing PUBLIC-executable trigger functions in the sibling schema were observed; no demonstrated access violation or unrelated grant change.
- Production HTTP smoke passed: home 200, Auth configured, public database-backed tournament list 200, anonymous admin access 403, cross-origin write 403.
- Production credentials are environment-scoped. Vercel Preview has no production credentials and intentionally remains unconfigured; development/browser verification used isolated local data.

Remaining user-input blocker: the first production organizer email is pending. No account was guessed or granted organizer access. Until that is supplied, public browsing works and organizer sign-in correctly denies unprovisioned accounts. No production tournament data or unrelated application data was created by verification.

## Scope and review boundary

Each implementation area received one scoped review. Only evidenced compile/lint/behavior failures were repaired. No unrelated application changes or sibling test runs were made.
