# TV live clocks implementation status

October 11, 2026. Docker Desktop was restarted with user authorization. The new migration's focused SQL checks now pass against an isolated existing-schema clone. The user explicitly requested pushing, merging, and releasing to production while the extended browser timing test continues. Migration deployment precedes the app release; release identifiers will be recorded once confirmed.

Implemented the sixteen-player TV layout, full-height standings, pending adjusted scores, official-final transitions, per-player remaining/overtime digits, controller spectator checkpoints, monotonic rendering, stale-clock freezing, capability fallback, and separate content/timing updates. The additive migration and its focused test live in `C:/Users/jfung/bite-open-card-draw` under `20261011010000_crossplay_tv_live_clocks.sql` and `crossplay_tv_live_clocks_test.sql`. The app acceptance runner includes the new migration for future real workflow runs.

## Verification

- Application TypeScript, ESLint, and production build pass.
- Seventy focused unit/server tests in eight files pass, covering existing clock/journal boundaries and new checkpoint authorization, public pending projection, capability fallback, ten-minute timing simulation, rounding/overtime, freshness, calibration jitter, and reconnect/version/generation behavior.
- Chromium and WebKit fixture browser checks cover eight cards and sixteen full-height rows, pending/edit/final transitions, unchanged card positions, controller/TV outages, recovery, long names, pagination, 1366×768 fallback, and the final-results layout. Evidence is in `.local/evidence/tv-live/`.
- A five-second production-build Chromium CPU profile of eight ticking clocks recorded zero long tasks and zero layout shifts. Evidence: `steady-ticking.json` and `steady-ticking.cpuprofile` in that folder. This is a controlled browser measurement, not a venue-hardware guarantee.
- One manual implementation review identified old-sample reconnect resumption and calibration-induced backward ticks. Deterministic failing tests reproduced both; one focused timing repair now passes. Layout verification also corrected footer wrapping and pagination controls retaining an unnecessary page after a roster/view change. No second general review is planned.
- The real-database workflow exercised start/switch/pause/resume/end, pending scores and edits, phone/TV disconnection and hidden-TV recovery. It exposed a correction taking longer than two seconds after the last match became final. Active tournaments now retain one-second polling between rounds. The affected workflow rerun is pending; the separate ten-minute, eight-controller test continues with deliberately offset wall clocks and variable request latency. Two initial test-harness failures (an acknowledgement wait and hidden measurement-node selection) were corrected without changing product behavior.

## Remaining release gates

Complete the affected workflow rerun and the ten-minute controller-to-TV load/latency check. These continue alongside the user-authorized release. The configured database target is the existing `bite-open-card-draw` project `gsiyqhkcgegjrvqcqioc`; migration parity inspection and a dry run identify only `20261011010000_crossplay_tv_live_clocks.sql` as pending. Complete the owner PR workflow, deploy that migration, then release the consuming app. A short physical-TV readability/stutter check remains.

Incidental observations left unchanged: the existing Vite native-loader warning and Node NO_COLOR/FORCE_COLOR warning. No unrelated application fixes or shared-database resets were performed.
