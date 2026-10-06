"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Entrant, Match, Tournament, TournamentConfig, TournamentSnapshot } from "@/domain/types";
import { calculateScore } from "@/domain/scoring";
import { parsePlayerNames, suggestRoundCount } from "@/domain/roster";
import { OrganizerMatchClock } from "@/components/organizer-match-clock";
import { StartMatch } from "@/components/start-match";

type AuthState = { authenticated: boolean; email?: string; isOrganizer: boolean; configured: boolean };
type View = "matches" | "players" | "settings" | "rules" | "round" | "history";
type Command = (command: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
const pendingRequests = new Map<string, string>();

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function api<T>(path: string, method = "GET", body?: Record<string, unknown>): Promise<T> {
  const fingerprint = body ? `${path}:${JSON.stringify(body)}` : "";
  let requestId: string | undefined;
  if (body && !body.requestId && path !== "/api/auth" && path !== "/api/join") {
    requestId = pendingRequests.get(fingerprint) ?? crypto.randomUUID();
    pendingRequests.set(fingerprint, requestId);
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method, credentials: "same-origin", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify({ ...body, ...(requestId ? { requestId } : {}) }) : undefined,
    });
  } catch {
    throw new Error("Could not connect. Your entries are saved on this page. Try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status < 500) pendingRequests.delete(fingerprint);
  if (!response.ok) {
    const details = Array.isArray(data.issues) ? data.issues.map((issue: { line: number; message: string }) => `Line ${issue.line}: ${issue.message}`).join("\n") : "";
    throw new ApiError(`${data.error ?? "This action could not be completed."}${details ? `\n${details}` : ""}`, response.status);
  }
  pendingRequests.delete(fingerprint);
  return data as T;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "This action could not be completed."; }
function signed(value: number): string { return value > 0 ? `+${value}` : String(value); }
function dateLabel(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}
function statusLabel(status: string): string { return ({ draft: "Draft", active: "In progress", finished: "Finished", archived: "Archived", awaiting_confirmation: "Awaiting confirmation", unreported: "No result", disputed: "Needs review", final: "Final", completed: "Completed", published: "In progress" } as Record<string, string>)[status] ?? status; }

function ErrorNotice({ message }: { message: string | null }) { return message ? <div role="alert" className="notice error">{message}</div> : null; }
function Loading() { return <p className="loading" role="status">Loading…</p>; }
function Badge({ status }: { status: string }) { return <span className={`badge ${status === "active" ? "active" : ""}`}>{statusLabel(status)}</span>; }
function Field({ label, id, children, note }: { label: string; id: string; children: ReactNode; note?: string }) {
  return <div><label htmlFor={id}>{label}</label>{children}{note && <p className="form-note">{note}</p>}</div>;
}

function useSnapshot(key: string) {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { const data = await api<TournamentSnapshot>(`/api/tournaments/${encodeURIComponent(key)}`); setSnapshot(data); setError(null); return data; }
    catch (cause) { setError(errorMessage(cause)); return null; }
    finally { setLoading(false); }
  }, [key]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = snapshot?.tournament.status === "active" ? window.setInterval(onFocus, 20000) : undefined;
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); if (timer) window.clearInterval(timer); };
  }, [refresh, snapshot?.tournament.status]);
  return { snapshot, error, loading, refresh };
}

export function TournamentListPage({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const load = useCallback(async () => {
    try {
      if (admin) { const session = await api<AuthState>("/api/auth"); setAuth(session); if (!session.isOrganizer) return; }
      const data = await api<{ tournaments: Tournament[] }>(`/api/tournaments?scope=${admin ? "admin" : "public"}`);
      setTournaments(data.tournaments); setError(null);
    } catch (cause) { setError(errorMessage(cause)); }
  }, [admin]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  if (admin && auth && !auth.isOrganizer) return <div className="narrow"><h1>Manage tournaments</h1><p className="muted">Sign in with your organizer account.</p>{!auth.configured && <div className="notice">Tournament storage has not been configured.</div>}<Link className="button" href="/login">Sign in</Link></div>;
  const visible = tournaments?.filter(tournament => admin ? archived || tournament.status !== "archived" : tournament.status !== "archived");
  return <>
    <div className="page-heading"><div><p className="eyebrow">Crossplay · Swiss</p><h1>{admin ? "Your tournaments" : "Tournaments"}</h1><p className="muted">{admin ? "Players, rounds, and results." : "Pairings, results, and standings."}</p></div>{admin && <Link className="button" href="/admin/tournaments/new">New tournament</Link>}</div>
    <ErrorNotice message={error} />
    {error && <button className="secondary" onClick={() => void load()}>Try again</button>}
    {admin && tournaments && <div className="section-heading"><label><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />Show archived</label><button className="text" onClick={async () => { try { await api("/api/auth", "DELETE"); router.push("/"); router.refresh(); } catch (cause) { setError(errorMessage(cause)); } }}>Sign out</button></div>}
    {!tournaments && !error && <Loading />}
    {visible?.length === 0 && <div className="empty"><h2>{admin ? "Create your first tournament" : "No tournaments yet"}</h2><p>{admin ? "Add your players and publish the first round." : "Published tournaments will appear here."}</p>{admin && <Link className="button" href="/admin/tournaments/new">New tournament</Link>}</div>}
    <ul className="list">{visible?.map(tournament => <li className="tournament-row" key={tournament.id}><div><h2><Link href={admin ? `/admin/tournaments/${tournament.id}` : `/t/${tournament.slug}`}>{tournament.name}</Link></h2><p>{[dateLabel(tournament.date), `${tournament.entrantCount} players`, tournament.currentRound ? `Round ${tournament.currentRound}${tournament.config.roundCount ? ` of ${tournament.config.roundCount}` : ""}` : null].filter(Boolean).join(" · ")}</p></div><Badge status={tournament.status} /></li>)}</ul>
  </>;
}

type SettingsValues = { name: string; date: string; rounds: string; interval: string; deduction: string; timeLimit: string };
function settingsValues(tournament?: Tournament): SettingsValues {
  return { name: tournament?.name ?? "", date: tournament?.date?.slice(0, 10) ?? "", rounds: tournament?.config.roundCount?.toString() ?? "", interval: String(tournament?.config.penaltyIntervalSeconds ?? 10), deduction: String(tournament?.config.penaltyPoints ?? 2), timeLimit: tournament ? tournament.config.timeLimitSeconds === null ? "" : String(tournament.config.timeLimitSeconds / 60) : "20" };
}
function configValues(values: SettingsValues): TournamentConfig { return { roundCount: values.rounds ? Number(values.rounds) : null, penaltyIntervalSeconds: Number(values.interval), penaltyPoints: Number(values.deduction), timeLimitSeconds: values.timeLimit ? Math.round(Number(values.timeLimit) * 60) : null }; }

function SettingsFields({ values, setValues, locked = false, playerCount }: { values: SettingsValues; setValues: (values: SettingsValues) => void; locked?: boolean; playerCount?: number }) {
  const update = (key: keyof SettingsValues, value: string) => setValues({ ...values, [key]: value });
  return <>
    <Field id="tournament-name" label="Tournament name"><input id="tournament-name" required maxLength={120} value={values.name} onChange={event => update("name", event.target.value)} autoComplete="off" /></Field>
    <Field id="tournament-date" label="Date (optional)"><input id="tournament-date" type="date" value={values.date} onChange={event => update("date", event.target.value)} /></Field>
    {locked && <div className="notice">Rules were locked when the first round was published.</div>}
    <fieldset disabled={locked} className="compact-stack"><legend>Rules</legend>
      <div className="form-grid"><Field id="round-count" label="Rounds" note={values.rounds ? "Set before the first round. Withdrawals may prevent later pairings." : `Automatic${playerCount && playerCount >= 2 ? `: ${suggestRoundCount(playerCount)} rounds for ${playerCount} players` : ": based on the number of players"}.`}><input id="round-count" type="number" min={1} max={255} step={1} placeholder="Automatic" value={values.rounds} onChange={event => update("rounds", event.target.value)} /></Field><Field id="time-limit" label="Minutes per player" note="Leave blank to use an external clock."><input id="time-limit" type="number" min={1 / 60} max={1440} step="any" value={values.timeLimit} onChange={event => update("timeLimit", event.target.value)} /></Field></div>
      <div className="form-grid"><Field id="penalty-points" label="Overtime deduction (points)"><input id="penalty-points" type="number" required min={0} max={100} step={1} value={values.deduction} onChange={event => update("deduction", event.target.value)} /></Field><Field id="penalty-interval" label="For every (seconds)"><input id="penalty-interval" type="number" required min={1} max={3600} step={1} value={values.interval} onChange={event => update("interval", event.target.value)} /></Field></div>
      <p className="form-note">Completed intervals only. Win 1 · Draw ½ · Loss 0. Ties use cumulative score difference after penalties.</p>
    </fieldset>
  </>;
}

export function NewTournamentPage() {
  const router = useRouter();
  const [values, setValues] = useState<SettingsValues>(settingsValues());
  const [source, setSource] = useState<Tournament | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const copyId = new URLSearchParams(window.location.search).get("copy");
    if (!copyId) { void Promise.resolve().then(() => setLoading(false)); return; }
    void api<TournamentSnapshot>(`/api/tournaments/${encodeURIComponent(copyId)}`).then(data => { setSource(data.tournament); setValues({ ...settingsValues(data.tournament), name: `${data.tournament.name} copy`.slice(0, 120), date: "" }); }).catch(cause => setError(errorMessage(cause))).finally(() => setLoading(false));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const created = source ? await api<{ id: string; slug: string }>(`/api/tournaments/${source.id}/commands`, "POST", { command: "copy_tournament", payload: { name: values.name }, expectedVersion: source.version }) : await api<{ id: string; slug: string }>("/api/tournaments", "POST", { name: values.name, date: values.date || null, config: configValues(values) });
      router.push(`/admin/tournaments/${created.id}${source ? "/settings" : "/players"}`);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <><Link className="back" href="/admin">← Your tournaments</Link><div className="page-heading"><div><h1>{source ? "Copy tournament settings" : "New tournament"}</h1>{source && <p className="muted">From {source.name}. Players and results are not copied.</p>}</div></div><ErrorNotice message={error} />{loading ? <Loading /> : <form className="form" onSubmit={submit}>{source ? <Field id="copy-name" label="Tournament name"><input id="copy-name" required maxLength={120} value={values.name} onChange={event => setValues({ ...values, name: event.target.value })} /><p className="form-note">You can edit the copied rules before adding players.</p></Field> : <SettingsFields values={values} setValues={setValues} />}<div className="actions"><button disabled={busy}>{busy ? "Creating…" : "Create tournament"}</button><Link className="button secondary" href="/admin">Cancel</Link></div></form>}</>;
}

export function TournamentPage({ tournamentKey, admin = false, view = "matches", roundNumber, entrantId }: { tournamentKey: string; admin?: boolean; view?: View; roundNumber?: number; entrantId?: string }) {
  const { snapshot, error, loading, refresh } = useSnapshot(tournamentKey);
  const command: Command = useCallback(async (name, payload = {}) => {
    if (!snapshot) throw new Error("Tournament is still loading.");
    try {
      const result = await api<Record<string, unknown>>(`/api/tournaments/${snapshot.tournament.id}/commands`, "POST", { command: name, payload, expectedVersion: snapshot.tournament.version });
      await refresh(); return result;
    } catch (cause) { if (cause instanceof ApiError && cause.status === 409) await refresh(); throw cause; }
  }, [snapshot, refresh]);
  if (loading) return <Loading />;
  if (!snapshot) return <><ErrorNotice message={error ?? "Tournament not found."} /><div className="actions"><button className="secondary" onClick={() => void refresh()}>Try again</button><Link href={admin ? "/admin" : "/"}>Tournaments</Link></div></>;
  if (admin && !snapshot.viewer.isOrganizer) return <div className="narrow"><h1>Organizer sign in</h1><p className="muted">An organizer account is required to manage this tournament.</p><Link className="button" href="/login">Sign in</Link></div>;
  const tournament = snapshot.tournament;
  const base = admin ? `/admin/tournaments/${tournament.id}` : `/t/${tournament.slug}`;
  return <>
    <Link className="back" href={admin ? "/admin" : "/"}>← {admin ? "Your tournaments" : "Tournaments"}</Link>
    <div className="page-heading"><div><p className="eyebrow">{["Swiss", dateLabel(tournament.date), `${tournament.entrantCount} players`].filter(Boolean).join(" · ")}</p><h1>{tournament.name}</h1><Badge status={tournament.status} /></div><div className="actions">{admin ? <Link className="button secondary" href={`/t/${tournament.slug}`}>Public page</Link> : snapshot.viewer.isOrganizer && <Link className="button secondary" href={`/admin/tournaments/${tournament.id}`}>Manage</Link>}</div></div>
    <nav className="tabs" aria-label="Tournament navigation"><Link href={base} aria-current={view === "matches" ? "page" : undefined}>{admin ? "Rounds & results" : "Tournament"}</Link>{admin ? <><Link href={`${base}/players`} aria-current={view === "players" ? "page" : undefined}>Players</Link><Link href={`${base}/settings`} aria-current={view === "settings" ? "page" : undefined}>Settings</Link></> : <><Link href={`${base}#standings`}>Standings</Link><Link href={`${base}/rules`} aria-current={view === "rules" ? "page" : undefined}>Rules</Link></>}</nav>
    <ErrorNotice message={error} />
    {view === "players" && <RosterPanel snapshot={snapshot} command={command} />}
    {view === "settings" && <SettingsPanel snapshot={snapshot} command={command} />}
    {view === "rules" && <RulesPanel tournament={tournament} />}
    {view === "history" && <PlayerHistory snapshot={snapshot} entrantId={entrantId ?? ""} />}
    {view === "round" && <RoundPanel snapshot={snapshot} roundNumber={roundNumber} command={command} />}
    {view === "matches" && (admin ? <OrganizerPanel snapshot={snapshot} command={command} /> : <PublicPanel snapshot={snapshot} command={command} />)}
  </>;
}

function RosterPanel({ snapshot, command }: { snapshot: TournamentSnapshot; command: Command }) {
  const [names, setNames] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { tournament, entrants } = snapshot;
  const parsed = parsePlayerNames(names, entrants.map(entrant => entrant.name));
  async function add(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    try { await command("add_entrants", { names }); setSuccess(`${parsed.names.length} ${parsed.names.length === 1 ? "player" : "players"} added.`); setNames(""); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className={tournament.status === "draft" ? "main-and-aside" : "stack"}>
    <section><div className="section-heading"><h2>Players <span className="muted">{entrants.length}</span></h2><span className="muted">{entrants.filter(entrant => entrant.active).length} active</span></div>{entrants.length === 0 ? <div className="empty"><p>No players added.</p></div> : <div>{entrants.map(entrant => <RosterRow key={entrant.id} entrant={entrant} tournament={tournament} command={command} />)}</div>}</section>
    {tournament.status === "draft" && <aside className="panel"><h2>Add players</h2><form className="compact-stack" onSubmit={add}><Field id="bulk-names" label="Player names" note="One player per line. Up to 256 players."><textarea id="bulk-names" rows={9} placeholder={"Alex\nJamie\nMorgan"} value={names} onChange={event => { setNames(event.target.value); setSuccess(null); }} /></Field><div aria-live="polite"><p className="form-note">{parsed.names.length} {parsed.names.length === 1 ? "player" : "players"} to add</p>{parsed.errors.length > 0 && <div className="notice error">{parsed.errors.map((issue, index) => <div key={index}>Line {issue.line}: {issue.message}</div>)}</div>}{entrants.length + parsed.names.length > 256 && <div className="notice error">A tournament can have up to 256 players.</div>}</div><ErrorNotice message={error} />{success && <p role="status" className="notice success">{success}</p>}<button disabled={busy || !parsed.names.length || parsed.errors.length > 0 || entrants.length + parsed.names.length > 256}>{busy ? "Adding…" : "Add players"}</button></form></aside>}
  </div>;
}

function RosterRow({ entrant, tournament, command }: { entrant: Entrant; tournament: Tournament; command: Command }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(entrant.name);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const writable = tournament.status === "draft" || tournament.status === "active";
  async function run(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError(null);
    try { const result = await command(action, { entrantId: entrant.id, ...payload }); if (action === "issue_invite") { setInvite(String(result.inviteUrl)); setCopied(false); } if (action === "update_entrant") setEditing(false); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="roster-row"><div className="roster-content">
    {editing ? <form className="inline-form" onSubmit={event => { event.preventDefault(); void run("update_entrant", { name }); }}><label className="sr-only" htmlFor={`name-${entrant.id}`}>Player name</label><input id={`name-${entrant.id}`} autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} /><button disabled={busy}>Save</button><button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button></form> : <span className="player-name">{entrant.name} {!entrant.active && <span className="badge">Withdrawn</span>}</span>}
    {invite && <><div className="invite"><label className="sr-only" htmlFor={`invite-${entrant.id}`}>Private player link for {entrant.name}</label><input ref={inputRef} id={`invite-${entrant.id}`} value={invite} readOnly onFocus={event => event.target.select()} /><button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(invite); setCopied(true); } catch { inputRef.current?.select(); setError("Select and copy the player link."); } }}>{copied ? "Copied" : "Copy"}</button></div><p className="form-note">Private link for {entrant.name}. Earlier links and sessions have been replaced.</p></>}
    <ErrorNotice message={error} />
  </div>{!editing && writable && <div className="roster-actions"><button className="text" disabled={busy} onClick={() => { setName(entrant.name); setEditing(true); }}>Rename</button>{entrant.active && <button className="text" disabled={busy} onClick={() => void run("issue_invite")}>New player link</button>}{tournament.status === "draft" ? <button className="text" disabled={busy} onClick={() => void run("remove_entrant")}>Remove</button> : entrant.active && <button className="text" disabled={busy} onClick={() => void run("withdraw_entrant")}>Withdraw</button>}</div>}</div>;
}

function SettingsPanel({ snapshot, command }: { snapshot: TournamentSnapshot; command: Command }) {
  const [values, setValues] = useState(settingsValues(snapshot.tournament));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const tournament = snapshot.tournament;
  const readOnly = tournament.status === "finished" || tournament.status === "archived";
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try { await command("update_settings", { name: values.name, date: values.date || null, config: configValues(values) }); setSaved(true); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="main-and-aside"><section><h2>Settings</h2>{readOnly ? <RulesPanel tournament={tournament} /> : <form className="form" onSubmit={save}><SettingsFields values={values} setValues={next => { setValues(next); setSaved(false); }} locked={tournament.status !== "draft"} playerCount={snapshot.entrants.filter(entrant => entrant.active).length} /><ErrorNotice message={error} />{saved && <p role="status" className="notice success">Settings saved.</p>}<div><button disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></div></form>}</section><aside className="panel"><h2>Run another tournament</h2><p className="muted">Create a draft with these rules.</p><Link className="button secondary" href={`/admin/tournaments/new?copy=${tournament.id}`}>Copy settings</Link></aside></div>;
}

function RulesPanel({ tournament }: { tournament: Tournament }) {
  const config = tournament.config;
  return <section style={{ maxWidth: 760 }}><h2>Tournament rules</h2><dl className="rules-list"><dt>Format</dt><dd>Swiss · {config.roundCount ?? "Automatic"} rounds</dd><dt>Match points</dt><dd>Win 1 · Draw ½ · Loss 0</dd><dt>Tiebreaker</dt><dd>Cumulative score difference after overtime penalties. Equal match points and difference share a rank.</dd><dt>Overtime</dt><dd>{config.penaltyPoints} {config.penaltyPoints === 1 ? "point" : "points"} deducted for each completed {config.penaltyIntervalSeconds} seconds over time.{config.penaltyPoints > 0 && <> At {config.penaltyIntervalSeconds - 1} seconds: 0 points. At {config.penaltyIntervalSeconds} seconds: {config.penaltyPoints} points.</>}</dd>{config.timeLimitSeconds !== null && <><dt>Time limit</dt><dd>{config.timeLimitSeconds} seconds per player</dd></>}<dt>Reporting</dt><dd>Either player reports both scores and overtime. The opponent confirms. An organizer resolves disputes.</dd><dt>Byes</dt><dd>1 match point, no score difference. No repeat bye after a bye or forfeit win.</dd><dt>Forfeits</dt><dd>Winner receives 1 match point. No score difference. A double forfeit awards no match points.</dd><dt>Pairings</dt><dd>Similar match points where possible. No repeated opponents. Withdrawn players are excluded from future rounds.</dd></dl></section>;
}

function StandingsPanel({ snapshot }: { snapshot: TournamentSnapshot }) {
  return <section id="standings"><div className="section-heading"><h2>Standings</h2><span className="muted" style={{ fontSize: 12 }}>Confirmed results</span></div>{snapshot.standings.length === 0 ? <p className="muted">Standings will appear when players are added.</p> : <div className="table-wrap"><table><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col" className="number">Points</th><th scope="col" className="number">Difference</th></tr></thead><tbody>{snapshot.standings.map(standing => <tr key={standing.entrantId} className={standing.entrantId === snapshot.viewer.entrantId ? "my-row" : undefined}><td>{standing.rank}</td><td className="player-name"><Link href={`/t/${snapshot.tournament.slug}/players/${standing.entrantId}`}>{standing.name}</Link>{standing.entrantId === snapshot.viewer.entrantId && <small> · You</small>}{!standing.active && <small> · Withdrawn</small>}</td><td className="number">{standing.matchPoints}</td><td className="number">{signed(standing.difference)}</td></tr>)}</tbody></table></div>}</section>;
}

function RoundLinks({ snapshot, selected }: { snapshot: TournamentSnapshot; selected?: number }) {
  const rounds = snapshot.rounds.filter(round => round.status !== "draft");
  return rounds.length > 0 ? <nav className="round-nav" aria-label="Rounds">{rounds.map(round => <Link key={round.id} href={`/t/${snapshot.tournament.slug}/rounds/${round.number}`} aria-current={round.number === selected ? "page" : undefined}>Round {round.number}</Link>)}</nav> : null;
}

function PublicPanel({ snapshot, command }: { snapshot: TournamentSnapshot; command: Command }) {
  const rounds = snapshot.rounds.filter(round => round.status !== "draft");
  const current = rounds.at(-1);
  const mine = current?.matches.find(match => match.player1Id === snapshot.viewer.entrantId || match.player2Id === snapshot.viewer.entrantId);
  return <div className="stack">
    {mine && snapshot.tournament.status === "active" && <section><h2>Your match · Round {current?.number}</h2><MatchCard match={mine} snapshot={snapshot} command={command} player /></section>}
    {!current ? <div className="empty"><h2>Pairings are not published yet</h2><p>The first round will appear here.</p></div> : <section><div className="section-heading"><h2>{snapshot.tournament.status === "finished" || snapshot.tournament.status === "archived" ? "Final round" : `Round ${current.number}`}</h2><Badge status={current.status} /></div><RoundLinks snapshot={snapshot} selected={current.number} /><div className="match-list">{current.matches.map(match => <MatchCard key={match.id} match={match} snapshot={snapshot} />)}</div></section>}
    <StandingsPanel snapshot={snapshot} />
  </div>;
}

function RoundPanel({ snapshot, roundNumber, command }: { snapshot: TournamentSnapshot; roundNumber?: number; command: Command }) {
  const round = snapshot.rounds.find(item => item.number === roundNumber && item.status !== "draft");
  return <section><h2>Round {roundNumber}</h2><RoundLinks snapshot={snapshot} selected={roundNumber} />{round ? <div className="match-list">{round.matches.map(match => <MatchCard key={match.id} match={match} snapshot={snapshot} command={command} player={snapshot.viewer.entrantId === match.player1Id || snapshot.viewer.entrantId === match.player2Id} />)}</div> : <p className="muted">This round has not been published.</p>}</section>;
}

function PlayerHistory({ snapshot, entrantId }: { snapshot: TournamentSnapshot; entrantId: string }) {
  const entrant = snapshot.entrants.find(item => item.id === entrantId);
  const standing = snapshot.standings.find(item => item.entrantId === entrantId);
  const matches = snapshot.rounds.filter(round => round.status !== "draft").flatMap(round => round.matches).filter(match => match.player1Id === entrantId || match.player2Id === entrantId);
  if (!entrant) return <p className="muted">Player not found.</p>;
  return <section><div className="page-heading"><div><h2>{entrant.name}</h2><p className="muted">{standing && `${standing.matchPoints} points · ${signed(standing.difference)} difference · ${standing.wins} wins, ${standing.draws} draws, ${standing.losses} losses`}</p></div>{!entrant.active && <span className="badge">Withdrawn</span>}</div><div className="match-list">{matches.map(match => <div key={match.id}><p className="eyebrow">Round {match.roundNumber}</p><MatchCard match={match} snapshot={snapshot} /></div>)}</div>{matches.length === 0 && <p className="muted">No matches yet.</p>}</section>;
}

function OrganizerPanel({ snapshot, command }: { snapshot: TournamentSnapshot; command: Command }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const { tournament, rounds } = snapshot;
  const draft = rounds.find(round => round.status === "draft");
  const published = rounds.filter(round => round.status !== "draft");
  const current = published.at(-1);
  const selected = selectedRound === null ? draft ?? current : rounds.find(round => round.number === selectedRound) ?? draft ?? current;
  const pending = current?.matches.filter(match => match.status !== "final").length ?? 0;
  const planned = tournament.config.roundCount ?? suggestRoundCount(Math.max(2, snapshot.entrants.filter(entrant => entrant.active).length));
  const finished = tournament.status === "finished" || tournament.status === "archived";
  const allRoundsPlayed = published.length >= planned;
  async function run(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError(null);
    try { await command(action, payload); setSelectedRound(null); setReason(""); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="stack">
    <section className="panel subtle"><div className="section-heading"><div><h2>{finished ? "Tournament complete" : tournament.correctionsOnly ? "Results reopened" : draft ? `Round ${draft.number} is ready to publish` : !current ? "Start the tournament" : pending ? `${pending} ${pending === 1 ? "match" : "matches"} to resolve` : allRoundsPlayed ? "All rounds complete" : `Round ${current.number} complete`}</h2><p className="muted" style={{ marginTop: 7 }}>{finished ? `${published.length} rounds played.` : tournament.correctionsOnly ? "Correct the results, then finish the tournament again." : !current ? `${snapshot.entrants.filter(entrant => entrant.active).length} active players · ${planned} rounds` : draft ? "Players will see their opponents when you publish." : pending ? "Enter or confirm all results to continue." : allRoundsPlayed ? "Finish to make the final standings official." : `${planned - published.length} rounds remaining.`}</p></div></div>
      <ErrorNotice message={error} />
      <div className="actions">
        {!finished && draft && <button disabled={busy} onClick={() => void run("publish_round", { roundId: draft.id })}>{busy ? "Publishing…" : `Publish round ${draft.number}`}</button>}
        {!finished && !tournament.correctionsOnly && !draft && !pending && !allRoundsPlayed && <button disabled={busy || snapshot.entrants.filter(entrant => entrant.active).length < 2} onClick={() => void run("generate_round")}>{busy ? "Pairing…" : `Preview round ${(current?.number ?? 0) + 1}`}</button>}
        {!finished && allRoundsPlayed && !pending && <button disabled={busy} onClick={() => void run("finish_tournament", { reason: "" })}>{busy ? "Finishing…" : "Finish tournament"}</button>}
        {!current && <Link className="button secondary" href={`/admin/tournaments/${tournament.id}/players`}>Add players</Link>}
        {tournament.status === "finished" && <button className="secondary" disabled={busy} onClick={() => void run("archive_tournament")}>Archive tournament</button>}
        {finished && <Link className="button secondary" href={`/admin/tournaments/new?copy=${tournament.id}`}>Copy settings</Link>}
      </div>
      {tournament.status === "active" && published.length > 0 && !pending && !allRoundsPlayed && <details className="section-space" open={tournament.correctionsOnly || undefined}><summary>{tournament.correctionsOnly ? "Finish corrected tournament" : "Finish early"}</summary><form className="form" onSubmit={event => { event.preventDefault(); void run("finish_tournament", { reason }); }}><Field id="finish-reason" label="Reason"><input id="finish-reason" required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field><div><button className="secondary" disabled={busy}>{tournament.correctionsOnly ? "Finish tournament" : "Finish tournament early"}</button></div></form></details>}
      {tournament.status === "finished" && <details className="section-space"><summary>Reopen results for a correction</summary><form className="form" onSubmit={event => { event.preventDefault(); void run("reopen_tournament", { reason }); }}><Field id="reopen-reason" label="Reason"><input id="reopen-reason" required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field><div><button className="secondary" disabled={busy}>Reopen results</button></div></form></details>}
    </section>
    {selected && <section><div className="section-heading"><h2>Round {selected.number}</h2><Badge status={selected.status} /></div>{rounds.length > 1 && <div className="round-nav">{rounds.map(round => <button key={round.id} className={round.number === selected.number ? "" : "secondary"} onClick={() => setSelectedRound(round.number)}>Round {round.number}{round.status === "draft" ? " · Draft" : ""}</button>)}</div>}<div className="match-list">{selected.matches.map(match => <MatchCard key={match.id} match={match} snapshot={snapshot} command={command} admin={!finished && selected.status !== "draft"} draft={selected.status === "draft"} />)}</div></section>}
    <StandingsPanel snapshot={snapshot} />
    {snapshot.audit && snapshot.audit.length > 0 && <details><summary>Organizer history</summary><ul className="list">{snapshot.audit.slice().reverse().map(event => <li key={event.id} className="history-meta"><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time> · {event.action.replaceAll("_", " ")}{event.reason && ` · ${event.reason}`}</li>)}</ul></details>}
  </div>;
}

function MatchCard({ match, snapshot, command, admin = false, player = false, draft = false }: { match: Match; snapshot: TournamentSnapshot; command?: Command; admin?: boolean; player?: boolean; draft?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const player1 = snapshot.entrants.find(entrant => entrant.id === match.player1Id);
  const player2 = snapshot.entrants.find(entrant => entrant.id === match.player2Id);
  const canReport = player && snapshot.tournament.status === "active" && match.status !== "final" && match.status !== "disputed" && !!match.player2Id;
  const ownReport = match.report?.submittedBy === snapshot.viewer.entrantId;
  const reported = match.report ? calculateScore(match.report, snapshot.tournament.config) : null;
  const displayed = match.result ?? reported;
  async function run(action: string, payload: Record<string, unknown>) {
    if (!command) return;
    setBusy(true); setError(null);
    try { await command(action, { matchId: match.id, expectedRevision: match.revision, ...payload }); setDisputing(false); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  function score(side: 1 | 2) {
    if (!displayed) return "—";
    if (match.kind === "bye") return "+1 point";
    if (match.kind === "forfeit" || match.kind === "double_forfeit") return (side === 1 ? displayed.points1 : displayed.points2) > 0 ? "Win" : "Loss";
    return side === 1 ? displayed.adjusted1 : displayed.adjusted2;
  }
  return <article className="match" aria-label={`${player1?.name ?? "Player"}${player2 ? ` versus ${player2.name}` : ", bye"}`}>
    <div className="match-topline"><span>{match.player2Id ? `Table ${match.tableNumber}` : "Bye"}</span>{draft ? <span>Not published</span> : <Badge status={match.status} />}</div>
    <div className="match-player"><span className="player-name"><Link href={`/t/${snapshot.tournament.slug}/players/${match.player1Id}`}>{player1?.name ?? "Player"}</Link>{player && snapshot.viewer.entrantId === match.player1Id && <small> · You</small>}</span><span className="match-score">{score(1)}</span></div>
    {match.player2Id && <div className="match-player"><span className="player-name"><Link href={`/t/${snapshot.tournament.slug}/players/${match.player2Id}`}>{player2?.name ?? "Player"}</Link>{player && snapshot.viewer.entrantId === match.player2Id && <small> · You</small>}</span><span className="match-score">{score(2)}</span></div>}
    {match.kind === "forfeit" && <p className="score-preview">Forfeit</p>}{match.kind === "double_forfeit" && <p className="score-preview">Double forfeit · No match points</p>}
    {displayed && (displayed.overtime1 > 0 || displayed.overtime2 > 0) && <p className="score-preview">{[{ name: player1?.name, seconds: displayed.overtime1, raw: displayed.raw1, adjusted: displayed.adjusted1 }, { name: player2?.name, seconds: displayed.overtime2, raw: displayed.raw2, adjusted: displayed.adjusted2 }].filter(side => side.seconds > 0).map(side => `${side.name}: ${side.seconds}s overtime${side.raw !== null && side.adjusted !== null ? ` (−${side.raw - side.adjusted} points)` : ""}`).join(" · ")}</p>}
    {match.report && !match.result && <div className="match-bottom"><p className="muted">{match.status === "disputed" ? "An organizer is reviewing this result." : ownReport && player ? "Waiting for your opponent to confirm." : "Reported result · Not yet confirmed"}</p>{match.report.disputeReason && (admin || player) && <p>Issue: {match.report.disputeReason}</p>}</div>}
    {snapshot.viewer.isOrganizer && !draft && snapshot.tournament.status === "active" && match.player2Id && match.status !== "final" && snapshot.tournament.config.timeLimitSeconds !== null && <StartMatch matchId={match.id} reported={match.status !== "unreported"} />}
    {canReport && command && !editing && <div className="match-bottom">
      <ErrorNotice message={error} />
      {match.report && !ownReport ? <div className="actions"><button disabled={busy} onClick={() => void run("confirm_report", { reportId: match.report!.id })}>{busy ? "Confirming…" : "Confirm result"}</button><button className="secondary" disabled={busy} onClick={() => setDisputing(true)}>Report issue</button></div> : <button className={match.report ? "secondary" : ""} onClick={() => setEditing(true)}>{match.report ? "Edit result" : "Report result"}</button>}
      {disputing && match.report && <form className="compact-stack score-entry" onSubmit={event => { event.preventDefault(); void run("dispute_report", { reportId: match.report!.id, reason }); }}><Field id={`dispute-${match.id}`} label="What needs to change?"><textarea id={`dispute-${match.id}`} required maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></Field><div className="actions"><button disabled={busy}>Send to organizer</button><button type="button" className="secondary" onClick={() => setDisputing(false)}>Cancel</button></div></form>}
    </div>}
    {admin && command && match.player2Id && !editing && <div className="match-bottom"><button className="secondary" onClick={() => setEditing(true)}>{match.status === "final" ? "Correct result" : match.status === "disputed" ? "Resolve result" : "Enter result"}</button></div>}
    {admin && match.player2Id && <OrganizerMatchClock matchId={match.id} player1={{ id: match.player1Id, name: player1?.name ?? "Player 1" }} player2={{ id: match.player2Id, name: player2?.name ?? "Player 2" }} enabled={snapshot.tournament.config.timeLimitSeconds !== null} final={match.status === "final"} />}
    {editing && command && <ScoreForm match={match} snapshot={snapshot} command={command} admin={admin} close={() => setEditing(false)} />}
  </article>;
}

type ScoreValues = { raw1: string; raw2: string; overtime1: string; overtime2: string };
function initialScores(match: Match): ScoreValues {
  const previous = match.report ?? match.result;
  return { raw1: previous?.raw1?.toString() ?? "", raw2: previous?.raw2?.toString() ?? "", overtime1: previous?.overtime1 ? String(previous.overtime1) : "", overtime2: previous?.overtime2 ? String(previous.overtime2) : "" };
}

function ScoreForm({ match, snapshot, command, admin, close }: { match: Match; snapshot: TournamentSnapshot; command: Command; admin: boolean; close: () => void }) {
  const [values, setValues] = useState<ScoreValues>(initialScores(match));
  const [revision, setRevision] = useState(match.revision);
  const [kind, setKind] = useState("played");
  const [winnerId, setWinnerId] = useState(match.player1Id);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stale = revision !== match.revision;
  const changedReason = admin && (match.status === "final" || match.status === "disputed" || kind !== "played");
  const scores = { raw1: Number(values.raw1), raw2: Number(values.raw2), overtime1: Number(values.overtime1 || 0), overtime2: Number(values.overtime2 || 0) };
  const validScores = values.raw1 !== "" && values.raw2 !== "" && [scores.raw1, scores.raw2].every(value => Number.isInteger(value) && value >= -100000 && value <= 100000) && [scores.overtime1, scores.overtime2].every(value => Number.isInteger(value) && value >= 0 && value <= 86400);
  const preview = validScores && kind === "played" ? calculateScore(scores, snapshot.tournament.config) : null;
  const players = [snapshot.entrants.find(entrant => entrant.id === match.player1Id), snapshot.entrants.find(entrant => entrant.id === match.player2Id)];
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await command(admin ? "finalize_result" : "submit_report", { matchId: match.id, expectedRevision: revision, ...(admin ? { kind, reason, ...(kind === "forfeit" ? { winnerId } : {}) } : {}), ...(kind === "played" ? scores : {}) }); close(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <form className="score-entry" onSubmit={submit}>
    {stale && <div className="notice">This result changed while you were editing. Review the latest scores before submitting.<div style={{ marginTop: 10 }}><button type="button" className="secondary" onClick={() => { setValues(initialScores(match)); setRevision(match.revision); setError(null); }}>Load latest result</button></div></div>}
    {admin && <div style={{ marginBottom: 18 }}><Field id={`outcome-${match.id}`} label="Result type"><select id={`outcome-${match.id}`} value={kind} onChange={event => setKind(event.target.value)}><option value="played">Played match</option><option value="forfeit">Forfeit</option><option value="double_forfeit">Double forfeit</option></select></Field></div>}
    {kind === "played" && <>{players.map((entrant, index) => {
      const side = index + 1;
      const rawKey = `raw${side}` as "raw1" | "raw2";
      const overtimeKey = `overtime${side}` as "overtime1" | "overtime2";
      const penalty = preview ? Number(values[rawKey]) - (side === 1 ? preview.adjusted1! : preview.adjusted2!) : 0;
      return <fieldset key={side}><legend>{entrant?.name ?? "Player"}</legend><div className="form-grid"><Field id={`score-${side}-${match.id}`} label="Score"><input id={`score-${side}-${match.id}`} type="number" inputMode="numeric" min={-100000} max={100000} step={1} required value={values[rawKey]} onChange={event => setValues({ ...values, [rawKey]: event.target.value })} /></Field><Field id={`overtime-${side}-${match.id}`} label="Overtime (seconds)"><input id={`overtime-${side}-${match.id}`} type="number" inputMode="numeric" min={0} max={86400} step={1} placeholder="0" value={values[overtimeKey]} onChange={event => setValues({ ...values, [overtimeKey]: event.target.value })} /></Field></div>{preview && penalty > 0 && <p className="score-preview">−{penalty} points · Final score <strong>{side === 1 ? preview.adjusted1 : preview.adjusted2}</strong></p>}</fieldset>;
    })}{preview && <p className="score-preview" aria-live="polite">Final result: <strong>{preview.adjusted1}–{preview.adjusted2}</strong>{preview.adjusted1 === preview.adjusted2 ? " · Draw" : ` · ${players[preview.adjusted1! > preview.adjusted2! ? 0 : 1]?.name} wins`}</p>}</>}
    {kind === "forfeit" && <Field id={`winner-${match.id}`} label="Winner"><select id={`winner-${match.id}`} value={winnerId} onChange={event => setWinnerId(event.target.value)}>{players.map(entrant => entrant && <option value={entrant.id} key={entrant.id}>{entrant.name}</option>)}</select></Field>}
    {kind !== "played" && <p className="form-note">{kind === "forfeit" ? "Winner receives 1 match point. No score difference." : "Both players receive 0 match points. No score difference."}</p>}
    {changedReason && <div style={{ marginTop: 18 }}><Field id={`correction-${match.id}`} label="Reason"><input id={`correction-${match.id}`} required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field>{match.status === "final" && <p className="form-note">Standings will update. Already published opponents stay the same.</p>}</div>}
    <ErrorNotice message={error} />
    <div className="actions"><button disabled={busy || stale || (kind === "played" && !validScores)}>{busy ? "Saving…" : admin ? "Save result" : "Submit result"}</button><button type="button" className="secondary" onClick={close} disabled={busy}>Cancel</button></div>
  </form>;
}

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api<AuthState>("/api/auth").then(setAuth).catch(cause => setError(errorMessage(cause))); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await api("/api/auth", "POST", { email, password }); setPassword(""); router.push("/admin"); router.refresh(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="narrow"><h1>Organizer sign in</h1><ErrorNotice message={error} />{auth && !auth.configured && <div className="notice">Organizer sign in has not been configured.</div>}{auth?.isOrganizer ? <><p className="muted">Signed in{auth.email ? ` as ${auth.email}` : ""}.</p><Link className="button" href="/admin">Your tournaments</Link></> : <form className="form" onSubmit={submit}><Field id="email" label="Email"><input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></Field><Field id="password" label="Password"><input id="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></Field><button disabled={busy || auth?.configured === false}>{busy ? "Signing in…" : "Sign in"}</button></form>}</div>;
}

export function JoinPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fragmentRead = useRef(false);
  useEffect(() => {
    if (fragmentRead.current) return;
    fragmentRead.current = true;
    const fragment = window.location.hash.slice(1);
    const claimedToken = new URLSearchParams(fragment).get("token") ?? fragment;
    if (fragment) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    void Promise.resolve().then(() => { setToken(claimedToken || null); setLoaded(true); });
  }, []);
  async function claim() {
    if (!token) return;
    setBusy(true); setError(null);
    try { const result = await api<{ slug: string; entrantId: string }>("/api/join", "POST", { token }); setToken(null); router.replace(`/t/${result.slug}`); router.refresh(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="narrow"><h1>Join your tournament</h1><ErrorNotice message={error} />{!loaded ? <Loading /> : token ? <><p className="muted">Use your private player link to report and confirm results on this device.</p><button disabled={busy} onClick={() => void claim()}>{busy ? "Joining…" : "Join tournament"}</button></> : <p className="muted">Open the private player link provided by your organizer.</p>}</div>;
}
