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

- 54 domain tests passed, including small-graph brute-force matching oracles and scored-history fixtures.
- 256-player eight-round benchmark: 2.374 seconds total, slowest round 465ms on this machine. This is local evidence, not a hosted performance promise.
- Two browser acceptance tests passed against the production build, isolated PostgreSQL 17, and actual local Supabase Auth. Covered complete even/odd events, separate player sessions, confirmations/disputes, stale confirmations, corrections, withdrawals, settings copy/locking and public authorization.
- 375px public mobile screenshot visually checked for overflow and readability.
- Focused database SQL and true concurrent-session tests passed. Exactly one round publication/report wins overlapping conflicting requests.
- Application production build, typecheck, and lint passed. TypeScript 6 and ESLint 9 are pinned because the current Next lint plugins fail with TypeScript 7/ESLint 10; this was a reproducible tooling incompatibility, not an application defect.

Final request-boundary checks, release URLs and hosted checks are recorded below as completed.

## Release state

Canonical schema release and Vercel application provisioning are in progress. Production organizer email is pending the user's answer. No production tests should create or mutate unrelated application data.

## Scope and review boundary

Each implementation area received one scoped review. Only evidenced compile/lint/behavior failures were repaired. No unrelated application changes or sibling test runs were made.
