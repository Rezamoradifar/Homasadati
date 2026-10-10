// @vitest-environment node
import {beforeAll,afterAll,it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {buildStartGuide,type GuideInput} from "./start-guide-model";
import {memberStartGuide} from "./start-guide";
import {platformDb,run,one,now} from "./schema";
import {saveSetting} from "./providers";
import {handle} from "./api";
import {SESSION_COOKIE,session} from "./security";
const dir=mkdtempSync(join(tmpdir(),"homay-start-guide-"));
const base:GuideInput={profileComplete:false,bankStatus:null,twoFactor:false,activeDesks:0,permanent:false,companyNeedsPurchase:false,invitationState:"purchase_required",directMembers:0,hasNetworkActivity:false};
const step=(input:Partial<GuideInput>,id:string)=>buildStartGuide({...base,...input}).steps.find(s=>s.id===id)!;
beforeAll(()=>{process.env.DATABASE_PATH=join(dir,"test.sqlite");});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it("directs missing profile, missing security, pending and rejected bank details correctly",()=>{
 expect(step({},"profile")).toMatchObject({status:"action",tab:"profile"});
 expect(step({profileComplete:true},"profile")).toMatchObject({status:"action",tab:"security"});
 expect(step({profileComplete:true,twoFactor:true,bankStatus:"pending"},"profile")).toMatchObject({status:"pending",tab:"wallet"});
 expect(step({profileComplete:true,twoFactor:true,bankStatus:"rejected"},"profile").status).toBe("action");
 expect(step({profileComplete:true,twoFactor:true,bankStatus:"verified"},"profile").status).toBe("done");
});
it("requires purchases for inactive and unqualified gifts but skips permanent active accounts",()=>{
 expect(step({},"activation")).toMatchObject({status:"action",tab:"catalog"});
 expect(step({activeDesks:2,companyNeedsPurchase:true},"activation")).toMatchObject({status:"action",tab:"catalog"});
 expect(step({activeDesks:7,permanent:true},"activation")).toMatchObject({status:"done",tab:"network"});
 expect(step({activeDesks:7,permanent:true},"activation").description).toContain("خرید برای فعال‌سازی لازم نیست");
});
it("does not invent registrations or earnings and updates the next placement after consumption",()=>{
 expect(step({invitationState:"ready"},"invite")).toMatchObject({status:"action",copy:true});
 expect(step({invitationState:"placement_required",directMembers:1},"invite")).toMatchObject({status:"done",copy:false});
 expect(step({invitationState:"placement_required",directMembers:1},"placement").status).toBe("action");
 expect(step({invitationState:"capacity_full",directMembers:8},"placement").status).toBe("done");
 expect(step({directMembers:1},"report").status).toBe("pending");
 expect(step({hasNetworkActivity:true},"report").status).toBe("done");
});
it("reads actual status without decrypting or returning bank or authentication secrets",async()=>{
 const id=randomUUID();run("INSERT INTO p_users(id,name,password,referral_code,otp_secret,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",id,"Fixture","unused",id,"private-authenticator",now(),now(),"test");run("INSERT INTO p_wallets(user_id) VALUES(?)",id);
 const details={firstName:"Test",lastName:"Member",country:"Iran",city:"Tehran"};
 run("INSERT INTO p_member_details VALUES(?,?,?,?)",id,JSON.stringify(details),"",now());
 run("INSERT INTO p_payout_profiles VALUES(?,?,?,?,?,'pending','',NULL,NULL,?,?)",id,"private-bank-data",id,"1234","5678",now(),now());
 const u=one("SELECT * FROM p_users WHERE id=?",id)!;
 const guide=memberStartGuide(u,{desks:0,leftVolume:0,rightVolume:0,pendingRewards:0},{state:"purchase_required",directMembers:0},[]);
 expect(guide.steps[0].status).toBe("pending");expect(JSON.stringify(guide)).not.toMatch(/private-bank-data|private-authenticator|1234|5678/);
 run("UPDATE p_member_details SET details='invalid JSON' WHERE user_id=?",id);
 expect(memberStartGuide(u,{desks:0},{state:"purchase_required",directMembers:0},[]).steps[0].tab).toBe("profile");
 const cookie=SESSION_COOKIE+"="+session(id,"test");
 const response=await handle(new Request("https://homay.test/api/platform/dashboard",{headers:{cookie}}),["dashboard"]);
 expect(response.status).toBe(200);const body=await response.json();expect(body.startGuide.steps).toHaveLength(5);expect(body.startGuide.steps[0].tab).toBe("profile");
 expect(JSON.stringify(body.startGuide)).not.toMatch(/private-bank-data|private-authenticator/);
 const unauth=await handle(new Request("https://homay.test/api/platform/dashboard"),["dashboard"]);expect(unauth.status).toBe(401);
});
it("recognizes the actual permanent owner grant without paid orders",()=>{
 const id=randomUUID();run("INSERT INTO p_users(id,name,password,referral_code,role,created_at,last_seen,signup_ip) VALUES(?,?,?,?,'superadmin',?,?,?)",id,"Owner","unused",id,now(),now(),"test");
 saveSetting("company_position_permanent_owner",id);run("INSERT INTO p_company_positions VALUES(?,?,?,?,?,?)",id,7,now(),new Date(Date.now()+35*86400000).toISOString(),id,"grace");
 const guide=memberStartGuide(one("SELECT * FROM p_users WHERE id=?",id)!,{desks:7},{state:"placement_required",directMembers:0},[]);
 expect(guide.steps[1]).toMatchObject({status:"done",tab:"network"});expect(guide.steps[1].description).toContain("خرید برای فعال‌سازی لازم نیست");
 for(const permanent of [true,false]){
  const child=randomUUID();run("INSERT INTO p_users(id,name,password,referral_code,sponsor_id,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",child,"Leader","unused",child,id,now(),now(),"test");
  run("INSERT INTO p_company_positions VALUES(?,?,?,?,?,?)",child,7,now(),new Date(Date.now()+35*86400000).toISOString(),id,"grace");
  if(permanent)saveSetting("company_position_permanent_brand",child);
  const childGuide=memberStartGuide(one("SELECT * FROM p_users WHERE id=?",child)!,{desks:7},{state:"placement_required",directMembers:0},[]);
  expect(childGuide.steps[1]).toMatchObject(permanent?{status:"done",tab:"network"}:{status:"action",tab:"catalog"});
  if(!permanent){
   run("UPDATE p_company_positions SET granted_at=?,deadline=? WHERE user_id=?",new Date(Date.now()-40*86400000).toISOString(),new Date(Date.now()-5*86400000).toISOString(),child);
   const ownActive=memberStartGuide(one("SELECT * FROM p_users WHERE id=?",child)!,{desks:1},{state:"ready",directMembers:0},[]);
   expect(ownActive.steps[1]).toMatchObject({status:"done",tab:"network"});
  }
 }

});
