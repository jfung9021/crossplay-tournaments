# Crossplay Swiss tournament manager — implementation plan

Date: 2026-09-28

Status: Defaults accepted and implementation authorized on 2026-09-28. See release-status.md for implementation and verification evidence.

This plan combines three delegated planning contributions: Swiss rules and pairing, database and deployment architecture, and organizer/player experience. The user subsequently approved the proposed defaults and requested implementation with subagents.

## 1. Scope and observed starting point

Build a separate Vercel website that runs complete Swiss tournaments for Crossplay. Support reusable tournament settings, arbitrary even/odd entrant counts within tested capacity, bulk name entry, match reporting, rounds, and standings. Score differential is always the sole standings tiebreaker after match points.

The player interface should be plain and concise. Show the current opponent, relevant action, results, and standings. Use round lists rather than an elimination tree: losing a match does not eliminate a player.

Observed locally:

- `C:/Users/jfung/crossplay-tournaments` is an empty workspace and is not yet a Git repository.
- `C:/Users/jfung/bite-open-card-draw` exists and already owns the shared Supabase migration history.
- Its Pumbility integration establishes a precedent for a private schema, server-only SQL access, and separate consuming application.
- Its local Supabase API configuration currently exposes `public` and `graphql_public`; Crossplay does not need either list changed.
- The existing app uses Next.js, TypeScript, Supabase, Vitest, and Playwright. Reuse that general tooling, not its tournament-specific behavior or visual design.
- The migration owner's current instructions require focused tests of the new migration only, with target verification, migration parity inspection, and a push dry-run. Historical plans demanding broad sibling tests or full resets do not override that exception.

No hosted project, credentials, production schema, deployment, or migration parity was inspected during this planning task. Local configuration is evidence of repository conventions, not proof of live configuration.

## 2. Decisions and proposed defaults

| Topic | Plan |
| --- | --- |
| Format | Pure Swiss, all scheduled rounds, no elimination stage. |
| Ranking | Match points descending, then cumulative adjusted score differential descending. Fixed; no tiebreak selector. |
| Exact standings ties | Shared rank; stable row ordering does not create another tiebreaker. |
| Match points | Accepted: win 1, draw 0.5, loss 0. Internally use integer half-point units. Fixed for v1. |
| Result authority | Accepted: either player submits both scores; opponent confirms; organizer resolves disputes or enters results. |
| Overtime | Default 2 score points per 10 seconds; both interval and deduction configurable per tournament. |
| Partial intervals | Accepted completed intervals: `floor(seconds / interval)`. Store the rounding policy explicitly. |
| Differential | Use scores after overtime penalties. Sum the differences, not the average. |
| Bye | Full win match points, zero score differential, no fabricated game score. |
| Forfeit | Winner gets win points, loser zero; zero differential. Double forfeit gives both zero points and zero differential. |
| Repeat byes | A previous allocated bye or full-point unplayed win makes that player ineligible for another allocated bye. |
| Round count | Suggest `ceil(log2(N))`; organizer may override before start. Freeze at start. This is a practical suggestion, not a guarantee of one untied winner. |
| Initial seed | Saved random seed by default; optional organizer seed order. No rating system required. |
| Late entries | Disabled after start in v1; withdrawals remain supported. |
| Reuse | Copy settings to a new draft; do not copy results, credentials, or entrants. No template-management subsystem needed. |
| Capacity | Auto-size pairings from the roster. Initial verification target: 2–256 entrants, including non-powers of two. Establish a documented configured maximum from benchmarks; do not claim unlimited scale. |

The user accepted these defaults on 2026-09-28. The existing repository was found locally. No rules decision remains pending.

General Swiss conventions are informed by the [current FIDE basic rules](https://doc.fide.com/docs/DOC/2025_3FC/CM3-202517.pdf) and [handling rules](https://handbook.fide.com/chapter/GeneralHandlingRulesForSwissTournaments202602). This app implements a documented Crossplay adaptation, not certified FIDE Dutch pairings. Chess color requirements are not part of this scope. No official Crossplay tournament rulebook has been established by this research; game-specific choices above are proposed application rules.

## 3. Scoring contract

For each side of a played match, store:

- Actual game score before this tournament's overtime deduction.
- Whole seconds over the allowed time; blank means zero.
- The frozen tournament rules used to calculate the result.

With the proposed rounding policy:

```text
penalty = floor(overtime_seconds / penalty_interval_seconds) * penalty_points
adjusted_score = actual_score - penalty
match_difference = own_adjusted_score - opponent_adjusted_score
tournament_difference = sum(official played-match differences)
```

| Overtime | Default deduction |
| --- | ---: |
| 0–9 seconds | 0 |
| 10–19 seconds | 2 |
| 20–29 seconds | 4 |
| 30–39 seconds | 6 |

Example: A reports 401 and 20 seconds; B reports 399 and zero seconds. Final scores are 397–399. B wins, and the differential contributions are A −2 and B +2.

The report form asks only for the two actual scores and the two overtime values. Winner, draw, penalty, final score, match points, and difference are computed. Do not ask the player to select a winner or deduct points themselves. Show computed penalties when relevant. This application records elapsed overtime supplied by people; a live game clock and direct Crossplay integration are outside the first release.

Validation: whole-number actual scores, nonnegative whole overtime seconds, interval greater than zero, deduction nonnegative. Allow signed actual scores and negative adjusted scores; do not invent a zero floor. Define safe numeric input bounds before implementation and use the same bounds in the UI, server, and database. Time limit per player can be entered in tournament settings for the rules page; it is separate from reported overtime.

Only official results affect standings. Pending and disputed reports contribute nothing. Byes and forfeits are explicit outcomes with absent game scores, not artificial 0–0 draws or inflated winning scores.

Calculate authoritative penalties and outcome in a database function when finalizing a result; the TypeScript preview must pass the same boundary fixtures. Standings aggregate official results rather than maintaining editable total columns.

## 4. Swiss pairing contract

### Rules

1. Start with at least two active entrants. Derive count from roster records, never from a bracket-size setting.
2. Every active entrant appears once in a published round, counting a bye as their one assignment.
3. With odd attendance, assign exactly one eligible bye. Prefer the lowest match-point group that permits a complete legal pairing.
4. Pair players on equal match points where possible; use nearby groups when required. Keep repeated upward/downward floats low.
5. Never silently repeat opponents. Treat prior published, non-void pairings as meetings, including forfeits; byes have no opponent. This is an explicit, slightly stricter application policy than counting only played games.
6. Exclude withdrawn entrants from future rounds. Preserve their history. A withdrawal during a published round leaves that match to be resolved by score or administrative forfeit.
7. Generate the next round only after every current match is final.
8. If constraints make a complete round impossible, publish nothing and tell the organizer the concrete reason. Offer correction of attendance errors or explicit early finish with a recorded reason; do not invent a rematch/extra-bye fallback.
9. Upper structural limits without repeated opponents are `N−1` rounds for even N and `N` for odd N. Validate these before start; also explain that later withdrawals can make the remaining schedule infeasible.
10. Exact ties in match points and differential retain a shared competitive rank. Seed may resolve pairing ambiguity and presentation order only.

### Algorithm and implementation boundary

Use a pure TypeScript engine behind an adapter to a weighted general-graph matching solver. Model players as vertices and legal opponents as edges; add a dummy bye vertex when needed. Exclude forbidden edges instead of merely assigning them a large penalty.

Optimize a documented priority order: complete legal coverage; eligible low-group bye; equal/near match points; fair floats; deterministic seed ordering. Verify that any integer weight encoding preserves the priority of higher rules across the whole matching and stays within the solver's safe numeric range.

A greedy adjacent-player algorithm is insufficient: it can strand the last two players even when a legal complete matching exists. Likewise, choosing the bye before solving the rest of the field can make a feasible round look impossible.

Before committing to a solver, verify its exact version, license, Node compatibility, maximum-cardinality behavior, determinism, and 256-player performance. Pin the selected dependency. Validate small fixtures against a brute-force reference implementation used only in tests. Do not build a new blossom implementation as part of ordinary app development.

Concrete Phase 0 candidate: `edmonds-blossom-fixed@1.0.1`, a dependency-free CommonJS implementation with an MIT license. Its last published version is from 2022, so adoption is conditional on the correctness/build/performance gates above, not a claim of active maintenance. Its API is `blossom(edges, true)` with `[vertexA, vertexB, weight]` edges and a mate-index output. Convert bounded costs into maximum weights and request maximum cardinality. Verify the expected number of vertices, pairing symmetry, edge legality, and full coverage independently: the package infers vertices from edges, so an isolated final vertex can otherwise disappear. See the [publisher metadata](https://registry.npmjs.org/edmonds-blossom-fixed), [published source](https://unpkg.com/edmonds-blossom-fixed@1.0.1/app/blossom.js), and [license](https://unpkg.com/edmonds-blossom-fixed@1.0.1/LICENSE). If it fails deterministic acceptance, report an engine blocker rather than replacing it with greedy pairing.

Save the engine version, seed, pairing input snapshot/hash, roster/results version, and resulting assignments. Identical inputs must reproduce the same pairings. The server computes a proposal outside the publication transaction; the database accepts it only against the same current version.

## 5. Lifecycle, corrections, and concurrent actions

Tournament states: `draft → active → finished → archived`. Archive hides it from the normal organizer list while retaining its history. Finishing early is an explicit organizer action with a reason, not automatic success after a pairing failure.

Round states: `draft → published → completed`. A draft is private to organizers. Publication makes all pairings visible together. Drafts are invalidated when their input results, roster, or rules change. Do not reroll published rounds.

Report states: `unreported → awaiting_confirmation → final`, with `disputed` requiring organizer resolution. A submitting player confirms their own proposed version. The opponent confirms that exact version. Editing replaces the proposal and invalidates earlier confirmation; stale confirmation cannot accept new numbers. There is no automatic timeout acceptance.

All ordinary writes carry an idempotency key and expected revision. The same key plus same payload returns the previous outcome; the same key with changed payload fails. A stale revision produces an actionable conflict without overwriting another report.

Serialize tournament changes with a tournament-row lock, then match locks in a consistent order where needed. Publication rechecks authorization, prior-round completion, entrant membership, duplicate assignments, forbidden opponents, bye eligibility, and snapshot version, then commits the complete round atomically. A failed operation leaves no partial round.

Organizers may correct a finalized score with a required reason. Corrections append history, recompute standings, and invalidate unpublished pairing drafts. Already-published opponents remain unchanged, with the correction recorded as occurring after those pairings. The app must never claim those historical pairings were computed from the corrected scores. Ordinary players cannot edit finalized results. Finished tournaments are read-only until an organizer explicitly reopens results for correction and finalizes again; reopening does not silently add rounds.

Freeze competitive settings at the first round's publication: points system, number of rounds, penalty rate/interval/rounding, and administrative outcome rules. Cosmetic fields may still change. Later events get changed rules by creating/copying a new tournament.

## 6. Organizer and player experience

| Route | Audience and purpose |
| --- | --- |
| `/` | Public tournament list; drafts/private administration excluded. |
| `/admin` | Organizer's tournament list; create or copy settings. |
| `/admin/tournaments/new` | Name, optional date, rules, and round-count selection. |
| `/admin/tournaments/[id]` | Current round, unresolved matches, result entry, and next action. |
| `/admin/tournaments/[id]/players` | Bulk paste, rename, remove before start, withdraw after start, player links. |
| `/admin/tournaments/[id]/settings` | Editable draft settings and read-only locked rules after start. |
| `/t/[slug]` | Current pairings, personalized current match when signed in, and standings. |
| `/t/[slug]/rounds/[number]` | Pairings and results for a chosen round. |
| `/t/[slug]/players/[entrantId]` | Match history for one player. |
| `/t/[slug]/rules` | Short tournament rules, including exact overtime treatment. |
| `/join` | Claim a private entrant invitation and establish a session. |

Bulk entry uses one multiline box and an immediate player count. Trim surrounding whitespace, handle CRLF/LF newlines, ignore blank lines, and preserve original line numbers for errors. Validate duplicates both within the paste and against the roster after Unicode normalization and case folding. Do not merge people silently; ask the organizer to distinguish duplicate display names. Use stable UUIDs as identity. Save a valid batch atomically. Round suggestions update while the tournament is a draft, but never silently overwrite a manual round choice.

Use plain text, neutral colors, conventional buttons, modest spacing, and a readable system font. Mobile player priority is current opponent/table if used, match action/status, then standings. Standings columns: Rank, Player, Match points, Score difference. Show W–D–L in details or when space permits. Equal standings ranks look equal.

Use labels such as `Score`, `Overtime (seconds)`, `Submit result`, `Confirm result`, and `Report issue`. Avoid onboarding prose for ordinary controls. Explain only material rules or state: penalties, byes, pending confirmation, disputes, or stale submissions. Keep technical terms such as schema, RPC, pairing version, and transaction off player screens.

Provide visible form labels, keyboard focus, accessible errors, and status text rather than color alone. Verify at a narrow mobile width. Preserve report input on transient errors. Refresh current state without replacing numbers someone is typing.

Public pages need only small, versioned snapshots. Start with refresh on focus and modest polling while a tournament is active; stop polling hidden tabs and finished events. Refresh immediately after successful writes. Supabase Realtime is not required for v1.

## 7. Identity and authorization

Use Supabase Auth for organizers with Crossplay-specific organizer/tournament membership. A user in the shared project's Auth directory is not automatically a Crossplay administrator. Bootstrap the first organizer deliberately. Verify identity server-side and authorize every protected read/write at the data-access boundary, not only in page navigation. Follow [Supabase's server-side client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [Next.js authorization guidance](https://nextjs.org/docs/app/guides/authentication).

Proposed player self-reporting uses an organizer-generated private invitation per entrant, with no mandatory account or email collection. The organizer copies/distributes each link; the app does not send messages. Claim the invitation into an opaque, entrant-scoped, secure HttpOnly session cookie. A public name selector never grants reporting authority.

Store hashes of high-entropy invitation/session tokens, never plaintext tokens. Prefer a URL fragment for the initial invitation secret, exchange it by POST, and clear it from the address bar. Explicit claim action prevents accidental consumption by link previews. Do not put secrets in logs, public snapshots, analytics, or caches. Allow organizer revoke/regenerate, revoking associated sessions. Resolve expiry/recovery behavior in the player-reporting phase; no account-recovery system is needed.

Authorize players for their own assigned matches and opponent confirmation only. Enforce tournament/entrant scope on the server and within mutation functions. Rate-limit invitation claims and score mutations; protect cookie-authenticated writes against cross-site requests. Public payloads exclude invitation hashes, Auth IDs, private audit reasons, and unpublished reports.

If organizer-only reporting is selected, omit invitations, player sessions, pending reports, and confirmation screens entirely. Public rounds and standings remain the same.

## 8. Application and database architecture

Use Next.js App Router with TypeScript on the Vercel Node runtime, semantic React components, and small shared styling. Use current supported stable dependencies at scaffold time and lock their versions. Use a validation library, Vitest for domain/server tests, and Playwright for the full browser flow. Vercel supports this deployment directly: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).

Suggested application boundaries:

```text
src/app/                 routes, forms, pages, server actions/handlers
src/components/          plain shared controls and result/standings views
src/domain/              scoring, standings, pairing adapter, rule types
src/server/auth/         organizer authorization and entrant sessions
src/server/db/           server-only SQL adapter and DTO projections
src/server/tournaments/  commands, queries, concurrency contracts
tests/fixtures/          fixed Swiss scenarios and scoring examples
tests/e2e/               complete organizer/player tournament flows
docs/                   rules decisions, plan, release evidence
```

Create a private PostgreSQL schema named `crossplay` in the existing shared Supabase project. Keep it absent from Data API exposed schemas and search paths. All browser reads/writes go through this application's server.

The runtime connects using a dedicated `crossplay_runtime` role via Supavisor transaction pooling, TLS, a small pool, and prepared statements disabled. Use a direct/session connection only for administrative migration operations. This follows the existing local integration pattern and [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

Grant only the approved Crossplay query/command function interface to the runtime role. It must not use the shared project's `postgres` credentials or service-role key. Base tables enable RLS and have no browser access or runtime direct DML grants. Functions needing elevated table access use a controlled owner, `SECURITY DEFINER`, empty `search_path`, fully qualified names, explicit execution grants, and authorization checks. Identity supplied by the server must come from a verified session, never from request-body user IDs. Follow [Supabase function security](https://supabase.com/docs/guides/database/functions) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Before asserting isolation, inspect effective privileges inherited through `PUBLIC` and role membership. A schema by itself does not isolate a shared database. A proven inherited sibling permission is an integration blocker to resolve deliberately, not permission to rewrite unrelated grants automatically. Do not replace project-wide Auth settings, signup triggers, existing redirect URLs, or Realtime publications. Add only the new app's required Auth redirect URLs.

### Proposed relational model

All objects below are in `crossplay`; every tournament-scoped reference includes tournament identity in its key/foreign key where needed.

| Object | Responsibility |
| --- | --- |
| `schema_metadata` | Contract/migration version required by the consuming app. |
| `organizers`, `tournament_staff` | Authorized app creators and per-tournament owner/editor assignments using existing Auth identities. |
| `tournaments` | Slug, name, dates, lifecycle, configuration, frozen rule snapshot, seed, state version. |
| `entrants` | Display/normalized name, stable ID/seed, tournament, active/withdrawn state. |
| `rounds` | Number, lifecycle, pairing engine version, input snapshot/hash/version. Unique tournament + number. |
| `matches` | Round, optional table, played/bye/forfeit/double-forfeit outcome, report state, official revision pointer. |
| `match_sides` | Side and entrant assignment. Unique round + entrant; unique match + side. |
| `match_reports` | Versioned unconfirmed score/overtime proposals and dispute/confirmation state, if self-reporting. |
| `result_revisions` | Append-only official inputs, computed result, rules version, actor, reason, timestamp. |
| `entrant_credentials`, `entrant_sessions` | Hashed invite/session credentials and revocation, if self-reporting. |
| `mutation_requests` | Idempotency key, payload hash, scope, prior outcome. |
| `audit_events` | Administrative transitions, withdrawals, rule locking, corrections, and early finish. |

Keep score/time inputs in report/revision records rather than independently mutable copies on every table. `matches.official_revision_id` selects the accepted result. Composite foreign keys ensure the selected revision and participants belong to the same match/tournament. Deferred constraints or publishing functions enforce exactly two sides for a normal match and one for a bye. A transactional read returns coherent standings and round state.

No global player directory, ratings, storage bucket, media uploads, or separate template tables are required initially.

## 9. Repository and deployment boundary

`bite-open-card-draw` remains the only migration owner. It owns Crossplay DDL, functions, roles, grants, database tests, and migration deployment documentation. `crossplay-tournaments` owns UI, domain engine, SQL adapters, generated contract/types, application tests, and Vercel configuration. Do not maintain a competing hosted migration history in the new app: Supabase tracks history at project level. See [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations).

Future schema implementation sequence:

1. Re-read the migration owner's current instructions, inspect its working state, verify the intended project, and check migration parity before selecting a new timestamp.
2. Add an isolated `crossplay` migration and focused schema/constraint/permission/concurrency tests. Use a disposable database or established isolated test harness; do not reset the shared database or replay all historical migrations as a test gate.
3. Inspect the dry-run; it must contain only the reviewed intended migration(s). Coordinate with unrelated pending migrations instead of deploying them accidentally.
4. Apply and verify the additive schema before enabling dependent app features. The app checks the required schema contract and gives an actionable error if missing.
5. Provision runtime-role secrets outside source control. Keep production and preview configuration separate.

Use local or isolated staging/branch data for Development and Preview. Do not give arbitrary preview deployments production database access. Verify the actual target used by the preview. See [Vercel environment variables](https://vercel.com/docs/environment-variables) and [Supabase preview integrations](https://supabase.com/docs/guides/deployment/branching/integrations).

Once enabled with real data, rollback means disabling/reverting the consuming app and making additive fixes while preserving the schema/data. Do not drop the schema to undo an application deployment. Before any real data exists, a separate reviewed removal script can remove only Crossplay objects in dependency order; never use broad cascade cleanup.

## 10. Implementation phases and exit criteria

Implement in this order, with a working vertical slice before adding player self-reporting complexity. Each phase has a finite completion gate.

| Phase | Deliverable | Exit criteria |
| --- | --- | --- |
| 0. Rules and scaffold | Settle reporting/rounding, record defaults, initialize application/repository, pin tooling, choose and benchmark pairing dependency. | Decisions recorded; app boots; clean lint/typecheck/build; solver passes small brute-force fixtures and a representative 256-player benchmark. |
| 1. Domain engine | Score/time calculation, official standings, shared ranks, complete Swiss pairing adapter, byes/forfeits/withdrawals. | Fixed fixtures and seeded tournament simulations prove the specified invariants; no database/UI dependency in engine tests. |
| 2. Shared schema | Canonical migration, restricted DB interface, atomic commands, required-version contract, focused DB tests. | This migration's isolation, constraints, authorization, scoring and concurrency checks pass; target/parity/dry-run evidence recorded before deployment. |
| 3. Organizer tournament | Auth, create/copy settings, bulk roster, start, preview/publish rounds, enter results, corrections, finish/archive. | Complete an even and odd tournament from the browser using persisted data; retries/refresh preserve state; settings copy creates a clean draft. |
| 4. Player reporting | Private invites, entrant sessions, versioned submissions, confirmation/disputes, organizer resolution. Omit if organizer-only is chosen. | Two different players complete a match; unrelated/stale sessions cannot write; disputes block advancement until resolved. |
| 5. Public UI and release | Minimal mobile rounds/standings/history/rules views, refresh behavior, Vercel preview, production deployment configuration. | Full tournament acceptance scenarios pass; relevant mobile/accessibility checks pass; preview target and production schema readiness verified; one scoped final review. |

Implementation acceptance is distinct from deployed verification. Do not mark deployment complete until the required infrastructure is configured and the hosted smoke succeeds. This planning task does not create or deploy infrastructure.

## 11. Acceptance and verification matrix

| Area | Required evidence |
| --- | --- |
| Bulk roster | Whitespace, blank lines, CRLF/LF, Unicode names, duplicates within/across batches, exact line errors, atomic save, derived count. |
| Scaling | Fields of 2, 3, 5, 8, 16, 33, 128, and 256; no power-of-two padding; benchmark the maximum advertised field. |
| Pairing legality | Each eligible entrant once, correct odd bye, no opponent repeats, no second full-point unplayed bye, no withdrawn entrants. |
| Pairing quality | Known fixture where greedy pairing fails but complete matching works; known fixture where the first eligible bye strands the remainder; deterministic repeated input; score-group preference. |
| Impossible round | Clear failure with no partial writes and no silent constraint relaxation. |
| Overtime | 0/9/10/11/19/20-second boundaries, custom interval/rate, zero rate, both players over time, negative adjusted score, win changing to draw/loss. Preview and authoritative calculation agree. |
| Standings | Match points before difference; cumulative adjusted difference; equal/opposite played contributions; zero administrative contributions; equal rank when both values tie. |
| Report workflow | Pending reports excluded; exact-version confirmation; edit clears confirmation; dispute resolution; organizer finalization; no timeout acceptance. |
| History | Correction updates standings and invalidates drafts while preserving published opponents; audit retains before/after; withdrawal preserves prior results. |
| Authorization | Anonymous/name-only viewer cannot report; player cannot report other matches; unrelated shared Auth user cannot administer; staff cannot cross tournament boundaries. |
| DB integrity | Cross-tournament entrant/revision references rejected; unique entrant per round; runtime restricted interface; browser roles denied; no credentials/private fields in public DTOs. |
| Concurrency | Double publish yields one full round; conflicting reports yield one accepted revision and one conflict; request retries have one effect; publication rejects stale pairing input. |
| Lifecycle | Frozen rules remain frozen; every pending match blocks next-round publication; normal completion at chosen round; explicit early finish reason; settings-copy contains no entrants/results/tokens. |
| Browser flow | Organizer completes a full even tournament and a full odd tournament; a targeted scenario covers a withdrawal, bye, overtime result, dispute and correction. Separate player sessions are used for confirmation. |
| Usability | Narrow mobile viewport, keyboard form completion, readable long names, visible errors, current match easy to locate; no elimination-tree UI or decorative dashboard clutter. |
| Deployment | Preview uses nonproduction data; missing migration produces actionable error; production smoke can read/write only the intended test tournament through the intended role. |

Run app lint, typecheck, build, and relevant domain/integration/browser tests for the application phases. Run only the new migration's focused database checks in the migration-owning repository; do not turn that into a sibling-application regression exercise.

At phase completion, perform at most one general review. Make one focused repair for a proven regression and rerun only affected verification. Stop when acceptance passes. Record completed work, checks, proven blockers, and incidental observations without fixing unrelated issues. Do not launch more reviewers to search for additional improvements.

## 12. Deliberately deferred work

No elimination playoffs, alternate tournament formats, ratings, player self-registration, live clock, Crossplay game API integration, chat/email notifications, payments, media, analytics dashboard, offline writes, or general-purpose tournament template builder in v1. These can be scoped later if requested.

## Planning handoff

Completed: repository reconnaissance, three specialist planning contributions, current primary-source checks, and this combined implementation plan.

Verified during planning: local repository ownership/conventions and the relevant official Swiss, Supabase, Next.js, and Vercel guidance. No application or database tests were run because no implementation exists yet.

Update: the user accepted all Section 2 defaults and authorized implementation. The original planning-only handoff above is retained as historical evidence; current implementation status is recorded in release-status.md.

Integration gates for implementation: pairing-library selection, actual hosted project/parity verification, effective runtime privileges, first organizer provisioning, and isolated preview credentials. These are future checks, not observed production failures.

Incidental observation: the shared database already serves several sibling applications. Their behavior and unrelated repository changes are outside this app's implementation scope.
