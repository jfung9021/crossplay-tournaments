import { expect, test, type Page } from "@playwright/test";
import { baseURL, command, createSimpleTournament, evidencePath, login, openMatchFromCard, publishNext, snapshot, writeEvidence } from "../../support/swiss20-browser";
import type { MatchClockSnapshot } from "../../../src/client/match-clock-api";

async function geometry(page: Page, label: string, project: string) {
  const result = await page.evaluate(() => {
    const visible = (el: Element) => !!(el as HTMLElement).offsetWidth && !!(el as HTMLElement).offsetHeight && getComputedStyle(el).visibility !== "hidden";
    const bounds = [...document.querySelectorAll("input:not([type=checkbox]),select,textarea,button,summary,.tabs a,.back,.match-player,.player-name,.rules-list dd")].filter(visible).map(el => {
      const r=el.getBoundingClientRect(); return { text: el.getAttribute("aria-label") ?? el.textContent?.slice(0,45), tag: el.tagName, x:r.x, right:r.right, width:r.width, height:r.height, font:parseFloat(getComputedStyle(el).fontSize) };
    });
    return { width:innerWidth, documentWidth:document.documentElement.scrollWidth, touch:navigator.maxTouchPoints, trustedTouch:document.documentElement.dataset.trustedTouch, bounds };
  });
  expect(result.documentWidth, label).toBeLessThanOrEqual(result.width+1);
  for(const control of result.bounds) {
    expect(control.x, `${label}: ${control.text}`).toBeGreaterThanOrEqual(-1);
    expect(control.right, `${label}: ${control.text}`).toBeLessThanOrEqual(result.width+1);
    if(["BUTTON","INPUT","SELECT","TEXTAREA","SUMMARY"].includes(control.tag)) {
      expect(control.height, `${label}: ${control.text}`).toBeGreaterThanOrEqual(44);
      expect(control.width, `${label}: ${control.text}`).toBeGreaterThanOrEqual(44);
    }
    if(["INPUT","SELECT","TEXTAREA"].includes(control.tag)) expect(control.font).toBeGreaterThanOrEqual(16);
  }
  await page.screenshot({path:evidencePath("portrait",project,`${label}.png`),fullPage:true});
  return result;
}

async function lifecycle(page: Page, id: string, action: string, name?: string) {
  await page.goto(`/admin/tournaments/${id}/settings`);
  await page.locator("#tournament-actions > summary").tap();
  await page.getByRole("button",{name:action,exact:true}).tap();
  if(name) await page.getByLabel("Type the tournament name to confirm").fill(name);
  await page.getByRole("button",{name:action,exact:true}).tap();
}

test("TIMER: fitted digits and durable current-turn duration", async ({page},info) => {
  await login(page);
  const id=await createSimpleTournament(page,`Turn timer ${info.project.name}`,"Alex Rowan\nMorgan Vale",1);
  const current=await publishNext(page,id,1); const match=current.rounds[0].matches[0];
  const time=new Date(); await page.clock.install({time}); await page.clock.pauseAt(new Date(time.getTime()+1000));
  await openMatchFromCard(page,id,match.id);
  const read=async()=>await (await page.request.get(`${baseURL}/api/matches/${match.id}/clock`)).json() as MatchClockSnapshot;
  const ready=await read(); const side=ready.state!.activeSide;
  const turn=(player: number)=>page.locator(`[data-side="${player}"] [data-turn-seconds]`);
  const checkFit=async(label: string)=>{
    await geometry(page,label,info.project.name);
    for(const digits of await page.locator("[data-clock-time]").all()) {
      const box=await digits.evaluate(el=>{
        const text=el.getBoundingClientRect(), slot=el.parentElement!.getBoundingClientRect();
        return {width:text.width,height:text.height,slotWidth:slot.width,slotHeight:slot.height,font:parseFloat(getComputedStyle(el).fontSize)};
      });
      expect(box.width).toBeLessThanOrEqual(box.slotWidth+1);
      expect(box.height).toBeLessThanOrEqual(box.slotHeight+1);
      expect(Math.max(box.width/box.slotWidth,box.height/box.slotHeight)).toBeGreaterThan(.95);
      if(label==="timer-ready") expect(box.font).toBeGreaterThan(page.viewportSize()!.width*.24);
    }
  };
  await checkFit("timer-ready");
  await page.getByRole("button",{name:"Start Timer",exact:true}).tap();
  await expect.poll(async()=>(await read()).state?.status).toBe("running");
  await page.clock.fastForward(12_500);
  await expect(turn(side)).toHaveText("This turn 0:12");
  await page.getByRole("button",{name:"Pause",exact:true}).tap();
  await expect.poll(async()=>(await read()).state?.currentTurnMs).toBe(12_500);
  await page.clock.fastForward(60_000);
  await expect(turn(side)).toHaveText("This turn 0:12");
  await page.reload();
  await expect(page.getByRole("button",{name:"Resume",exact:true})).toBeEnabled();
  await expect(turn(side)).toHaveText("This turn 0:12");
  await page.context().setOffline(true);
  await page.getByRole("button",{name:"Resume",exact:true}).tap();
  await page.clock.fastForward(3500);
  await expect(turn(side)).toHaveText("This turn 0:16");
  await page.locator(`[data-side="${side}"]`).tap();
  await expect(turn(side)).toHaveText("This turn 0:00");
  await page.clock.fastForward(1_220_000);
  await expect(turn(3-side)).toHaveText("This turn 20:20");
  await page.getByRole("button",{name:"Pause",exact:true}).tap();
  await checkFit("timer-overtime");
  await expect(page.locator(`[data-side="${3-side}"] [data-clock-time]`)).toHaveText("+0:20");
  await page.context().setOffline(false);
  await expect.poll(async()=>(await read()).state?.currentTurnMs).toBe(1_220_000);
  await page.reload();
  await expect(turn(3-side)).toHaveText("This turn 20:20");
});

test("PORTRAIT: touch setup, match, scores and lifecycle on phone and tablet", async ({page,browser},info) => {
  await login(page);
  const name=`Portrait ${info.project.name}`;
  const id=await createSimpleTournament(page,name,"Alex Rowan\nMorgan Vale",1);
  await page.goto(`/admin/tournaments/${id}/players`);
  expect(await page.locator(".add-players").evaluate(el=>el.compareDocumentPosition(document.querySelector(".roster-row")!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await page.getByRole("button",{name:"Rename",exact:true}).first().tap();
  await geometry(page,"rename",info.project.name);
  await page.getByRole("button",{name:"Cancel",exact:true}).tap();
  await page.goto(`/admin/tournaments/${id}/settings`);
  await geometry(page,"settings",info.project.name);
  if(info.project.name.endsWith("tablet")) expect(await page.locator(".settings-layout").evaluate(el=>el.children[1].getBoundingClientRect().top>=el.children[0].getBoundingClientRect().bottom)).toBe(true);
  const current=await publishNext(page,id,1); const match=current.rounds[0].matches[0];
  await page.goto(`/t/${id}`);
  await page.getByLabel("Table",{exact:true}).selectOption(String(match.tableNumber));
  await expect(page.getByRole("button",{name:"Start Match",exact:true})).toBeEnabled();
  await page.evaluate(()=>document.addEventListener("touchstart",event=>{document.documentElement.dataset.trustedTouch=String(event.isTrusted);},{once:true}));
  await page.getByRole("heading",{name:"Round 1",exact:true}).tap();
  const selected=await geometry(page,"selected-table",info.project.name);
  expect(selected.trustedTouch).toBe("true");
  if(info.project.name.endsWith("phone")) {
    const box=await page.getByRole("button",{name:"Start Match",exact:true}).boundingBox();
    expect(box!.y+box!.height).toBeLessThanOrEqual(844);
  }
  const time=new Date(); await page.clock.install({time}); await page.clock.pauseAt(new Date(time.getTime()+1000));
  await openMatchFromCard(page,id,match.id);
  const ready=await (await page.request.get(`${baseURL}/api/matches/${match.id}/clock`)).json() as MatchClockSnapshot;
  await geometry(page,"ready",info.project.name);
  await page.getByRole("button",{name:"Flip sides",exact:true}).tap();
  await page.getByRole("button",{name:"Start Timer",exact:true}).tap();
  await expect.poll(async()=>((await (await page.request.get(`${baseURL}/api/matches/${match.id}/clock`)).json()) as MatchClockSnapshot).state?.status).toBe("running");
  await geometry(page,"running",info.project.name);
  const used=[1220000,1190000];
  await page.clock.fastForward(used[ready.start!.side-1]);
  await page.locator(`[data-side="${ready.start!.side}"]`).tap();
  await page.clock.fastForward(used[2-ready.start!.side]);
  await page.getByRole("button",{name:"Pause",exact:true}).tap();
  await geometry(page,"overtime-paused",info.project.name);
  await page.getByRole("button",{name:"Resume",exact:true}).tap();
  await page.getByRole("button",{name:"End game",exact:true}).tap();
  await page.getByLabel(`${ready.players[0].name} game score`,{exact:true}).fill("400");
  await page.getByLabel(`${ready.players[1].name} game score`,{exact:true}).fill("399");
  await page.getByRole("button",{name:"Review scores",exact:true}).tap();
  await page.getByRole("button",{name:`${ready.players[0].name}: agree`,exact:true}).tap();
  await page.getByRole("button",{name:"Edit scores",exact:true}).tap();
  await page.getByLabel(`${ready.players[0].name} game score`,{exact:true}).fill("401");
  await page.getByRole("button",{name:"Review scores",exact:true}).tap();
  await geometry(page,"score-review",info.project.name);
  for(const player of ready.players) await page.getByRole("button",{name:`${player.name}: agree`,exact:true}).tap();
  await expect(page.getByText("Match complete",{exact:true})).toBeVisible();
  const scored=await snapshot(page.request,id);
  expect(scored.rounds[0].matches[0].result).toMatchObject({adjusted1:397,adjusted2:399});
  expect((await command(page.request,id,"finish_tournament")).status()).toBe(200);
  await page.clock.resume();
  await page.goto(`/t/${id}`); await geometry(page,"standings",info.project.name);
  await lifecycle(page,id,"Archive tournament");
  await expect(page.getByText("Archived",{exact:true})).toBeVisible();
  await page.goto("/admin"); await page.getByLabel("Show archived").check();
  await expect(page.getByRole("link",{name,exact:true})).toBeVisible();
  await lifecycle(page,id,"Restore tournament"); await expect(page.getByText("Finished",{exact:true})).toBeVisible();
  await page.locator("#tournament-actions > summary").tap();
  await page.getByRole("button",{name:"Reset tournament",exact:true}).tap();
  await page.getByRole("button",{name:"Cancel",exact:true}).tap();
  expect((await snapshot(page.request,id)).rounds).toHaveLength(1);
  await page.getByRole("button",{name:"Reset tournament",exact:true}).tap();
  await page.getByLabel("Type the tournament name to confirm").fill(name);
  await geometry(page,"reset-confirmation",info.project.name);
  await page.getByRole("button",{name:"Reset tournament",exact:true}).tap();
  await expect(page).toHaveURL(/\/players$/);
  const reset=await snapshot(page.request,id); expect(reset.tournament.status).toBe("draft"); expect(reset.entrants).toHaveLength(2); expect(reset.rounds).toHaveLength(0);
  await lifecycle(page,id,"Delete permanently",name);
  await expect(page).toHaveURL(`${baseURL}/admin`);
  expect((await page.request.get(`${baseURL}/api/tournaments/${id}`)).status()).toBe(404);
  writeEvidence(`portrait/${info.project.name}/functional.json`,{status:"PASS",browser:browser.version(),project:info.project.use,selected,result:scored.rounds[0].matches[0].result,lifecycle:true});
});

test("PORTRAIT: layout boundaries, long names and large editable rosters",async({page},info)=>{
  test.skip(info.project.name!=="chromium-phone","One geometry matrix; touch workflows cover both engines.");
  await login(page);
  const long="W".repeat(80);
  const id=await createSimpleTournament(page,"Tournament "+"W".repeat(109),[long,"広い名前のプレイヤー",...Array.from({length:18},(_,i)=>`Player ${i+3}`)].join("\n"),5);
  await page.goto(`/admin/tournaments/${id}/players`);
  await expect(page.locator(".roster-row")).toHaveCount(20);
  const added=await command(page.request,id,"add_entrants",{names:Array.from({length:236},(_,i)=>`Player ${i+21}`).join("\n")}); expect(added.status()).toBe(200);
  await page.reload(); await expect(page.locator(".roster-row")).toHaveCount(256);
  await page.locator(".add-players > summary").tap();
  await page.getByLabel("Player names",{exact:true}).fill("Preserve this entry");
  await page.locator(".add-players > summary").tap(); await page.locator(".add-players > summary").tap();
  await expect(page.getByLabel("Player names",{exact:true})).toHaveValue("Preserve this entry");
  await geometry(page,"large-roster",info.project.name);
  for(const [width,height] of [[320,568],[375,667],[430,932],[507,768],[768,1024],[1024,1366],[844,390],[1180,820]]) {
    await page.setViewportSize({width,height});
    await page.goto(`/admin/tournaments/${id}/settings`); await geometry(page,`settings-${width}`,info.project.name);
    await page.goto(`/t/${id}/rules`); await geometry(page,`rules-${width}`,info.project.name);
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(`/admin/tournaments/${id}/settings`);
  await page.addStyleTag({content:"body {font-size:200%} input,select,button,label,summary,.tabs a {font-size:200%!important}"});
  await geometry(page,"enlarged-text",info.project.name);
});

test("PORTRAIT: long clock names and agreements remain readable",async({page},info)=>{
  test.skip(info.project.name!=="chromium-phone","One boundary geometry gate; normal touch match flow runs in all four profiles.");
  await login(page);
  const names=["W".repeat(80),"広".repeat(80)];
  const id=await createSimpleTournament(page,"Long names on shared clock",names.join("\n"),1);
  const current=await publishNext(page,id,1); const match=current.rounds[0].matches[0];
  await openMatchFromCard(page,id,match.id);
  for(const [width,height] of [[320,568],[390,844],[820,1180]]) {
    await page.setViewportSize({width,height});
    await geometry(page,`long-clock-${width}`,info.project.name);
    for(const panel of await page.locator("[data-side]").all()) {
      const bounds=await panel.evaluate(el=>{
        const outer=el.getBoundingClientRect();
        const inner=[...el.querySelectorAll("span")].filter(node=>node.getAttribute("aria-hidden") || node.childElementCount===0 && !node.classList.contains("sr-only")).map(node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom};});
        return {top:outer.top,bottom:outer.bottom,inner};
      });
      for(const content of bounds.inner){expect(content.top).toBeGreaterThanOrEqual(bounds.top);expect(content.bottom).toBeLessThanOrEqual(bounds.bottom);}
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("button",{name:"Start Timer",exact:true}).tap();
  await page.getByRole("button",{name:"End game",exact:true}).tap();
  for(const name of names) await page.getByLabel(`${name} game score`,{exact:true}).fill("400");
  await page.getByRole("button",{name:"Review scores",exact:true}).tap();
  await geometry(page,"long-agreements",info.project.name);
  for(const name of names) {await expect(page.getByRole("button",{name:`${name}: agree`,exact:true})).toBeVisible();await page.getByRole("button",{name:`${name}: agree`,exact:true}).tap();}
  await expect(page.getByText("Match complete",{exact:true})).toBeVisible();
  await page.goto(`/t/${id}`);await geometry(page,"long-standings",info.project.name);
  await page.getByRole("link",{name:names[0],exact:true}).first().tap();await geometry(page,"long-history",info.project.name);
});
