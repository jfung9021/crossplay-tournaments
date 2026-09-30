import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";

// Reads only named, sanitized acceptance artifacts. It never reads private-auth.json,
// browser logs, traces, request headers, cookies, or arbitrary JSON fields into the summary.
const directories = [...new Set(process.argv.slice(2).map(path => resolve(path)))];
if (!directories.length) throw new Error("Usage: node scripts/summarize-swiss20.mjs <runDir> [additionalAffectedRunDirs...]");
const destination = directories[0];
if (!existsSync(destination)) throw new Error("The primary evidence directory must already exist.");
const read = (directory, path) => {
  const file = resolve(directory, path);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch { throw new Error(`Invalid evidence JSON: ${basename(directory)}/${path}`); }
};
const artifact = (run, path) => relative(destination, resolve(run.directory, path)).replaceAll("\\", "/");
const link = path => `[${path}](${path.split("/").map(encodeURIComponent).join("/")})`;
const safeCell = value => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const statusPass = value => typeof value === "string" ? value.startsWith("PASS") : value?.status === "PASS";
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const appRows = rows => rows?.map(({entrantId, rank, matchPoints, difference, wins, draws, losses, played}) => ({entrantId, rank, matchPoints, difference, wins, draws, losses, played}));

const scenarios = [
  {id: "main", label: "20 players complete six realistic Swiss rounds", pattern: /^20 players complete six realistic Swiss rounds/},
  {id: "tiebreak", label: "Six-round companion proves differential tiebreak rules", pattern: /^six-round companion proves all differential tiebreak rules/},
  {id: "attendance", label: "EX-01/02 withdrawal, forfeits and eligible byes", pattern: /^EX-01\/02:/},
  {id: "penalties", label: "EX-03 configurable penalties and arithmetic boundaries", pattern: /^EX-03:/},
  {id: "corrections-lifecycle", label: "EX-04/05 corrections and lifecycle", pattern: /^EX-04\/05:/},
  {id: "authorization", label: "EX-06/07 invitation replacement and authorization", pattern: /^EX-06\/07:/},
  {id: "impossible-pairing", label: "EX-08 no feasible legal pairing", pattern: /^EX-08:/},
];
const attempts = [];
const runs = directories.map((directory, order) => ({directory, order, manifest: read(directory, "manifest.json"), status: read(directory, "run-status.json"), report: read(directory, "results.json"), processes: read(directory, "process-checks.json") ?? []}));
runs.sort((a, b) => (a.manifest?.startedAt ?? "").localeCompare(b.manifest?.startedAt ?? "") || a.order - b.order);
for (const run of runs) {
  function walk(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        const scenario = scenarios.find(entry => entry.pattern.test(spec.title));
        if (!scenario) continue;
        for (const test of spec.tests ?? []) {
          for (const result of test.results ?? []) {
            attempts.push({scenario: scenario.id, label: scenario.label, run, status: result.status, expectedStatus: test.expectedStatus ?? "passed", retry: result.retry ?? 0, durationMs: result.duration ?? 0});
          }
        }
      }
      walk(suite.suites);
    }
  }
  walk(run.report?.suites);
}
const latest = new Map();
for (const attempt of attempts) if (attempt.status !== "skipped") latest.set(attempt.scenario, attempt);
const selected = id => {
  const attempt = latest.get(id);
  return attempt?.status === "passed" && attempt.expectedStatus === "passed" && attempt.retry === 0 ? attempt.run : null;
};
const assertions = [];
function row(id, expected, observed, passed, artifacts = []) {
  assertions.push({id, expected, observed, status: passed ? "PASS" : "MISSING_OR_FAILED", artifacts: [...new Set(artifacts)]});
}
const passedScenarios = scenarios.filter(scenario => selected(scenario.id));
row("BROWSER-7-SCENARIOS", "Seven distinct scenarios pass with zero retries and expected success", `${passedScenarios.length}/7 scenarios passed; ${attempts.filter(attempt => !["passed", "skipped"].includes(attempt.status)).length} original failed attempts retained`, passedScenarios.length === 7,
  runs.filter(run => run.report).map(run => artifact(run, "results.json")));
for (const scenario of scenarios) {
  const attempt = latest.get(scenario.id);
  row(`SCENARIO-${scenario.id}`, scenario.label, attempt ? `${attempt.status}; retry ${attempt.retry}; ${basename(attempt.run.directory)}` : "No executed scenario result", Boolean(selected(scenario.id)), attempt ? [artifact(attempt.run, "results.json")] : []);
}

const selectedRuns = [...new Set([...latest.values()].filter(attempt => selected(attempt.scenario)).map(attempt => attempt.run))];
const manifestIdentity = selectedRuns.map(run => ({commit: run.manifest?.commit, schema: run.manifest?.schemaVersion, migration: run.manifest?.migrationSha256, dependencyLock: run.manifest?.dependencyLockSha256, fixtureHashes: run.manifest?.fixtureHashes}));
const manifestsPresent = selectedRuns.length > 0 && selectedRuns.every(run => run.manifest?.targets?.database?.startsWith("crossplay_acceptance_") && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(run.manifest.targets.browser ?? "") && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(run.manifest.targets.auth ?? "") && run.manifest.retries === 0);
const identitiesAgree = manifestIdentity.every(identity => identity.commit && identity.schema && identity.migration && identity.dependencyLock && identity.fixtureHashes && equal(identity, manifestIdentity[0]));
row("LOCAL-REPRODUCIBLE-TARGETS", "Selected passes use recorded loopback targets, isolated acceptance databases, identical commit/schema/migration/dependencies/fixtures, no retries", `${selectedRuns.length} selected run manifests; identity agreement ${identitiesAgree}`, manifestsPresent && identitiesAgree, selectedRuns.map(run => artifact(run, "manifest.json")));

const events = [
  {scenario: "main", id: "mixed-results-20x6-v1", label: "Main"},
  {scenario: "tiebreak", id: "tiebreak-witnesses-20x6-v1", label: "Companion"},
];
for (const event of events) {
  const run = selected(event.scenario); const prefix = event.id;
  const requirements = run ? read(run.directory, `${prefix}/requirements.json`) : null;
  const final = run ? read(run.directory, `${prefix}/final-state.json`) : null;
  const ledger = run ? read(run.directory, `${prefix}/matches.json`) : null;
  const paths = path => run && existsSync(resolve(run.directory, `${prefix}/${path}`)) ? [artifact(run, `${prefix}/${path}`)] : [];
  const passedRequirement = key => statusPass(requirements?.[key]);
  const matches = final?.finished?.rounds?.flatMap(round => round.matches) ?? [];
  const standings = final?.finished?.standings ?? [];
  const counts = final?.database?.counts;
  const exactCounts = final?.finished?.entrants?.length === 20 && final.finished.rounds.length === 6 && final.finished.rounds.every(round => round.matches.length === 10 && round.status === "completed") && matches.length === 60 && matches.every(match => match.kind === "played" && match.status === "final" && match.player2Id) && counts?.official === 60 && counts?.duplicateAssignments === 0 && counts?.duplicateOpponents === 0;
  row(`${event.label}-20-6-10-60`, "20 players, six completed rounds, ten played matches each, 60 official results, no repeated opponents/assignments", final ? `${final.finished.entrants.length} players; ${final.finished.rounds.length} rounds; ${matches.length} matches; ${counts?.official ?? "unknown"} database official revisions` : "No completed event evidence", Boolean(run && exactCounts && passedRequirement("20-PLAYERS-6-ROUNDS-60-PLAYED-MATCHES")), [...paths("final-state.json"), ...paths("matches.csv")]);
  const raw = ledger?.flatMap(match => [match.raw1, match.raw2]) ?? [];
  const overtime = ledger?.flatMap(match => [match.overtime1, match.overtime2]) ?? [];
  const profile = run ? read(run.directory, `${prefix}/frozen-fixture-profile.json`) : null;
  const profileMatchesSaved = raw.length === 120 && raw.every(value => Number.isInteger(value) && value >= 300 && value <= 450) && overtime.filter(value => value === 0).length > 60 && profile?.scoreCount === raw.length && profile.minimumRaw === Math.min(...raw) && profile.maximumRaw === Math.max(...raw) && profile.zeroOvertime === overtime.filter(value => value === 0).length;
  row(`${event.label}-REALISTIC-RAW-SCORES`, "All 120 actual raw scores in 300–450; varied scores and majority zero overtime; saved ledger matches frozen profile", raw.length ? `${raw.length} scores, ${Math.min(...raw)}–${Math.max(...raw)}, ${new Set(raw).size} distinct; ${overtime.filter(value => value === 0).length}/120 zero overtime` : "No actual saved match ledger", Boolean(run && profileMatchesSaved && profile.uniqueRawScores >= 30 && profile.scoreBands?.middle340To410 > 60 && profile.naturalDraws > 0 && profile.overtimeReversals > 0), [...paths("matches.json"), ...paths("frozen-fixture-profile.json")]);
  row(`${event.label}-SETUP-AND-SESSIONS`, "Explicit six-round override, bulk whitespace/duplicate checks, draft privacy and 20 separate claimed player sessions", requirements ? "Recorded browser setup/session checks" : "No passed scenario requirements", Boolean(run && ["SETUP-20-6", "BULK-NORMALIZATION-DUPLICATE", "DRAFT-PRIVACY", "ANONYMOUS-NAME-NO-AUTHORITY", "20-INDEPENDENT-PLAYER-SESSIONS"].every(passedRequirement)), paths("requirements.json"));
  for (let number = 1; number <= 6; number++) {
    const pairing = run ? read(run.directory, `${prefix}/rounds/round-${number}-pairing.json`) : null;
    const checkpoint = run ? read(run.directory, `${prefix}/rounds/round-${number}-checkpoint.json`) : null;
    const proof = pairing?.proof;
    const roundsEqual = checkpoint && checkpoint.expected?.length === 20 && equal(appRows(checkpoint.expected), appRows(checkpoint.organizer?.standings)) && equal(appRows(checkpoint.expected), appRows(checkpoint.public?.standings)) && checkpoint.database?.counts?.official === number * 10;
    row(`${event.label}-ROUND-${number}`, "Ten legal nonrepeating pairs at independent minimum (point gap, float cost); 20 expected/admin/public rows and all stored official results agree", proof ? `Pairing actual (${proof.actualGap}, ${proof.actualFloat}), optimum (${proof.minimumGap}, ${proof.minimumFloat}); ${checkpoint?.expected?.length ?? 0} standings rows; ${checkpoint?.database?.counts?.official ?? 0} official results` : "No completed checkpoint", Boolean(run && passedRequirement(`ROUND-${number}-PAIRING-SCORING-STANDINGS-PRIVACY`) && proof?.legal && proof.optimal && proof.actualGap === proof.minimumGap && proof.actualFloat === proof.minimumFloat && proof.pairs?.length === 10 && roundsEqual), [...paths(`rounds/round-${number}-pairing.json`), ...paths(`rounds/round-${number}-checkpoint.json`)]);
  }
  const pointTotal = standings.reduce((sum, standing) => sum + standing.matchPoints, 0); const diffTotal = standings.reduce((sum, standing) => sum + standing.difference, 0);
  row(`${event.label}-FINAL-CONSERVATION`, "Each player six results; points=W+D/2; field point sum60 and differential sum0", `${standings.length} players; points ${pointTotal}; differential ${diffTotal}`, Boolean(run && standings.length === 20 && standings.every(standing => standing.played === 6 && standing.wins + standing.draws + standing.losses === 6 && standing.matchPoints === standing.wins + standing.draws / 2) && pointTotal === 60 && diffTotal === 0), paths("standings.csv"));
  row(`${event.label}-REPORTING-WORKFLOW`, "Pending/disputed reports excluded; stale confirmation rejected; unresolved matches block next round", requirements ? "Recorded pending, edit, dispute and negative API checks" : "No passed scenario requirements", Boolean(run && ["PENDING-REPORTS-NEVER-COUNT", "EDIT-STALE-CONFIRMATION", "DISPUTE-EXCLUDES-PENDING-POINTS", "UNRESOLVED-NEXT-ROUND-REJECTED"].every(passedRequirement)), paths("requirements.json"));
  row(`${event.label}-FINISH-PERSIST-COPY-ARCHIVE`, "Finish blocks round7/ordinary edits; owned server restart preserves three audiences; copied settings contain no roster/results; archived history retained", final ? `${final.finished?.tournament?.status}; archive ${final.archived?.tournament?.status}; copied ${final.copied?.entrants?.length ?? "unknown"} players and ${final.copied?.rounds?.length ?? "unknown"} rounds` : "No final lifecycle evidence", Boolean(run && ["FINISH-BLOCKS-ROUND7-AND-EDITS", "SERVER-RESTART-THREE-AUDIENCES", "CLEAN-COPY-ARCHIVE-HISTORY"].every(passedRequirement) && run.processes.some(entry => entry.action === "restart") && final?.finished?.tournament?.status === "finished" && final?.archived?.tournament?.status === "archived" && final?.copied?.entrants?.length === 0 && final?.copied?.rounds?.length === 0 && equal(appRows(final.finished.standings), appRows(final.archived.standings))), [...paths("final-state.json"), ...(run ? [artifact(run, "process-checks.json")] : [])]);
}

const mainRun = selected("main"); const mainId = events[0].id;
const deterministic = mainRun ? read(mainRun.directory, `${mainId}/determinism.json`) : null;
row("PAIRING-DETERMINISM", "Exact restored database and same request identity reproduce pair orientation/table order, engine version and input hash", deterministic ? `Exact restored snapshot: ${deterministic.exactDatabaseSnapshotRestored}; generated outputs equal: ${equal(deterministic.firstGeneration, deterministic.restoredGeneration)}` : "No deterministic replay evidence", Boolean(mainRun && deterministic?.exactDatabaseSnapshotRestored && deterministic.generationRequestId && equal(deterministic.firstGeneration, deterministic.restoredGeneration) && ["checkpoint", "restore"].every(action => mainRun.processes.some(entry => entry.action === action))), mainRun ? [artifact(mainRun, `${mainId}/determinism.json`), artifact(mainRun, "process-checks.json")] : []);

const tieRun = selected("tiebreak"); const tieId = events[1].id;
const tieRequirements = tieRun ? read(tieRun.directory, `${tieId}/requirements.json`) : null;
const witnesses = tieRun ? read(tieRun.directory, `${tieId}/tiebreak-witnesses.json`) ?? [] : [];
const tbExpected = {
  "TB-01": "Equal points: higher adjusted differential ranks first",
  "TB-02": "Match points take priority over differential",
  "TB-03": "Equal points/differential share competition rank despite other differences",
  "TB-04": "Less negative differential ranks higher at equal match points",
  "TB-05": "Adjusted differential order overrides opposite raw-differential order",
  "TB-06": "All six margins accumulate; match points still outrank a large isolated win",
  "TB-07": "An unconfirmed report that would change a tie contributes no points/difference",
  "TB-08": "Outcome-preserving correction reorders tied-point players without changing published pairings",
  "TB-09": "Decisive head-to-head and different opponent strength do not split an exact tie",
};
for (const [id, expected] of Object.entries(tbExpected)) {
  const witness = witnesses.find(entry => entry.id === id); const values = witness?.values;
  let observed = "No completed persisted witness"; let passed = Boolean(tieRun && statusPass(tieRequirements?.[id])); let path = `${tieId}/tiebreak-witnesses.json`;
  if (id === "TB-07") {
    path = `${tieId}/tiebreak-pending-witness.json`; const pending = tieRun ? read(tieRun.directory, path) : null;
    passed &&= Boolean(pending && equal(appRows(pending.before), appRows(pending.actualPending)) && !equal(appRows(pending.before), appRows(pending.wouldIncorrectlyCount)));
    if (pending) observed = `${pending.before.length} actual rows unchanged; counterfactual finalized report changes standings`;
  } else if (id === "TB-08") {
    path = `${tieId}/tiebreak-correction.json`; const correction = tieRun ? read(tieRun.directory, path) : null;
    passed &&= Boolean(correction?.before?.length === 20 && correction.after?.length === 20 && tieRequirements?.[id]?.sameMatchPointsAndWDL && tieRequirements?.[id]?.publishedPairingsUnchanged);
    if (correction) observed = "20 before/after standings rows; same points/WDL; rank reorder and published pairing identity checked";
  } else {
    passed &&= Boolean(values && witness.playerIds?.length === 2);
    if (values) observed = `A/B points ${values.pointsA}/${values.pointsB}; adjusted differences ${values.differenceA}/${values.differenceB}; raw differences ${values.rawDifferenceA}/${values.rawDifferenceB}; ranks ${values.rankA}/${values.rankB}`;
  }
  row(id, expected, observed, passed, tieRun ? [artifact(tieRun, path), artifact(tieRun, `${tieId}/requirements.json`)] : []);
}

const exceptionDefinitions = [
  ["EX-01", "attendance", "Withdrawal leaves19 active players; nine matches + one eligible bye; history retained"],
  ["EX-02", "attendance", "Forfeit/double-forfeit scoring is correct; zero differential; prior unplayed winners cannot receive another bye"],
  ["EX-03", "penalties", "3/15 penalty boundaries14/15/29/30, zero deduction, frozen config and labelled negative-adjusted boundary"],
  ["EX-04", "corrections-lifecycle", "Correction invalidates a draft, rejects old publication and retains later published opponent assignments"],
  ["EX-05", "corrections-lifecycle", "Unresolved results block early finish; early finish requires reason; reopen permits corrections only; archive retains history"],
  ["EX-06", "authorization", "Replacing an invitation invalidates prior link/session and grants only intended entrant authority"],
  ["EX-07", "authorization", "Anonymous/unrelated player/Auth user/other organizer cannot mutate forbidden data; public output hides private data"],
  ["EX-08", "impossible-pairing", "Impossible legal matching rejects generation without a partial round or rematch fallback"],
];
for (const [id, scenario, expected] of exceptionDefinitions) {
  const run = selected(scenario); const path = `exceptions/${scenario}.json`; const evidence = run ? read(run.directory, path) : null;
  row(id, expected, evidence ? `Passed scenario; ${evidence.scenario} artifact records actual saved and rejected states` : "No passed exception artifact", Boolean(run && evidence?.requirements?.includes(id)), run ? [artifact(run, path), artifact(run, "results.json")] : []);
}

const concurrencyRun = [...runs].reverse().find(run => existsSync(resolve(run.directory, "concurrency.log")) && /Focused Crossplay PostgreSQL tests passed, including overlapping publication\/report races and opponent confirmation/.test(readFileSync(resolve(run.directory, "concurrency.log"), "utf8")));
row("TRANSACTION-CONCURRENCY-IDEMPOTENCY", "Established real-PostgreSQL suite passes, including observed blocked backend, overlapping publish/report and request replay/conflicts", concurrencyRun ? "Established suite emitted its all-assertions-passed marker" : "No successful actual-PostgreSQL concurrency output", Boolean(concurrencyRun), concurrencyRun ? [artifact(concurrencyRun, "concurrency.log")] : []);

const checkerRun = [...runs].reverse().find(run => {
  const report = read(run.directory, "checker-tests.json"); const verified = read(run.directory, "verification.json");
  return (report?.success === true && report.numPassedTests >= 20 && report.numFailedTests === 0) || (verified?.referenceChecker?.status === "PASS" && verified.referenceChecker.tests >= 20);
});
const checkerPath = checkerRun && existsSync(resolve(checkerRun.directory, "checker-tests.json")) ? "checker-tests.json" : "verification.json";
row("REFERENCE-CHECKER-SENSITIVITY", "Recorded20+ independent checker tests pass, including wrong ordering/raw differential/split ranks/pending inclusion rejected", checkerRun ? "Recorded passing reference-checker verification" : "No recorded checker execution evidence in supplied runs", Boolean(checkerRun), checkerRun ? [artifact(checkerRun, checkerPath)] : []);

const status = assertions.every(assertion => assertion.status === "PASS") ? "PASS" : "PARTIAL";
const attemptHistory = attempts.map(attempt => ({scenario: attempt.scenario, run: basename(attempt.run.directory), status: attempt.status, expectedStatus: attempt.expectedStatus, retry: attempt.retry, durationMs: attempt.durationMs, artifact: artifact(attempt.run, "results.json")}));
const summary = {schemaVersion: 1, status, generatedAt: new Date().toISOString(), runIds: runs.map(run => basename(run.directory)), selectedScenarios: Object.fromEntries(scenarios.map(scenario => [scenario.id, selected(scenario.id) ? basename(selected(scenario.id).directory) : null])), originalAttempts: attemptHistory, assertions};
writeFileSync(resolve(destination, "assertions.json"), `${JSON.stringify(summary, null, 2)}\n`);
const lines = ["# Local 20-player Swiss acceptance evidence", "", `Status: **${status}**. ${assertions.filter(assertion => assertion.status === "PASS").length}/${assertions.length} acceptance groups have completed evidence.`, "", "The two full events use the actual production build, independent player sessions, raw-score reporting, and an independent score/standings/pairing checker. A frozen fixture alone does not mark a browser requirement passed. Original failed attempts remain listed; the latest executed result for each scenario determines selection, so a later failure cannot be hidden by an earlier pass.", "", "| Requirement | Expected | Observed | Status | Evidence |", "| --- | --- | --- | --- | --- |", ...assertions.map(assertion => `| ${safeCell(assertion.id)} | ${safeCell(assertion.expected)} | ${safeCell(assertion.observed)} | ${assertion.status} | ${assertion.artifacts.map(link).join(", ")} |`), "", "## Attempt history", "", "| Scenario | Run | Result | Retry | Duration (ms) | Evidence |", "| --- | --- | --- | --- | --- | --- |", ...attemptHistory.map(attempt => `| ${safeCell(attempt.scenario)} | ${safeCell(attempt.run)} | ${safeCell(attempt.status)} | ${attempt.retry} | ${attempt.durationMs} | ${link(attempt.artifact)} |`), "", "Only named acceptance artifacts and allowlisted numeric/status fields are copied into this summary. Local raw reports remain private; do not share authentication fixtures, browser logs, traces, or session data. Application rules are the accepted Crossplay Swiss adaptation; this is not FIDE Dutch certification.", ""];
writeFileSync(resolve(destination, "summary.md"), lines.join("\n"));
console.log(`Swiss20 evidence ${status}: ${assertions.filter(assertion => assertion.status === "PASS").length}/${assertions.length} groups; ${resolve(destination, "summary.md")}`);
