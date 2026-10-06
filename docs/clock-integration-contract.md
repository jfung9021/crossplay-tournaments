# Shared clock integration contract

Accepted implementation contract, 2026-09-30, with match entry revised 2026-10-06. Additive private SQL capability `20260930020000`; base `schema_version()` remains `20260928010000`. Shared match credentials authorize both named acknowledgements on one device, recorded as `shared_device` rather than independent identities.

## SQL boundary

Runtime may execute `clock_version()`, `clock_read(actor jsonb, match_id uuid)`, and `clock_execute(actor jsonb, command text, payload jsonb, request_id uuid, expected_clock_version bigint default null)`. Existing private functions retain their interface. Actors are verified organizer `{userId}` or shared `{matchSessionHash}`; individual `{sessionHash}` may read their match but cannot use shared commands. Secrets are hashed before SQL.

Snapshot:

```ts
type ClockState = {
  status: 'ready'|'running'|'paused'|'ended'; activeSide: 1|2;
  usedMs: [number, number]; anchorAtMs: number|null;
  epoch: number; sequence: number; version: number;
  reportSubmitted: boolean; reviewRequired: boolean;
};
type ClockSnapshot = {
  tournamentId: string; matchId: string; tournamentName: string;
  roundNumber: number; tableNumber: number; matchStatus: string; matchRevision: number;
  players: [{id:string,name:string,side:1},{id:string,name:string,side:2}];
  rules: {timeLimitSeconds:number|null,penaltyIntervalSeconds:number,penaltyPoints:number,roundCount:number|null};
  state: ClockState|null; controllerId:string|null;
  start: null|{entrantId:string,side:1|2,method:'fewer_firsts'|'more_seconds'|'random'|'organizer',counts:{firsts1:number,seconds1:number,firsts2:number,seconds2:number},played:boolean};
  report: null|{id:string,revision:number,raw1:number,raw2:number,overtime1:number,overtime2:number,adjusted1:number,adjusted2:number,acknowledgedSides:number[],confirmationMethod:string,clockVersion:number|null,disputeReason:string|null};
  result: object|null; officialConfirmationMethod:'shared_device'|'organizer'|'individual'|null;
  canControl:boolean; isOrganizer:boolean; serverNowMs:number;
};
type ClockEvent = {sequence:number,kind:'start'|'switch'|'pause'|'resume'|'end'|'recover',atMs:number,elapsedMs:number,side?:1|2,reviewRequired?:boolean};
```

`activeSide` remains set while paused/ended so resume is unambiguous. Elapsed milliseconds are charged only to the previously running side. Start/resume elapsed is zero; the event anchor is its captured epoch time. Switch carries the *previous active side* in `side`, so inactive taps are rejected. Event sequence is contiguous within the epoch; version increases per event and administrative correction. Replay with the same request ID returns the original response. A batch with stale version/epoch is rejected atomically. `recover` may flag ambiguous timing, which blocks further ordinary actions until an organizer correction. Controller ownership is both the authenticated session and the supplied persistent browser/tab controller ID.

All commands except `claim_match_link` include `matchId`. Response is a snapshot except link issuance/revocation noted below.

| Command | Additional payload | Authority and result |
| --- | --- | --- |
| `issue_match_link` | `inviteHash` | Internal SQL capability used only inside authenticated match entry; `{matchId,tournamentId}`. No public HTTP command or secret URL. |
| `claim_match_link` | `inviteHash,sessionHash` | Internal SQL exchange inside the same match-entry transaction; returns snapshot. Not exposed as a public HTTP endpoint. |
| `claim_clock` | `controllerId` | Shared session or staff; ready clock with saved starter. Existing same-controller pending/disputed clock can reattach after reload; a manual pending report cannot acquire a new clock. Existing other controller rejected. |
| `append_events` | `controllerId,epoch,events` | Controller; expected clock version required. Maximum 100 events. |
| `submit_shared_report` | `raw1,raw2,expectedRevision,clockVersion` | Shared session; accepted ended clock, exact clock version, no timing-review flag. SQL derives overtime. |
| `acknowledge_shared_report` | `reportId,expectedRevision,side` | Shared session; acknowledgement is per exact report; second acknowledgement finalizes through existing result function. |
| `dispute_shared_report` | `reportId,expectedRevision,reason` | Shared session; organizer resolution required. |
| `revoke_match_link` | `reason` | Staff; revokes credential and controller, returns snapshot. |
| `takeover_clock` | `controllerId,reason` | Staff; increments epoch, pauses and marks timing for review. Correction required before resume. |
| `correct_clock` | `usedMs:[number,number],activeSide,reason` | Staff, expected clock version; increments epoch and resets sequence to reject old queued events, clears review, and preserves ended/ready state, otherwise pauses. Clears current unfinalized report and acknowledgements. Final result corrections use existing organizer result command. |
| `correct_starter` | `entrantId,reason` | Staff; updates saved starter/accounting, ready clock side if applicable. |
| `record_manual_start` | `entrantId,reason` | Staff; saves played start for external-clock games. |

Only result/report changes advance tournament version and invalidate draft pairings; ticking, starter selection, credentials, and controller operations never change pairing inputs. Existing individual reporting against a match with a clock is rejected, preventing manual overtime bypass. Existing organizer finalization remains available with a reason when a clock exists, closes that clock, and preserves timing history. Finalization records unplayed-forfeit alternating first/second accounting once per forfeiting entrant; played forfeits retain existing played starts. Byes have no accounting. Earlier played games without recorded starts cause `START_HISTORY_REQUIRED` before selecting a later starter, requiring organizer input instead of inferring pairing order.

Replacing/revoking any claimed controller marks timing for review even if its last server checkpoint was ready, paused, or ended: the lost device could have unsaved local events. A replacement can reattach to a pending report, but acknowledgements remain blocked until an organizer reviews the clock; correction clears that pending report and its acknowledgements. Final presentation uses `result` and `officialConfirmationMethod` from the current official revision, never the older shared report's acknowledgements after an organizer override.

## HTTP boundary

`GET/POST /api/matches/[matchId]/clock`; POST `{command,payload,requestId,expectedClockVersion?}`. `POST /api/matches/[matchId]/open` accepts only `{requestId,controllerId}` from a verified organizer. The server creates and claims a device session and reserves a ready clock in one transaction, serialized by a per-match advisory lock. Existing valid device cookies reopen the same match; another device sees the existing clock read-only. Repeating a committed entry request can restore a lost response cookie without replacing the controller. The HttpOnly cookie never appears in a URL.

The match card's **Start Match** button opens `/match/[matchId]`; **Start Timer** starts timing, and **End game** freezes time before score entry. The old `/claim` endpoint, timer invitation command, fragment parsing, and timer-link controls are removed. Individual player invitations for optional manual reporting are separate and unchanged. No clock fields enter the tournament `Round` model or its pairing hash. No database migration is required for this entry revision.

All nine table devices may use the same organizer login. They retain full organizer permissions, while each match has one controlling browser. Organizer sign-in permits 16 attempts per minute per network address.
