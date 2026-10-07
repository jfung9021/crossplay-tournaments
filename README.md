# Crossplay tournaments

A plain Swiss tournament manager for Crossplay, built with Next.js and a private PostgreSQL schema in the existing Supabase project.

## Rules

- Win 1, draw 0.5, loss 0. Rank by match points, then total adjusted score difference. Exact ties share a rank.
- Default overtime deduction: 2 points per completed **0:10**. Durations display and accept **m:ss** throughout the app. Interval and points are configurable before the first round.
- Pair similar match records, avoid rematches, and give one eligible player a bye when the field is odd. Byes/forfeits contribute no score difference.
- Players submit both scores and overtime values; the opponent confirms the report. Organizers resolve disputes and can correct results with a reason.
- Sign in on each shared phone/iPad, select its table, choose **Start Match**, then **Start Timer** when both players are ready. New tournaments default to **20:00** per player. Tap the running panel to pass the turn, pause if needed, and end the game before reporting actual scores. Overtime deductions are recorded automatically. Cards show **Continue match**, **Report scores** or **Review scores** as appropriate. No special timer links are issued or accepted.
- Each device remembers its table independently. Manual overrides are in **Organizer actions**; optional player invitations are in **Individual player access**. Select **External timer** explicitly for manual timing/reporting. Completed tournaments show final standings first.
- The app balances first turns by fewer prior starts, then more prior seconds, then a saved random draw. Shared-device results require both named acknowledgements; history distinguishes these from independently authenticated opponent confirmations.
- Published pairings remain fixed. Withdrawals affect future rounds. Competitive settings lock when the first round is published.

The validated capacity is 2–256 entrants. Automatic round suggestion is `ceil(log2(players))`; the organizer can override it before play. More rounds and withdrawals can make legal pairings impossible; the app reports this instead of silently repeating opponents.

## Development

Use Node.js 24 and npm. Copy `.env.example` to `.env.local` and configure Supabase Auth plus the restricted database connection.

```sh
npm ci
npm run dev
```

The app does not silently fall back to an in-memory database. An unconfigured deployment shows a setup error and accepts no tournament writes.

Portrait layouts and tournament actions are documented in [the October 8 release](docs/portrait-lifecycle-release.md). Archive/restore/reset/delete additionally require canonical migration `20261008010000_crossplay_lifecycle.sql` from `bite-open-card-draw`; the app gates those actions independently from ordinary tournament use.

## Database and organizer setup

Production DDL is owned only by `Jonathan-Fung-Gaming/bite-open-card-draw`. Apply canonical migration `20260928010000_crossplay_schema.sql` there before enabling this app. Do not initialize a second Supabase migration history here.

Shared clocks additionally require `20260930020000_crossplay_shared_clock.sql`. Its separate capability check preserves the original base schema version so the prior app remains compatible during deployment. Apply the additive migration before releasing the clock UI. Rolling back the app retains all clock/history records and leaves the ordinary reporting path available for matches without a clock; resolve existing clock matches through organizer results with an audit reason.

Use a `crossplay_runtime` login and transaction-pooler connection (port 6543) with access only to the private Crossplay function interface. The app rejects other database roles. Keep production credentials out of development and arbitrary previews. Never use the shared project's `postgres` or service-role credentials in Vercel.

Organizer identity uses an existing Supabase email/password account. A database administrator explicitly adds its UUID to `crossplay.organizers`; signing up for another application on the project does not grant Crossplay access. Organizer login is `/login`, capped at 16 attempts per minute per network address. Multiple devices may use one organizer account with independent match clocks; each device retains full organizer access. Optional individual player reporting uses revocable private player invitations and requires no signup.

All variables and their purposes are in `.env.example`. `NEXT_PUBLIC_SITE_URL` must exactly match the browser origin for write requests. Set a random `CROSSPLAY_RATE_LIMIT_SECRET` of at least 32 characters separately for each environment. TLS is required for hosted database connections; only loopback test databases may disable it. Set `CROSSPLAY_DATABASE_CA` to the project CA certificate from Supabase Database Settings when its pooler uses the Supabase CA; certificate and hostname verification stay enabled.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run benchmark
```

Browser acceptance requires an already running app at `http://127.0.0.1:3000`, an isolated PostgreSQL database with the canonical migration, and a real local Supabase Auth organizer. Store its local-only `{id,email,password}` fixture in ignored `.local/auth-fixture.json`, mirror that UUID into the test database's `auth.users` and `crossplay.organizers`, then run `npm run test:e2e`. The tests create unique disposable tournaments; never point them at production. Traces/video are disabled to avoid recording passwords or invitation secrets.

The database owner's focused SQL and concurrency tests are the source of database verification. They do not run sibling-application suites or reset the shared database.

`npm run test:e2e:clock` provisions a disposable loopback database and local Auth identities, builds the app, and runs shared clock, recovery, security, phone/iPad viewport, existing reporting, and 20-player/six-round checks. It uses the prerequisites in [local Swiss testing](docs/local-swiss20-testing.md). Evidence goes to ignored `.local/evidence/clock/<run-id>`; physical iPhone/iPad Safari checks are separate from browser emulation.

See [implementation plan](docs/implementation-plan.md), [integration contract](docs/integration-contract.md), and [release record](docs/release-status.md).
