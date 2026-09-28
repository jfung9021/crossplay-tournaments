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
| archive_tournament | tournamentId (finished only) |
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
- All errors `{error:string,issues?:{line:number,message:string}[]}`; conflict HTTP409, not found404, forbidden403, validation400, unconfigured503. Never leak SQL/secrets.

UI uses crypto.randomUUID for request id only; retain same key for network retry of same action. Fetch helper needs same-origin cookies and JSON headers. Client-derived score preview uses `calculateScore(input,config): OfficialResult`; standings `calculateStandings(entrants,rounds): Standing[]`; pairing `generatePairings(input): PairingOutput`; bulk `parsePlayerNames(text,existingNames?): {names:string[],errors:{line:number,message:string}[]}`; `suggestRoundCount(count): number`; exported from src/domain/index.ts. UI imports only scoring/roster/types client-safe modules, never pairing solver. Root will expose shared domain APIs.
