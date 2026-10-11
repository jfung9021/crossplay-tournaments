"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import type { DisplayMatch, TournamentDisplay } from "@/domain/display";
import type { Standing } from "@/domain/types";
import { useTournamentDisplay } from "@/client/use-tournament-display";
import { paginateRows, tableGrid } from "@/client/display-pagination";
import { DisplayClockStore, emptyClockView } from "@/client/display-clock-store";
import styles from "./tournament-display.module.css";

const statuses: Record<DisplayMatch["status"], string> = { ready: "Ready", playing: "Playing", paused: "Paused", reporting: "Reporting", awaiting_confirmation: "Awaiting confirmation", organizer_review: "Organizer review", final: "Final", outstanding: "Result outstanding", queued: "Later this round" };
const signed = (value: number) => value > 0 ? `+${value}` : String(value);
const noMatches: DisplayMatch[] = [];

function usePage(count: number, resetKey: string) {
  const [selection, setSelection] = useState({ key: resetKey, index: 0 });
  const [paused, setPaused] = useState(false);
  const index = selection.key === resetKey ? selection.index % count : 0;
  const move = useCallback((direction: number) => setSelection(previous => ({ key: resetKey, index: ((previous.key === resetKey ? previous.index : 0) + direction + count) % count })), [count, resetKey]);
  useEffect(() => {
    if (count <= 1 || paused) return;
    const timer = setInterval(() => move(1), 15_000);
    return () => clearInterval(timer);
  }, [count, paused, move]);
  return { index, paused, move, toggle: () => setPaused(value => !value) };
}

function PageControls({ label, count, page }: { label: string; count: number; page: ReturnType<typeof usePage> }) {
  if (count < 2) return null;
  return <nav aria-label={`${label} pages`} className={styles.pageControls}>
    <button aria-label={`Previous ${label.toLowerCase()} page`} onClick={() => page.move(-1)}>←</button>
    <span>{page.index + 1} / {count}</span>
    <button aria-label={`${page.paused ? "Resume" : "Pause"} ${label.toLowerCase()} rotation`} onClick={page.toggle}>{page.paused ? "Resume" : "Pause"}</button>
    <button aria-label={`Next ${label.toLowerCase()} page`} onClick={() => page.move(1)}>→</button>
  </nav>;
}

function ClockNumber({ store, matchId, side }: { store: DisplayClockStore; matchId: string; side: number }) {
  const view = useSyncExternalStore(store.subscribe, () => store.get(matchId), () => emptyClockView);
  return <strong className={styles.score} data-display-clock={side} aria-label={view.values[side - 1]}><span className={styles.runningMark} aria-label={view.activeSide === side ? "Running" : undefined}>{view.activeSide === side ? "▶" : ""}</span>{view.values[side - 1]}</strong>;
}
function ClockLabel({ store, matchId, fallback }: { store: DisplayClockStore; matchId: string; fallback: string }) {
  const view = useSyncExternalStore(store.subscribe, () => store.get(matchId), () => emptyClockView);
  return <>{view.label || fallback}</>;
}
function MatchTile({ match, archived, inactiveIds, clockStore, measured = false }: { match: DisplayMatch; archived: boolean; inactiveIds: Set<string>; clockStore: DisplayClockStore; measured?: boolean }) {
  const Element = measured ? "div" : "article";
  const result = match.status === "final" ? match.result : null;
  const provisional = match.status === "awaiting_confirmation" ? match.provisional : null;
  const clockVisible = !archived && ["ready", "playing", "paused", "reporting"].includes(match.status);
  const draw = result && result.points1 === result.points2 && match.kind === "played";
  const status = archived && match.status !== "final" ? "Not finalized" : statuses[match.status];
  const players = [match.player1, match.player2];
  return <Element className={`${styles.match} ${result ? styles.complete : provisional ? styles.pending : ""}`} aria-label={measured ? undefined : `Table ${match.tableNumber ?? "unassigned"}`} data-display-match={measured ? undefined : match.id}>
    <div className={styles.matchHeading}><h2>Table {match.tableNumber ?? "—"}</h2><span className={`${styles.matchStatus} ${match.status === "organizer_review" ? styles.review : ""}`}>{draw ? "Final · Draw" : clockVisible && !measured ? <ClockLabel store={clockStore} matchId={match.id} fallback={status} /> : status}</span></div>
    {match.status === "queued" && <p className={styles.queue}>Later this round at Table {match.tableNumber}</p>}
    <div className={styles.players}>{players.map((player, index) => {
      if (!player) return null;
      const points = result ? index === 0 ? result.points1 : result.points2 : null;
      const otherPoints = result ? index === 0 ? result.points2 : result.points1 : null;
      const winner = points !== null && otherPoints !== null && points > otherPoints;
      const scores = result ?? provisional;
      const score = scores ? index === 0 ? scores.adjusted1 : scores.adjusted2 : null;
      return <div className={`${styles.player} ${winner ? styles.winner : ""}`} key={player.id}><span className={`${styles.playerName} ${inactiveIds.has(player.id) ? styles.withdrawn : ""}`}>{player.name}</span>{scores ? <strong className={styles.score}>{score ?? (winner ? "Win" : match.kind === "double_forfeit" ? "0" : "Loss")}{winner && score !== null && <span className={styles.win}>Win</span>}</strong> : clockVisible && !measured ? <ClockNumber store={clockStore} matchId={match.id} side={index + 1} /> : <strong className={styles.score}>—</strong>}</div>;
    })}</div>
    {(match.kind === "forfeit" || match.kind === "double_forfeit") && result && <p className={styles.queue}>{match.kind === "forfeit" ? "Forfeit" : "Double forfeit"}</p>}
  </Element>;
}

const Tables = memo(function Tables({ display, clockStore }: { display: TournamentDisplay; clockStore: DisplayClockStore }) {
  const grid = useRef<HTMLDivElement>(null);
  const measurement = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 3, rows: 3, capacity: 9 });
  const matches = display.round?.matches ?? noMatches;
  const inactiveIds = new Set(display.standings.filter(standing => !standing.active).map(standing => standing.entrantId));
  const archived = display.tournament.status === "archived";
  const count = Math.max(1, Math.ceil(matches.length / layout.capacity));
  const page = usePage(count, `${display.tournament.runGeneration}:${display.round?.number ?? 0}`);
  useEffect(() => {
    const area = grid.current; const sample = measurement.current;
    if (!area || !sample) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const base = tableGrid(area.clientWidth, area.clientHeight, 156, matches.length);
        sample.style.gridTemplateColumns = `repeat(${base.columns}, minmax(0, 1fr))`;
        let maxHeight = Math.max(156, ...Array.from(sample.children, child => child.getBoundingClientRect().height));
        // Extremely long names need wider cards before even a single row can fit.
        while (maxHeight > area.clientHeight && base.columns > 1) {
          base.columns--;
          sample.style.gridTemplateColumns = `repeat(${base.columns}, minmax(0, 1fr))`;
          maxHeight = Math.max(156, ...Array.from(sample.children, child => child.getBoundingClientRect().height));
        }
        const sized = tableGrid(area.clientWidth, area.clientHeight, maxHeight, matches.length);
        const next = { columns: base.columns, rows: sized.rows, capacity: base.columns * sized.rows };
        setLayout(previous => previous.columns === next.columns && previous.rows === next.rows ? previous : next);
      });
    };
    const observer = new ResizeObserver(measure); observer.observe(area); observer.observe(sample);
    measure(); void document.fonts.ready.then(measure);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [matches, archived]);
  return <section className={styles.tablesRegion} aria-label="Current matches">
    {!!display.round?.byes.length && <aside aria-label="Byes" className={styles.byes}>{display.round.byes.map(bye => <span key={bye.id}><strong>Bye</strong> · <span className={inactiveIds.has(bye.player1.id) ? styles.withdrawn : undefined}>{bye.player1.name}</span> · {bye.result ? `${bye.result.points1 / 2} point` : "Published"}</span>)}</aside>}
    <div ref={grid} className={styles.tableArea}>
      <div className={styles.matchGrid} style={{ "--columns": layout.columns, "--rows": layout.rows } as CSSProperties}>{matches.slice(page.index * layout.capacity, (page.index + 1) * layout.capacity).map(match => <MatchTile key={match.id} match={match} archived={archived} inactiveIds={inactiveIds} clockStore={clockStore} />)}</div>
      <div ref={measurement} aria-hidden="true" className={styles.matchMeasurement}>{matches.map(match => <MatchTile key={match.id} match={match} archived={archived} inactiveIds={inactiveIds} clockStore={clockStore} measured />)}</div>
      {!matches.length && <div className={styles.waiting}><h2>{display.round ? "No table matches this round" : "Waiting for published pairings"}</h2><p>Pairings appear when the organizer publishes the round.</p></div>}
    </div>
    <PageControls label="Tables" count={count} page={page} />
  </section>;
});

function StandingsTable({ standings, indices, rowHeights, measured = false }: { standings: Standing[]; indices?: number[]; rowHeights?: number[]; measured?: boolean }) {
  const rows = indices ? indices.map(index => standings[index]) : standings;
  if (measured) return <>{rows.map(standing => <div className={styles.standingMeasureRow} key={standing.entrantId}><span>{standing.rank}</span><span className={!standing.active ? styles.withdrawn : undefined}>{standing.name}</span><span>{standing.matchPoints}</span><span>{signed(standing.difference)}</span></div>)}</>;
  return <table className={styles.standingsTable} aria-label={measured ? undefined : "Tournament standings"}>
    <colgroup><col className={styles.rankColumn} /><col /><col className={styles.pointsColumn} /><col className={styles.differenceColumn} /></colgroup>
    <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col" className={styles.number}>Pts</th><th scope="col" className={styles.number}>+/−</th></tr></thead>
    <tbody>{rows.map((standing, index) => <tr key={standing.entrantId} style={rowHeights ? { height: rowHeights[index] } : undefined}><td className={styles.rank}>{standing.rank}</td><td className={`${styles.standingName} ${!standing.active ? styles.withdrawn : ""}`}>{standing.name}</td><td className={styles.number}>{standing.matchPoints}</td><td className={styles.number}>{signed(standing.difference)}</td></tr>)}</tbody>
  </table>;
}

const Standings = memo(function Standings({ display, final }: { display: TournamentDisplay; final: boolean }) {
  const area = useRef<HTMLDivElement>(null);
  const measurement = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>([display.standings.map((_, index) => index)]);
  const [metrics, setMetrics] = useState({ heights: [] as number[], available: 0 });
  const count = Math.max(1, pages.length);
  const page = usePage(count, `${display.tournament.runGeneration}:${final}`);
  useEffect(() => {
    const body = area.current; const sample = measurement.current;
    if (!body || !sample) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const heights = Array.from(sample.children, row => row.getBoundingClientRect().height);
        const headerHeight = body.querySelector("thead")?.getBoundingClientRect().height ?? 40;
        let available = Math.max(1, body.clientHeight - headerHeight - 1);
        const controls = body.parentElement?.querySelector("nav");
        const controlHeight = controls ? controls.getBoundingClientRect().height + parseFloat(getComputedStyle(controls).marginTop) + parseFloat(getComputedStyle(controls).marginBottom) : 0;
        // Existing pagination must not prevent a shorter roster from returning to one page.
        const withoutControls = paginateRows(heights, available + controlHeight);
        const next = withoutControls.length === 1 ? withoutControls : paginateRows(heights, available);
        if (withoutControls.length === 1) available += controlHeight;
        setMetrics(previous => previous.available === available && JSON.stringify(previous.heights) === JSON.stringify(heights) ? previous : { heights, available });
        setPages(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      });
    };
    const observer = new ResizeObserver(measure); observer.observe(body); observer.observe(sample);
    measure(); void document.fonts.ready.then(measure);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [display.standings, final]);
  const safeRows = (pages[page.index] ?? []).filter(index => index < display.standings.length);
  const extra = Math.max(0, metrics.available - safeRows.reduce((sum, index) => sum + (metrics.heights[index] ?? 0), 0)) / Math.max(1, safeRows.length);
  const rowHeights = metrics.heights.length ? safeRows.map(index => (metrics.heights[index] ?? 0) + extra) : undefined;
  return <section className={`${styles.standingsRegion} ${final ? styles.finalRegion : ""}`} aria-label={final ? "Final standings" : "Standings"}>
    <div className={styles.regionHeading}><h2>{final ? "Final standings" : display.tournament.status === "archived" ? "Recorded standings" : "Standings"}</h2><p>Points · adjusted score difference</p></div>
    <div className={styles.standingsBody} ref={area}><StandingsTable standings={display.standings} indices={safeRows} rowHeights={rowHeights} /><div ref={measurement} className={styles.standingMeasurement} aria-hidden="true"><StandingsTable standings={display.standings} measured /></div></div>
    <PageControls label="Standings" count={count} page={page} />
  </section>;
});

function phase(display: TournamentDisplay) {
  if (display.tournament.status === "archived") return "Archived · recorded results";
  if (display.tournament.status === "finished") return "Tournament complete";
  if (display.round && display.round.finalMatches === display.round.totalMatches) return "Round complete · waiting for the next round to be published";
  return display.round ? `${display.round.finalMatches} of ${display.round.totalMatches} results final` : "Waiting for published pairings";
}

function LatestResult({ match }: { match: DisplayMatch | null }) {
  if (!match?.result) return <p className={styles.latest}>Find your table. Play, report, and confirm together.</p>;
  const scores = match.result.adjusted1 !== null && match.result.adjusted2 !== null ? `${match.result.adjusted1}–${match.result.adjusted2}` : match.kind === "double_forfeit" ? "Double forfeit" : match.kind === "bye" ? "Bye recorded" : "Forfeit recorded";
  return <p className={styles.latest}><strong>Latest confirmed</strong> · Round {match.roundNumber}{match.tableNumber !== null ? ` · Table ${match.tableNumber}` : ""} · {scores}</p>;
}

function DisplayFeed({ slug }: { slug: string }) {
  const feed = useTournamentDisplay(slug);
  const [origin, setOrigin] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [mobileRegion, setMobileRegion] = useState("tables");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOrigin(window.location.origin));
    const reveal = () => {
      setControlsVisible(true); clearTimeout(hideTimer.current);
      if (document.fullscreenElement) hideTimer.current = setTimeout(() => setControlsVisible(false), 4_000);
    };
    const changed = () => { setFullscreen(!!document.fullscreenElement); reveal(); };
    document.addEventListener("fullscreenchange", changed); document.addEventListener("pointermove", reveal); document.addEventListener("keydown", reveal);
    return () => { cancelAnimationFrame(frame); clearTimeout(hideTimer.current); document.removeEventListener("fullscreenchange", changed); document.removeEventListener("pointermove", reveal); document.removeEventListener("keydown", reveal); };
  }, []);
  async function toggleFullscreen() {
    setFullscreenError(null);
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setFullscreenError("Fullscreen is unavailable. The display still works in this window."); }
  }
  const display = feed.data;
  const final = display?.tournament.status === "finished";
  const publicUrl = `${origin}/t/${encodeURIComponent(display?.tournament.slug ?? slug)}?browse=1#standings`;
  return <div data-tournament-display className={styles.shell}>
    <div className={`${styles.fullscreenControls} ${controlsVisible ? "" : styles.hiddenControls}`}><button onClick={() => void toggleFullscreen()}>{fullscreen ? "Exit fullscreen" : "Enter fullscreen"}</button></div>
    {fullscreenError && <p role="status" className={styles.fullscreenError}>{fullscreenError}</p>}
    {!display ? <main className={styles.unavailable}><span className={styles.brandTile}>C</span><h1>{feed.unavailable ? "Tournament not yet available" : feed.error ? "Cannot connect to the tournament" : "Opening tournament display…"}</h1><p>{feed.unavailable ? "Published pairings will appear here when the tournament is available." : feed.error ? "Check the connection. This screen will keep trying." : "Loading published pairings and official results."}</p><button className="secondary" onClick={feed.retry}>Retry now</button><Link href="/">Tournaments</Link></main> : <>
      <header className={styles.header}><div className={styles.eventTitle}><span className={styles.brandTile} aria-hidden="true">C</span><h1 className={display.tournament.name.length > 90 ? styles.longEventName : display.tournament.name.length > 50 ? styles.mediumEventName : undefined}>{display.tournament.name}</h1></div><div className={styles.roundHeading}><strong>{display.tournament.status === "archived" ? "Archived" : final ? "Final results" : `Round ${display.round?.number ?? display.tournament.currentRound}${display.tournament.roundCount ? ` of ${display.tournament.roundCount}` : ""}`}</strong><p>{phase(display)}</p></div></header>
      <main className={`${styles.main} ${final ? styles.finalMain : ""} ${mobileRegion === "standings" ? styles.showStandings : styles.showTables}`} key={`${display.tournament.id}:${display.tournament.runGeneration}`}>
        {!final && <div className={styles.regionTabs} aria-label="Display view"><button aria-pressed={mobileRegion === "tables"} onClick={() => setMobileRegion("tables")}>Tables</button><button aria-pressed={mobileRegion === "standings"} onClick={() => setMobileRegion("standings")}>Standings</button></div>}
        {!final && <Tables display={display} clockStore={feed.clocks} />}
        <Standings display={display} final={!!final} />
      </main>
      <footer className={styles.footer}><div className={styles.footerResult}><LatestResult match={display.latestResult} /><p className={styles.statusLegend}>{display.liveTimingAvailable ? "Pending scores await confirmation. Stale clocks are frozen." : display.clockStatusAvailable ? "Match statuses show the last saved state." : "Table status reflects recorded results."}</p></div><div className={`${styles.connection} ${feed.stale || feed.error ? styles.connectionLost : ""}`} role="status"><strong>{feed.stale ? "Connection lost" : feed.error ? "Reconnecting" : "TV connected"}</strong><span>{feed.ageSeconds === null ? "Waiting for an update" : `${feed.stale || feed.error ? "Last updated" : "Updated"} ${feed.ageSeconds}s ago`}</span>{(feed.stale || feed.error) && <button onClick={feed.retry}>Retry now</button>}</div><Link className={styles.qr} href={publicUrl} aria-label="Open public standings">{origin && <QRCodeSVG value={publicUrl} size={96} marginSize={4} level="M" title="Public tournament standings" />}<span>Live<br />standings</span></Link></footer>
    </>}
  </div>;
}

export function TournamentDisplayPage({ slug }: { slug: string }) {
  return <DisplayFeed key={slug} slug={slug} />;
}
