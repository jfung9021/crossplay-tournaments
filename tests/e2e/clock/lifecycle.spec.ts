import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { baseURL, command, createSimpleTournament, login, openMatchFromCard, origin, publishNext, snapshot, writeEvidence } from "../../support/swiss20-browser";

test("LIFECYCLE: remote reset clears forms and clocks; retries and late responses cannot revive play", async ({page,context})=>{
  await login(page);
  const name="Lifecycle recovery";
  const id=await createSimpleTournament(page,name,"Alex Rowan\nMorgan Vale",1);
  const active=await publishNext(page,id,1); const match=active.rounds[0].matches[0];
  const timer=await context.newPage(); await openMatchFromCard(timer,id,match.id);
  await timer.getByRole("button",{name:"Start Timer",exact:true}).click();
  await page.goto(`/admin/tournaments/${id}`);
  await page.getByText("Organizer actions",{exact:true}).click();
  await page.getByRole("button",{name:"Enter result",exact:true}).click();
  await page.getByLabel("Score",{exact:true}).first().fill("401");
  // Hold an actual old snapshot while another organizer resets the tournament.
  let release!:()=>void; let started!:()=>void; let completed!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}); const requested=new Promise<void>(resolve=>{started=resolve;});
  const fulfilled=new Promise<void>(resolve=>{completed=resolve;});
  let captured=false;
  await page.route(`**/api/tournaments/${id}`,async route=>{
    if(captured){await route.continue();return;} captured=true;
    const response=await route.fetch(); started(); await held; await route.fulfill({response}); completed();
  });
  await page.evaluate(()=>window.dispatchEvent(new Event("focus"))); await requested;
  const before=await snapshot(page.request,id);
  const body={command:"reset_tournament",payload:{confirmationName:name},requestId:randomUUID(),expectedVersion:before.tournament.version};
  const reset=await page.request.post(`${baseURL}/api/tournaments/${id}/commands`,{headers:{Origin:origin},data:body}); expect(reset.status()).toBe(200);
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Draft",{exact:true})).toBeVisible();
  await expect(page.getByLabel("Score",{exact:true})).toHaveCount(0);
  release(); await fulfilled; await page.unroute(`**/api/tournaments/${id}`);
  await expect(page.getByText("Draft",{exact:true})).toBeVisible();
  await timer.evaluate(()=>window.dispatchEvent(new Event("online")));
  await expect(timer.getByRole("heading",{name:"Match unavailable",exact:true})).toBeVisible();
  expect(await timer.evaluate(matchId=>Object.keys(localStorage).filter(key=>key.includes(matchId)),match.id)).toHaveLength(0);
  const resetState=await snapshot(page.request,id); expect(resetState.entrants).toEqual(active.entrants); expect(resetState.tournament.config).toEqual(active.tournament.config);
  expect(resetState.standings.every(row=>row.played===0&&row.matchPoints===0&&row.difference===0)).toBe(true);
  expect((await command(page.request,id,"update_entrant",{entrantId:resetState.entrants[0].id,name:"Alex edited"})).status()).toBe(200);
  const fresh=await publishNext(page,id,1);
  const retry=await page.request.post(`${baseURL}/api/tournaments/${id}/commands`,{headers:{Origin:origin},data:body}); expect(retry.status()).toBe(200);
  expect((await snapshot(page.request,id)).rounds[0].id).toBe(fresh.rounds[0].id);
  const denied=await command(page.request,id,"delete_tournament",{confirmationName:"Wrong name"}); expect(denied.status()).toBe(400);
  const deletion=await command(page.request,id,"delete_tournament",{confirmationName:name}); expect(deletion.status()).toBe(200);
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".notice[role=alert]")).toContainText("not found");
  await expect(page.locator(".match")).toHaveCount(0);
  expect((await timer.request.get(`${baseURL}/api/matches/${match.id}/clock`)).status()).toBe(404);
  writeEvidence("lifecycle/recovery.json",{status:"PASS",reset:resetState.tournament,lateReadIgnored:true,lateResetRetryPreservedRound:true,oldClockUnavailable:true,deleted:true});
});

test("LIFECYCLE: archive and restore draft and live play without claiming completion",async({page,browser})=>{
  await login(page);
  const id=await createSimpleTournament(page,"Archive lifecycle","Alex Rowan\nMorgan Vale",1);
  expect((await command(page.request,id,"archive_tournament")).status()).toBe(200);
  const publicContext=await browser.newContext({baseURL});
  try {
    expect((await publicContext.request.get(`${baseURL}/api/tournaments/${id}`)).status()).toBe(404);
    expect((await command(page.request,id,"restore_tournament")).status()).toBe(200);
    const active=await publishNext(page,id,1); const match=active.rounds[0].matches[0];
    const clock=await page.context().newPage(); await openMatchFromCard(clock,id,match.id);
    await clock.getByRole("button",{name:"Start Timer",exact:true}).click();
    expect((await command(page.request,id,"archive_tournament")).status()).toBe(200);
    await clock.evaluate(()=>window.dispatchEvent(new Event("online")));
    await expect(clock.getByRole("heading",{name:"Match unavailable",exact:true})).toBeVisible();
    await page.goto(`/t/${id}`);
    await expect(page.getByRole("heading",{name:"Standings at archive",exact:true})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Final standings",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Start Match",exact:true})).toHaveCount(0);
    const publicList=await (await publicContext.request.get(`${baseURL}/api/tournaments`)).json(); expect(publicList.tournaments.some((t:{id:string})=>t.id===id)).toBe(false);
    expect((await command(page.request,id,"restore_tournament")).status()).toBe(200);
    await page.reload(); await expect(page.getByRole("button",{name:"Review time",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Review time",exact:true}).click();
    await page.getByLabel("Reason",{exact:true}).fill("Review archived saved time before resuming.");
    await page.getByRole("button",{name:"Save record",exact:true}).click();
    await expect(page.getByRole("status")).toContainText("Saved");
    expect((await command(page.request,id,"reset_tournament",{confirmationName:"Archive lifecycle"})).status()).toBe(200);
    await page.goto(`/admin/tournaments/${id}/settings`); await expect(page.getByLabel("Rounds",{exact:true})).toBeEnabled();
    writeEvidence("lifecycle/archive.json",{status:"PASS",draftPrivate:true,activeReadOnly:true,restoreRequiresReview:true});
  } finally {await publicContext.close();}
});
