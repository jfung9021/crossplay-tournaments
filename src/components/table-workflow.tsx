"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Match, TournamentSnapshot } from "@/domain/types";
import { matchLocation, physicalTable, tableQueue } from "@/domain/tables";
import { rememberTableHome, rememberTableMatch, rememberedTableMatch, useTableDevice } from "@/client/table-device";
import { matchClockApi, matchControllerId, type MatchClockSnapshot } from "@/client/match-clock-api";
import { useMatchEntry } from "@/client/use-match-entries";
import { OrganizerMatchClock } from "./organizer-match-clock";
import { parseTablePreference, tablePreferenceKey } from "./table-selector";

type Props = { snapshot: TournamentSnapshot; refresh: () => Promise<unknown> };
const requests = new Map<string, string>();
async function tableCommand(snapshot: TournamentSnapshot, command: string, payload: Record<string, unknown>) {
  const input = { command, payload, expectedVersion: snapshot.tables?.version ?? 0 };
  const key = `${snapshot.tournament.id}:${JSON.stringify(input)}`;
  const requestId = requests.get(key) ?? crypto.randomUUID(); requests.set(key, requestId);
  const response = await fetch(`/api/tournaments/${snapshot.tournament.id}/tables`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, requestId }) });
  const data = await response.json();
  if (response.status < 500) requests.delete(key);
  if (!response.ok) throw new Error(data.error ?? "Could not save table changes.");
  requests.delete(key);
}
function useTableActions({ snapshot, refresh }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<{ text: string; version: number } | null>(null);
  async function run(command: string, payload: Record<string, unknown>, message: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await tableCommand(snapshot, command, payload); setNotice({ text: message, version: (snapshot.tables?.version ?? 0) + 1 }); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save table changes."); return false; }
    finally { await refresh(); setBusy(false); }
  }
  return { busy, run, feedback: <>{error && <p role="alert" className="notice error">{error}</p>}{notice && (snapshot.tables?.version ?? 0) <= notice.version && <p role="status" className="notice success">{notice.text}</p>}</> };
}

export function DeviceAssignment(props: Props) {
  const { snapshot } = props, { tournament, tables } = snapshot;
  const device = useTableDevice(), action = useTableActions(props);
  const duty = tables?.devices?.find(item => item.deviceId === device.id && item.generation === (tournament.runGeneration ?? 0));
  const [selection, setSelection] = useState<{ duty: number | null | undefined; value: string }>({ duty: undefined, value: "" }), [label, setLabel] = useState("Table device");
  useEffect(() => { if (duty?.label) void Promise.resolve().then(() => setLabel(duty.label)); }, [duty?.label]);
  const [suggestion, setSuggestion] = useState<number | null>(null);
  useEffect(() => { void Promise.resolve().then(() => {
    try { const previous = parseTablePreference(localStorage.getItem(tablePreferenceKey(tournament.id))); if (previous !== "all") setSuggestion(previous); } catch { /* Optional suggestion. */ }
  }); }, [tournament.id]);
  useEffect(() => { if (duty?.tableNumber) rememberTableHome(tournament.id); }, [duty?.tableNumber, tournament.id]);
  const options = tables?.tables.filter(table => table.available) ?? [];
  const selected = (selection.duty === duty?.tableNumber ? selection.value : "") || String(duty?.tableNumber ?? options.find(table => table.number === suggestion)?.number ?? options[0]?.number ?? "");
  return <div className="compact-stack">
    <p className="muted">{duty?.tableNumber ? `This device serves Table ${duty.tableNumber}. Browsing other tables keeps this assignment.` : "Choose the table this device will serve. It will stay assigned across matches and rounds."}</p>
    {suggestion && !duty?.tableNumber && <p className="form-note">Previously viewed Table {suggestion}. Confirm a table below to assign this device.</p>}
    {device.error && <p role="alert" className="notice error">{device.error}</p>}{action.feedback}
    <form className="compact-stack" onSubmit={event => { event.preventDefault(); void action.run("assign_device", { deviceId: device.id, label, tableNumber: Number(selected) }, `This device is assigned to Table ${selected}.`).then(ok => { if (ok) rememberTableHome(tournament.id); }); }}>
      <div className="form-grid"><label>Device name<input disabled={action.busy} maxLength={80} required value={label} onChange={event => setLabel(event.target.value)} placeholder="e.g. Front iPad" /></label><label>Assign to table<select disabled={action.busy} aria-label="Assign to table" value={selected} required onChange={event => setSelection({ duty: duty?.tableNumber, value: event.target.value })}>{options.map(table => <option key={table.number} value={table.number}>Table {table.number}{tables?.devices?.some(item => item.tableNumber === table.number && item.deviceId !== device.id) ? " · Device assigned" : ""}</option>)}</select></label></div>
      <div className="actions"><button disabled={action.busy || !device.id || !selected}>{duty?.tableNumber ? "Change this device's table" : `Use this device at Table ${selected || "…"}`}</button>{duty?.tableNumber && <button type="button" className="secondary" disabled={action.busy} onClick={() => void action.run("retire_device", { deviceId: device.id }, "Removed from table duty. Organizer sign-in remains active.")}>Remove this device from table duty</button>}</div>
    </form>
    {duty?.tableNumber && <p className="form-note">If this device controls an unfinished match, save a pause and release it below before changing tables. Removing duty keeps the organizer signed in.</p>}
  </div>;
}

export function TableHome({ snapshot, refresh, renderMatch }: Props & { renderMatch: (match: Match) => ReactNode }) {
  const { tournament, tables } = snapshot, device = useTableDevice();
  const duty = tables?.devices?.find(item => item.deviceId === device.id && item.generation === (tournament.runGeneration ?? 0));
  const [dismissed, setDismissed] = useState<string | null>(null), [lastMatch, setLastMatch] = useState<string | null>(null);
  useEffect(() => { void Promise.resolve().then(() => setLastMatch(rememberedTableMatch(tournament.id))); }, [tournament.id]);
  const round = snapshot.rounds.filter(item => item.status !== "draft").at(-1);
  const queue = duty?.tableNumber ? tableQueue(snapshot, duty.tableNumber) : [];
  const unfinished = queue.filter(match => match.status !== "final");
  const previous = snapshot.rounds.flatMap(item => item.matches).find(match => match.id === lastMatch && match.status === "final") ?? queue.filter(match => match.status === "final").at(-1);
  const receipt = previous && previous.id !== dismissed ? previous : null;
  if (!snapshot.viewer.isOrganizer) return <div className="panel"><h2>Set up this table device</h2><p>Sign in with the organizer account to assign this device and operate the shared match screen.</p><Link className="button" href={`/login?next=${encodeURIComponent(`/t/${tournament.id}/table`)}`}>Sign in</Link></div>;
  if (!tables?.available) return <p className="notice">Table management is not available yet. <Link href={`/t/${tournament.slug}?browse=1`}>Open matches</Link></p>;
  if (!tables.enabled) return <section className="panel"><h2>Set up the event’s tables</h2><p>Add the physical tables first, then choose which one this device serves.</p><Link className="button" href={`/admin/tournaments/${tournament.id}/tables`}>Set up tables</Link></section>;
  if (tournament.status === "finished" || tournament.status === "archived") return <section className="panel"><h2>{tournament.status === "finished" ? "Tournament complete" : "Tournament archived"}</h2><p>All recorded results and player history remain available.</p><Link className="button" href={`/t/${tournament.slug}?browse=1#standings`}>View standings and history</Link></section>;
  return <div className="stack table-home">
    <section className="panel subtle"><p className="eyebrow">This device</p><h2>{duty?.tableNumber ? `Table ${duty.tableNumber}` : "Choose your table"}</h2>{duty?.tableNumber ? <><p className="muted">{duty.label} · Assignment remembered in this browser</p><details><summary>Change or remove table duty</summary><DeviceAssignment snapshot={snapshot} refresh={refresh} /></details></> : <DeviceAssignment snapshot={snapshot} refresh={refresh} />}</section>
    {duty?.tableNumber && <>
      {receipt && <section className="compact-stack" aria-label="Saved result"><div className="section-heading"><h2>Result saved · Round {receipt.roundNumber}</h2><button className="text" onClick={() => { setDismissed(receipt.id); rememberTableMatch(tournament.id, ""); }}>Dismiss receipt</button></div>{renderMatch(receipt)}</section>}
      <section aria-live="polite"><div className="section-heading"><h2>{unfinished.length ? `Round ${round?.number} · ${receipt ? "Next match" : "Your match"}` : "Waiting for pairings"}</h2><button className="text" onClick={() => void refresh()}>Refresh</button></div>
        {unfinished[0] ? <><p className="form-note">{matchLocation(snapshot, unfinished[0])?.ready ? "Ready at your table. Open the match, then start the timer when both players are ready." : "This match is waiting for its table."}</p>{renderMatch(unfinished[0])}<DeviceHandoff snapshot={snapshot} match={unfinished[0]} refresh={refresh} /></> : <p className="notice">{round ? "All matches at this table are recorded. The next pairing will appear here when published." : "Stay on this screen. Your pairing will appear when the organizer publishes the round."}</p>}
      </section>
      {unfinished.length > 1 && <section><h2>Later at this table</h2><p className="muted">Each match starts after the previous result is final.</p><div className="match-list">{unfinished.slice(1).map(match => <div key={match.id}>{renderMatch(match)}</div>)}</div></section>}
    </>}
    <Link href={`/t/${tournament.slug}?browse=1`}>Browse all tables</Link>
  </div>;
}

export function DeviceHandoff({ snapshot, match, refresh }: Props & { match: Match }) {
  const device = useTableDevice(), entry = useMatchEntry(match.id, snapshot.tournament.config.timeLimitSeconds !== null);
  const router = useRouter();
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const clock = entry.snapshot;
  async function change(mode: "replace" | "release") {
    if (!clock?.state || !device.id) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await matchClockApi<MatchClockSnapshot>(match.id, { controllerId: matchControllerId(match.id), deviceId: device.id, expectedOperationsVersion: snapshot.tables?.version, expectedClockVersion: clock.state.version, expectedEpoch: clock.state.epoch, mode, reason }, "open");
      await refresh(); entry.retry();
      if (mode === "replace") { rememberTableHome(snapshot.tournament.id); rememberTableMatch(snapshot.tournament.id, match.id); setReview(true); setNotice("This device now controls the match. Review the saved time below before continuing."); }
      else { setNotice("Clock released. Its saved time needs review on the receiving device. You can now move the match or close the table."); }
      if (!result.state?.reviewRequired && mode === "replace") router.push(`/match/${match.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change the device."); await refresh(); entry.retry(); }
    finally { setBusy(false); }
  }
  if (!clock?.state || match.status === "final" || snapshot.tournament.status !== "active") return null;
  return <details className="panel handoff" open={review || undefined}><summary>Replace or release this match’s device</summary>
    <p><strong>Table {physicalTable(snapshot, match)}</strong> · {clock.players.map(player => player.name).join(" / ")}</p>
    <p className="notice">Last saved clock: {clock.state.status}. Time used: {clock.players.map((player, index) => `${player.name} ${(clock.state!.usedMs[index] / 1000).toFixed(3)} seconds`).join("; ")}.</p>
    <p>If the old device is available, pause its timer and wait for it to save first. If it is unavailable, the saved time may be incomplete. Replacement always requires an organizer time review.</p>
    {clock.report && <p className="notice">Reviewing time clears the unfinalized score report. Check and enter the scores again, then ask both players to confirm the new report.</p>}
    {error && <p role="alert" className="notice error">{error}</p>}{notice && <p role="status" className="notice success">{notice}</p>}
    {!review && <form className="compact-stack" onSubmit={event => { event.preventDefault(); void change("replace"); }}><label>Reason for changing device<input required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label><div className="actions"><button disabled={busy || !device.id}>Replace this table’s device with this device</button><button type="button" className="secondary" disabled={busy || !device.id || !reason.trim()} onClick={() => void change("release")}>Release device to move or close table</button><button type="button" className="secondary" onClick={entry.retry}>Refresh saved clock</button></div><p className="form-note">The old device will lose match control. Organizer sign-in remains active. A location move alone does not transfer the clock.</p></form>}
    {review && <><OrganizerMatchClock matchId={match.id} player1={clock.players[0]} player2={clock.players[1]} enabled final={false} embedded initialAction="correct_clock" /><Link className="button" href={`/match/${match.id}`}>Continue to match</Link></>}
  </details>;
}

export function TablesPanel(props: Props) {
  const { snapshot, refresh } = props, { tournament, tables } = snapshot;
  const action = useTableActions(props), [numbers, setNumbers] = useState(""), [coverageOnly, setCoverageOnly] = useState(false);
  const suggested = [...new Set(snapshot.rounds.filter(round => round.status !== "draft").flatMap(round => round.matches).filter(match => match.player2Id).map(match => match.tableNumber))];
  const defaultNumbers = suggested.length ? suggested.join(", ") : Array.from({ length: Math.max(1, Math.ceil(snapshot.entrants.filter(player => player.active).length / 2)) }, (_, index) => index + 1).join(", ");
  const mutable = tournament.status === "draft" || tournament.status === "active";
  if (!tables?.available) return <p className="notice">Table management is not available yet. Existing match controls remain available.</p>;
  return <div className="stack">
    <section className="panel subtle"><h2>{tables.enabled ? "Tables and devices" : "Set up physical tables"}</h2><p className="muted">Keep table numbers stable. When there are more matches than tables, later matches wait in a queue.</p>{action.feedback}
      {mutable && <details open={!tables.enabled || undefined}><summary>{tables.enabled ? "Add tables" : "Choose available table numbers"}</summary><form className="compact-stack" onSubmit={event => { event.preventDefault(); const parsed = (numbers || (tables.enabled ? "" : defaultNumbers)).split(/[ ,]+/).filter(Boolean).map(Number); void action.run("configure_tables", { numbers: parsed }, "Tables saved. Generate a fresh preview before publishing."); }}><label>Table numbers<input required value={numbers || (tables.enabled ? "" : defaultNumbers)} onChange={event => setNumbers(event.target.value)} placeholder="1, 2, 3, 4" /></label><p className="form-note">Use numbers 1–128, separated by commas. Existing published matches keep their table; close or move them below.</p><button disabled={action.busy}>{tables.enabled ? "Add tables" : "Enable table management"}</button></form></details>}
    </section>
    {tables.enabled && <><section className="panel"><h2>This device</h2>{mutable ? <DeviceAssignment snapshot={snapshot} refresh={refresh} /> : <p>Table duties are read-only after the tournament closes.</p>}<Link href={`/t/${tournament.slug}/table`}>Open My table</Link></section>
      <section><div className="section-heading"><h2>Physical tables</h2><label><input type="checkbox" checked={coverageOnly} onChange={event => setCoverageOnly(event.target.checked)} />Needs a device</label></div><div className="table-grid">{tables.tables.filter(table => !coverageOnly || table.available && !tables.devices?.some(device => device.tableNumber === table.number)).map(table => <PhysicalTable key={table.number} {...props} number={table.number} available={table.available} mutable={mutable} />)}</div></section></>}
  </div>;
}

function PhysicalTable(props: Props & { number: number; available: boolean; mutable: boolean }) {
  const { snapshot, number, available, mutable } = props, action = useTableActions(props);
  const duty = snapshot.tables?.devices?.find(device => device.tableNumber === number);
  const queue = tableQueue(snapshot, number).filter(match => match.status !== "final");
  const destinations = snapshot.tables?.tables.filter(table => table.available && table.number !== number) ?? [];
  const [target, setTarget] = useState(""), [reason, setReason] = useState(""), [moveId, setMoveId] = useState("all");
  const selected = target || String(destinations[0]?.number ?? "");
  return <article className="panel compact-stack" aria-label={`Manage Table ${number}`}><div className="section-heading"><h3>Table {number}</h3><span className="badge">{available ? "Available" : "Closed"}</span></div>
    <p className={available && !duty ? "notice" : "muted"}>{duty ? duty.label : available ? "Needs a device" : "No device duty"}</p><p className="form-note">{queue.length ? `${queue.length} unfinished ${queue.length === 1 ? "match" : "matches"}` : "No unfinished match"}</p>
    {action.feedback}
    {mutable && <>
      {duty && <button className="secondary" disabled={action.busy} onClick={() => void action.run("retire_device", { deviceId: duty.deviceId }, "Device removed from table duty. Organizer sign-in remains active.")}>Remove {duty.label} from duty</button>}
      {!queue.length && <button className="secondary" disabled={action.busy} onClick={() => void action.run("set_table_available", { tableNumber: number, available: !available }, available ? `Table ${number} closed.` : `Table ${number} reopened.`)}>{available ? "Close table" : "Reopen table"}</button>}
      {queue.map((match, index) => <div key={match.id} className="compact-stack queue-item"><p><strong>{index + 1}. {snapshot.entrants.find(player => player.id === match.player1Id)?.name} / {snapshot.entrants.find(player => player.id === match.player2Id)?.name}</strong></p><Link href={`/admin/tournaments/${snapshot.tournament.id}#match-${match.id}`}>Open result and timing tools</Link>{index > 0 && <button className="secondary" disabled={action.busy} onClick={() => void action.run("reorder_queue", { matchId: match.id }, "Queue updated.")}>Play this match next</button>}<DeviceHandoff {...props} match={match} /></div>)}
      {!!queue.length && <details><summary>Move matches or close table</summary><form className="compact-stack" onSubmit={event => { event.preventDefault(); void action.run(moveId === "all" ? "close_table" : "move_match", { ...(moveId === "all" ? { tableNumber: number } : { matchId: moveId }), targetTable: Number(selected), reason }, moveId === "all" ? `Table ${number} closed. Unfinished matches moved to Table ${selected}.` : `Match moved to Table ${selected}.`); }}>
        <label>Move<select aria-label="Move" value={moveId} onChange={event => setMoveId(event.target.value)}><option value="all">All unfinished matches and close table</option>{queue.map((match, index) => <option key={match.id} value={match.id}>Match {index + 1} only</option>)}</select></label>
        <label>Destination table<select aria-label="Destination table" value={selected} onChange={event => setTarget(event.target.value)} required>{destinations.map(table => <option key={table.number} value={table.number}>Table {table.number}</option>)}</select></label>
        <label>Reason for moving<input required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <p className="notice">{moveId === "all" ? `All ${queue.length} unfinished matches` : "This match"} will join the end of Table {selected || "…" }’s queue. Opponents, starter and saved time stay unchanged. Release any controlled clocks first. The destination device opens the match when it is ready; to move this device too, change its duty after the move.</p>
        {!destinations.length && <p role="status">Open another table before moving these matches.</p>}<button disabled={action.busy || !selected}>Confirm move{moveId === "all" ? " and close table" : ""}</button>
      </form></details>}
    </>}
  </article>;
}
