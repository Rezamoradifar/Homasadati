// @vitest-environment node
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { platformDb, run, one, now } from "./schema";
import { saveSetting } from "./providers";
import { SEVEN_LEVEL_VERSION } from "./card-levels";
import { session, SESSION_COOKIE } from "./security";
import { handle } from "./api";
import { api } from "./client";
const dir=mkdtempSync(join(tmpdir(),"homay-referral-client-"));
let user:string;
const fetchMock=vi.fn();
beforeAll(()=>{
  process.env.DATABASE_PATH=join(dir,"test.sqlite");
  user=randomUUID();
  run("INSERT INTO p_users(id,name,password,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?)",user,"Leader","unused","hn-fixture",now(),now(),"test");
  run("INSERT INTO p_wallets(user_id) VALUES(?)",user);
  run("INSERT INTO p_company_positions VALUES(?,?,?,?,?,?)",user,7,now(),new Date(Date.now()+35*86400000).toISOString(),user,"grace");
  saveSetting("seven_card_position_version",SEVEN_LEVEL_VERSION);
  saveSetting("referral_requires_purchase","1");
  const token=session(user,"test");
  fetchMock.mockImplementation((url:string,init:RequestInit)=>{
    const headers=new Headers(init.headers);
    headers.set("origin","https://homay.test");headers.set("host","homay.test");headers.set("cookie",SESSION_COOKIE+"="+token);
    return handle(new Request("https://homay.test"+url,{...init,headers}),url.replace("/api/platform/","").split("/"));
  });
  vi.stubGlobal("fetch",fetchMock);
});
afterAll(()=>{vi.unstubAllGlobals();platformDb().close();rmSync(dir,{recursive:true,force:true});});
it("sends the selected endpoint through real client validation and authenticated API, activating the referral",async()=>{
  const result=await api("referral/placement","POST",{ordinal:1});
  expect(result.active).toBe(true);
  expect(one("SELECT ordinal FROM p_referral_endpoint_choice WHERE user_id=?",user)?.ordinal).toBe(1);
  expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ordinal:1});
  expect((await api("referral/placement","POST",{ordinal:null})).active).toBe(false);
});
it("rejects malformed/mixed placement payloads before sending and still supports legacy desk choices",async()=>{
  const calls=fetchMock.mock.calls.length;
  for (const data of [{ordinal:9},{ordinal:"1"},{code:"hn-other"},{ordinal:1,desk:4},{}])
    await expect(api("referral/placement","POST",data)).rejects.toThrow("اطلاعات فرم معتبر نیست");
  expect(fetchMock.mock.calls.length).toBe(calls);
  saveSetting("seven_card_position_version","manual-referrals-2026-10-07");
  expect((await api("referral/placement","POST",{desk:4})).active).toBe(true);
  expect(one("SELECT desk FROM p_referral_placement WHERE user_id=?",user)?.desk).toBe(4);
  saveSetting("seven_card_position_version",SEVEN_LEVEL_VERSION);
});
it("keeps referral-code changes on their own validation route",async()=>{
  expect((await api("referral","POST",{code:"hn-updated"})).code).toBe("hn-updated");
  await expect(api("referral","POST",{ordinal:1})).rejects.toThrow("اطلاعات فرم معتبر نیست");
});
