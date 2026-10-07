import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state=vi.hoisted(()=>({ available:false, executed:[] as string[] }));
vi.mock("postgres",()=>({default:()=>Object.assign(async(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.join("?");
  if(query.includes("current_user")) return [{role:"crossplay_runtime"}];
  if(query.includes("schema_version")) return [{version:"20260928010000"}];
  if(query.includes("lifecycle_version")) {
    if(!state.available) throw Object.assign(new Error("undefined function"),{code:"42883"});
    return [{version:"20261008010000"}];
  }
  if(query.includes("read_model")) return [{data:{tournaments:[]}}];
  if(query.includes("crossplay.execute")) {state.executed.push(values[1] as string);return [{data:{ok:true}}];}
  throw Error("Unexpected query");
},{json:(value:unknown)=>value})}));
beforeEach(()=>{vi.resetModules();state.available=false;state.executed=[];vi.stubEnv("CROSSPLAY_DATABASE_URL","postgresql://crossplay_runtime:local@127.0.0.1:55432/local_test");vi.stubEnv("CROSSPLAY_DATABASE_SSL","false");});
afterEach(()=>vi.unstubAllEnvs());

it("keeps ordinary reads/writes available before the additive capability and gates lifecycle writes",async()=>{
  const db=await import("../../src/server/db/client");
  expect(await db.listTournaments({})).toEqual({tournaments:[]});
  expect(await db.execute({},"update_settings",{},"11111111-1111-4111-a111-111111111111",1)).toEqual({ok:true});
  for(const action of ["archive_tournament","restore_tournament","reset_tournament","delete_tournament"]) await expect(db.execute({},action,{},"11111111-1111-4111-a111-111111111111",1)).rejects.toMatchObject({status:503});
  expect(state.executed).toEqual(["update_settings"]);
  state.available=true;
  expect(await db.execute({},"archive_tournament",{},"11111111-1111-4111-a111-111111111111",1)).toEqual({ok:true});
});
