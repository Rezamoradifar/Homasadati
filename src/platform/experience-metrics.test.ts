// @vitest-environment node
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {platformDb,run,now} from "./schema";
import {recordExperience,experienceSummary} from "./experience-metrics";
import {experiencePage} from "./experience-model";
import {POST} from "../../app/api/experience/route";
import {handle} from "./api";
import {session,SESSION_COOKIE} from "./security";
const directory=mkdtempSync(join(tmpdir(),"homay-experience-"));
beforeAll(()=>{process.env.DATABASE_PATH=join(directory,"test.sqlite");process.env.APP_ORIGIN="https://homay.test";});
afterAll(()=>{vi.useRealTimers();platformDb().close();rmSync(directory,{recursive:true,force:true});});
const post=(payload:unknown,origin="https://homay.test")=>POST(new Request("https://homay.test/api/experience",{method:"POST",headers:{origin,host:"homay.test","content-type":"application/json"},body:JSON.stringify(payload)}));
function cookie(role:string){const id=randomUUID();run("INSERT INTO p_users(id,name,password,referral_code,role,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",id,"Test","unused",id,role,now(),now(),"test");return SESSION_COOKIE+"="+session(id,"test");}
const report=(token="")=>handle(new Request("https://homay.test/api/platform/admin/site-experience",{headers:{cookie:token}}),["admin","site-experience"]);
it("keeps only fixed route groups and rejects identifiers, excessive batches and durations",async()=>{
  expect(experiencePage("/register?ref=private-code")).toBe("register");
  expect(experiencePage("/account?user=private")).toBe("account");
  expect(experiencePage("/products/private-id")).toBe("other");
  const event={page:"home",kind:"navigation",duration:100};
  expect((await post({events:[event]})).status).toBe(204);
  expect((await post({events:[{...event,email:"private@example.test"}]})).status).toBe(400);
  expect((await post({events:[{...event,page:"/register?ref=secret"}]})).status).toBe(400);
  expect((await post({events:[{...event,duration:120001}]})).status).toBe(400);
  expect((await post({events:Array(13).fill(event)})).status).toBe(400);
  expect((await post({events:[event]},"https://other.test")).status).toBe(403);
});
it("aggregates timing correctly, counts slow samples and expires old days",()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
  recordExperience({events:[{page:"account",kind:"ttfb",duration:200},{page:"account",kind:"ttfb",duration:1000}]});
  expect(experienceSummary().rows.find(r=>r.page==="account")).toMatchObject({samples:2,averageMs:600,maxMs:1000,slow:1});
  vi.setSystemTime(new Date("2026-10-24T10:00:00Z"));
  recordExperience({events:[{page:"shop",kind:"lcp",duration:2800}]});
  expect(experienceSummary().rows.find(r=>r.page==="account")).toBeUndefined();
  expect(platformDb().prepare("SELECT COUNT(*) n FROM p_experience_daily WHERE day='2026-10-10'").get()).toEqual({n:0});
  vi.useRealTimers();
});
it("requires the owner session for the report",async()=>{
  expect((await report()).status).toBe(401);
  expect((await report(cookie("user"))).status).toBe(403);
  expect((await report(cookie("superadmin"))).status).toBe(200);
});
