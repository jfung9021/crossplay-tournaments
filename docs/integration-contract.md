# Implementation contract

Accepted 2026-09-28: proposed defaults in implementation-plan.md are approved. Implement all six phases, with independent code preparation in parallel and integration gates in dependency order. This file coordinates agents; shared types are in src/domain/types.ts.

## Data conventions

JSON uses camelCase exactly as shared types. Official result points1/points2 are integer half-point units (2/1/0). Standing.matchPoints is the displayed number (1/.5/0 accumulated). Scores and overtime range: raw -100000..100000 integers; overtime 0..86400 seconds; interval 1..3600 seconds; deduction 0..100 points; optional time limit 1..86400 seconds. Entrants max 256. Rounds 1..255 (odd 255 max; 256 entrants max255). Names trimmed NFKC, 1..80 code points; duplicate normalized lowercase names rejected. Tournament name 1..120 chars; slug lowercase a-z0-9 hyphens 3..80. Date nullable ISO date. Null roundCount means auto ceil(log2(N)), locked on first publication. Seed persisted UUID/string, assigned random first-round roster order server-side, no browser randomness for pairings.

## Database interface (private crossplay schema)

- `read_model(p_actor jsonb, p_tournament text default null, p_scope text default 'public') returns jsonb`: null tournament returns `{tournaments: Tournament[]}` (public excludes drafts; admin is owned/staff only); tournament id OR slug returns snapshot without standings (server computes from official published rounds). Pending reports only visible to staff or either assigned player; drafts/audit only staff. viewer computed from actor. Unknown/private inaccessible tournament raises not found. A public reader can see published entrant names/history only.
- `execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint default null) returns jsonb`: server actor comes from verified Supabase organizer userId or hashed entrant session. Never trust browser actor. Return `{id,slug}` for create/copy, otherwise `{ok:true}` plus any documented command-specific fields. All tournament payloads include `tournamentId`.
- `schema_version() returns text` for startup contract check, expected `20260928010000` unless agent discovers a collision and informs root.
- Runtime role only has these functions (plus optional consume_rate_limit); base tables and internal helpers private. Credentials provisioning is outside migration SQL source. Organizer allowlist table bootstrap by trusted administrative SQL, not any logged-in user.

Commands and payloads:

| command | payload |
| --- | --- |
| create_tournament | name, slug, date, config, seed |
| copy_tournament | tournamentId, name, slug, seed (copy settings only) |
| update_settings | tournamentId, name, date, config (config locked after first publication) |
| add_entrants | tournamentId, entrants:[{id,name,seed}] (root parses multiline input; SQL validates duplicate/bounds) |
| update_entrant | tournamentId, entrantId, name |
| remove_entrant | tournamentId, entrantId (draft only) |
| withdraw_entrant | tournamentId, entrantId (active, preserves current match) |
| generate_round | tournamentId, roundNumber, pairs:[{player1Id,player2Id}], engineVersion, inputHash (root computes; replace prior draft; DB validates legal constraints) |
| publish_round | tournamentId, roundId (same current version; activate/lock settings on first publish; auto-finalize bye; complete previous rounds when all matches final) |
| submit_report | tournamentId, matchId, expectedRevision, raw1,raw2,overtime1,overtime2 (players, unreported/pending; editing replaces/invalidates confirmation) |
| confirm_report | tournamentId, matchId, expectedRevision, reportId (opponent only) |
| dispute_report | tournamentId, matchId, expectedRevision, reportId, reason (opponent only) |
| finalize_result | tournamentId, matchId, expectedRevision, kind:played/forfeit/double_forfeit, raw1/raw2/overtime1/overtime2 for played, winnerId for forfeit, reason required for correction/dispute/administrative outcome |
| finish_tournament | tournamentId, reason (required if early; all published matches must still be resolved) |
| reopen_tournament | tournamentId, reason (finished only; results corrections, no additional rounds beyond config) |
| archive_tournament | tournamentId (draft, active or finished) |
| restore_tournament | tournamentId (archived; restore prior state) |
| reset_tournament | tournamentId, confirmationName (exact name; editable draft keeping roster/settings) |
| delete_tournament | tournamentId, confirmationName (exact name; permanent deletion) |
| issue_invite | tournamentId, entrantId, inviteHash (root random token; revoke old invitation and sessions) |
| claim_invite | inviteHash, sessionHash (no tournament/version; atomically consume invite, save session expiry; return tournamentId,slug,entrantId) |

Version handling: all mutations lock tournament, compare expected version if supplied, increment once, record idempotency with actor/payload fingerprint and return previous response for replay BEFORE current-version check. All tournament-level writes require expectedVersion; match-level report/confirm/dispute/finalize use required expectedRevision instead to permit unrelated matches in flight, still increment tournament version. Generating/storing a draft increments tournament version; store input version consistently so subsequent publish works and all intervening relevant mutation invalidates/removes draft. Finished correction reopening must not permit previously forbidden roster/config mutations. Actor for claim is empty; actor for invite is organizer.

No ordinary player final-result edits. Organizer corrections preserve published pairings, discard draft, append revision/audit. New rounds blocked if unresolved match. Forfeit/bye full-point winner cannot later receive allocated bye. No rematches among prior published non-void matches (including forfeit). Drafts not included in standings/history comparisons. Published bye results have points1=2,points2=0,difference1=0 and null scores.

## HTTP interface (parent owns)

- GET `/api/tournaments?scope=public|admin` -> `{tournaments}`. Unconfigured app: 503 `{error:"..."}`. Public collection is accessible without login.
- POST `/api/tournaments` -> create, body `{name,slug?,date?,config,requestId}` -> `{id,slug}`.
- GET `/api/tournaments/[idOrSlug]` -> `TournamentSnapshot` with standings populated by server.
- POST `/api/tournaments/[id]/commands` -> `{command,payload,requestId,expectedVersion}`; root injects tournamentId. For add_entrants payload `{names:string}`; root returns line validation errors. generate_round payload empty; root computes engine. issue_invite response `{inviteUrl}`. copy_tournament payload `{name,slug?}`. Other payload as DB table.
- POST `/api/join` -> `{token}` -> `{slug,entrantId}`, sets HttpOnly session; token initially read from URL fragment by UI on explicit claim.
- GET `/api/auth` -> `{authenticated:boolean,email?:string,isOrganizer:boolean,configured:boolean}`.
- POST `/api/auth` -> `{email,password}`; sign in via Supabase password auth (existing accounts; no outbound email workflow), check crossplay organizer permission, set secure session cookies.
- DELETE `/api/auth` -> sign out organizer/player sessions.
- All errors `{error:string,code?:string,issues?:{line:number,message:string}[]}`; conflict HTTP409, not found404, forbidden403, validation400, unconfigured503. Never leak SQL/secrets.

## Lifecycle extension (October 8, 2026)

Canonical migration `20261008010000_crossplay_lifecycle.sql` belongs to `bite-open-card-draw`. `lifecycle_version()` returns `20261008010000`; base and clock versions remain unchanged. New controls require snapshot `lifecycleAvailable:true`; mutation boundaries check capability independently and return 503 when unavailable. Older database snapshots keep ordinary workflows available.

Tournament snapshots add `archivedFromStatus`, `runGeneration` and `lifecycleAvailable`. Legacy archived events are backfilled as finished. Public collections omit archives; archived drafts are staff-only. Previously published archive URLs are readable and immutable. Archive discards unpublished previews, revokes unfinished match access, advances clock epochs and pauses running clocks using only saved milliseconds. Pending report acknowledgements retain their saved clock binding. Restore requires reviewed time/fresh control for interrupted clocks.

All four actions require verified tournament staff, expectedVersion and fingerprinted requestId. Archive/restore/reset return `{ok,id,slug,status,version,runGeneration}`; delete returns `{ok,id,deleted:true}`. Replay of an identical reset/delete returns that minimal receipt without re-executing, even after new play or deletion. Changed payloads fail. Gameplay receipts retired by lifecycle transitions return `STALE_ACTION` (409); archived writes return `TOURNAMENT_ARCHIVED` (409); incorrect names return `CONFIRMATION_REQUIRED` (400).

Reset preserves the current config (including resolved numeric rounds), entrant IDs/names/seeds, tournament identity and staff. It reactivates retained entrants, clears all play/access, increments version and generation, and retains reset audit evidence. Delete clears dependent records and sensitive response caches but preserves rejection markers, unrelated tournaments and shared Auth users. Tournament-first locking serializes these operations with ordinary commands, clocks and invitation claims.

The client sequences reads and rejects older tournament versions. Authoritative removal clears the tournament view; a generation change remounts local forms and match-entry state. Successful delete navigates directly to Your tournaments. Reset navigates to Players. Transient failures preserve local entries.

UI uses crypto.randomUUID for request/device/controller identifiers, never tournament decisions; retain same key for network retry of same action. Fetch helper needs same-origin cookies and JSON headers. Client-derived score preview uses `calculateScore(input,config): OfficialResult`; standings `calculateStandings(entrants,rounds): Standing[]`; pairing `generatePairings(input): PairingOutput`; bulk `parsePlayerNames(text,existingNames?): {names:string[],errors:{line:number,message:string}[]}`; `suggestRoundCount(count): number`; exported from src/domain/index.ts. UI imports only scoring/roster/types client-safe modules, never pairing solver. Root will expose shared domain APIs.

## Table and device extension (October 8, 2026)

Owner migration `20261008030000_crossplay_table_devices.sql` adds `tables_version()`, returning `20261008030000`. Snapshots optionally add `tables:{available,enabled,version,tables:[{number,available}],locations:[{matchId,tableNumber,originalTableNumber,queueOrder,ready}],devices?}`. Device UUID/label/duty/generation records are staff-only. Old snapshots omit the field and keep ordinary flows. Managed tables are opt-in per tournament.

`Match.tableNumber` is the immutable Swiss pairing slot. Render the physical location from `tables.locations` when present. Byes have no location. Allocation cycles through sorted available table numbers, then appends deterministic queue positions. An unfinished earlier pairing holds the table through pause, end, pending/disputed report and time review; only final results release it. New allocations and availability changes never alter published opponents or starter accounting.

`POST /api/tournaments/[id]/tables` accepts `{command,payload,requestId,expectedVersion}`. Supported commands: `configure_tables {numbers}`, `assign_device {deviceId,label,tableNumber}`, `retire_device {deviceId}`, `set_table_available {tableNumber,available}`, `move_match {matchId,targetTable,reason}`, `close_table {tableNumber,targetTable,reason}`, `reorder_queue {matchId}`. Capability and staff checks precede writes. SQL `table_execute` takes the verified actor and injected tournament ID; its expected version is the table operations version. Identical receipts replay; changed fingerprints, stale versions and retired generations reject. All writes acquire the tournament lock first.

Moving a controlled match requires prior release; moving to an occupied destination queues it. Closure requires an available destination for unfinished play. Availability changes discard unpublished previews. Completed historical locations stay fixed; the original physical number and audited moves remain recorded. Reset deletes locations, clears duties and retains physical setup. Delete cascades operational data; archive retains setup but the existing lifecycle revokes clocks. Restore never auto-starts.

Browser device UUID and last-table destination are local conveniences. Server duty is separate from the legacy `crossplay.table.<id>` browsing preference, which is only a setup suggestion. A device/table has one current duty, with lifecycle generation checks. The device identifier never authorizes an actor. Draft inputs contain editable values/context only, and are cleared on submission, explicit discard, sign-out and invalidated tournament runs. Withdrawn entrants continue in standings and historical reads under unchanged scoring rules.
