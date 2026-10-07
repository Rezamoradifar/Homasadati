// @vitest-environment node
import {beforeAll,afterAll,it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {platformDb,run,one,now} from "./schema";
import {saveSetting} from "./providers";
import {FOUR_REFERRAL_VERSION,fourDirectCapacity} from "./card-position-model";
import {configureFourReferrals,bindDirect,assertDirectCapacity,personalPositionTree,positionAncestors,positionDesks} from "./card-positions";
import {runCardSettlement,weekStartAt} from "./seven-card-engine";
import {createOrder,settleOrder,refundOrder,wallet} from "./finance";
import {handle} from "./api";
import {session,SESSION_COOKIE} from "./security";
import {referralStatus,setReferralPlacement} from "./referral";
import {placementTree,searchTree} from "./network-tree";
const dir=mkdtempSync(join(tmpdir(),"homay-four-referrals-")),M=1_000_000;
let product:string,admin:string;
function member(name="Fixture",sponsor:string|null=null) {
 const id=randomUUID();run("INSERT INTO p_users(id,name,password,referral_code,sponsor_id,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",id,name,"unused",id,sponsor,now(),now(),"test");run("INSERT INTO p_wallets(user_id) VALUES(?)",id);return id;
}
function buy(user:string,amount:number) {run("UPDATE p_products SET price=? WHERE id=?",amount,product);return settleOrder(createOrder(user,product,1,"zibal",randomUUID()).id,"bank-"+randomUUID());}
beforeAll(()=> {
 process.env.DATABASE_PATH=join(dir,"test.sqlite");admin=member();run("UPDATE p_users SET role='superadmin' WHERE id=?",admin);
 product=randomUUID();run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,cancel_hours,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",product,"Purchase","","craft","card",10*M,10000,0,1,now(),now());
 saveSetting("commission_policy",JSON.stringify({directBps:0,levels:[],binaryBps:0,maxPayoutBps:0,warningBps:5000,criticalBps:8000,withdrawMin:1,withdrawMax:1_000_000_000,paused:false}));
 saveSetting("seven_card_schedule_version","2026-10-06");configureFourReferrals();
});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it("opens four slots at 10m but requires owner placement before every new referral",()=> {
 const root=member();expect(fourDirectCapacity(0)).toBe(0);
 expect(()=>assertDirectCapacity(root)).toThrow("direct_capacity_reached");
 buy(root,10*M);expect(positionDesks(root)).toBe(1);const children:string[]=[];
 for (let i=0;i<4;i++) {
   setReferralPlacement(one("SELECT * FROM p_users WHERE id=?",root)!,{desk:i+4});
   assertDirectCapacity(root);expect(referralStatus(one("SELECT * FROM p_users WHERE id=?",root)!).active).toBe(true);const child=member("Leaf "+i,root);children.push(child);
   expect(bindDirect(root,child).ordinal).toBe(i+1);
   expect(bindDirect(root,child).ordinal).toBe(i+1);
   if (i===3) expect(()=>assertDirectCapacity(root)).toThrow("direct_capacity_reached");
   expect(referralStatus(one("SELECT * FROM p_users WHERE id=?",root)!).active).toBe(false);
 }
 const tree=personalPositionTree(root);expect(tree.version).toBe(FOUR_REFERRAL_VERSION);expect(tree.desks).toBe(1);
 expect(tree.directs.map(d=>[d.desk,d.enabled,d.member?.child_id])).toEqual(children.map((child,i)=>[i+4,true,child]));
 expect(()=>bindDirect(root,member())).toThrow();
 expect(positionAncestors(children[1])).toEqual([{user:root,desk:1,leg:"left"}]);
 expect(positionAncestors(children[3])).toEqual([{user:root,desk:1,leg:"right"}]);
 expect(placementTree(root,children[2],2).path.map(p=>p.id)).toEqual([root,children[2]]);
 expect(searchTree(root,"Leaf")).toHaveLength(4);expect(()=>placementTree(children[0],root)).toThrow();
});
it("a refund disables the leaf without moving an existing member",()=> {
 const root=member();const topup=buy(root,10*M),child=member("Existing leaf",root);setReferralPlacement(one("SELECT * FROM p_users WHERE id=?",root)!,{desk:4});bindDirect(root,child);
 refundOrder(topup.id,admin,true,"return top-up");const tree=personalPositionTree(root);
 expect(tree.desks).toBe(0);expect(tree.directCapacity).toBe(0);expect(tree.directs[0].enabled).toBe(false);expect(tree.directs[0].member?.child_id).toBe(child);
 expect(()=>bindDirect(root,member())).toThrow();
});
it("refuses reinterpretation of live networks and financial history",()=> {
 saveSetting("seven_card_position_version","aa-2026-10-06");
 expect(()=>configureFourReferrals()).toThrow("existing_direct_position_review_required");
 expect(one("SELECT value FROM p_settings WHERE key='seven_card_position_version'")?.value).toBe("aa-2026-10-06");
 saveSetting("seven_card_live","1");expect(()=>configureFourReferrals()).toThrow("position_history_review_required");
 saveSetting("seven_card_live","0");saveSetting("seven_card_position_version",FOUR_REFERRAL_VERSION);expect(()=>configureFourReferrals()).not.toThrow();
});

it("requires a fresh owner choice after consuming a selection",()=> {
 const root=member(),user=one("SELECT * FROM p_users WHERE id=?",root)!;
 expect(()=>setReferralPlacement(user,{desk:7})).toThrow("direct_capacity_reached");
 buy(root,10*M);expect(setReferralPlacement(user,{desk:7}).placement?.nextDesk).toBe(7);
 const first=member("Selected",root);expect(bindDirect(root,first).ordinal).toBe(4);
 expect(referralStatus(user).placement?.nextDesk).toBeNull();
 expect(()=>setReferralPlacement(user,{desk:7})).toThrow("direct_position_occupied");
 expect(()=>setReferralPlacement(user,{desk:8})).toThrow();
 const second=member("Chosen next",root);expect(()=>bindDirect(root,second)).toThrow("direct_position_required");
 setReferralPlacement(user,{desk:4});expect(bindDirect(root,second).ordinal).toBe(1);
 setReferralPlacement(user,{desk:6});setReferralPlacement(user,{desk:null});
 expect(()=>bindDirect(root,member())).toThrow("direct_position_required");
 setReferralPlacement(user,{desk:5});expect(bindDirect(root,member("Chosen two",root)).ordinal).toBe(2);
 setReferralPlacement(user,{desk:6});const last=member("Last",root);expect(bindDirect(root,last).ordinal).toBe(3);
 expect(referralStatus(user).active).toBe(false);
 expect(bindDirect(root,last).ordinal).toBe(3);
 expect(()=>bindDirect(root,member())).toThrow();
});
it("does not consume the placement choice when a refund locks all referrals",()=> {
 const root=member(),user=one("SELECT * FROM p_users WHERE id=?",root)!;
 const order=buy(root,10*M);setReferralPlacement(user,{desk:6});refundOrder(order.id,admin,true,"return purchase");
 expect(()=>bindDirect(root,member())).toThrow();
 expect(referralStatus(user).placement?.nextDesk).toBe(6);
 buy(root,10*M);expect(bindDirect(root,member("After reactivation",root)).ordinal).toBe(3);
});
it("authenticates the placement endpoint and prevents choosing for another member",async()=> {
 const owner=member(),other=member();buy(owner,10*M);buy(other,10*M);
 const token=session(owner,"test");
 const request=(payload:unknown,cookie="",origin="https://homay.test")=>handle(new Request("https://homay.test/api/platform/referral/placement",{method:"POST",headers:{origin,host:"homay.test","content-type":"application/json",cookie},body:JSON.stringify(payload)}),["referral","placement"]);
 expect((await request({desk:7})).status).toBe(401);
 expect((await request({desk:7},SESSION_COOKIE+"="+token,"https://other.test")).status).toBe(403);
 expect((await request({desk:7,userId:other},SESSION_COOKIE+"="+token)).status).toBe(400);
 const response=await request({desk:7},SESSION_COOKIE+"="+token);expect(response.status).toBe(200);
 expect((await response.json()).placement.nextDesk).toBe(7);
 expect(one("SELECT desk FROM p_referral_placement WHERE user_id=?",other)).toBeUndefined();
 expect((await request({desk:null},SESSION_COOKIE+"="+token)).status).toBe(200);
});
it("keeps the earlier four-referral release's placement and volume rules",()=> {
 saveSetting("seven_card_position_version","four-referrals-2026-10-07");
 const root=member();buy(root,10*M);const child=member("Historical mode",root);
 expect(bindDirect(root,child).ordinal).toBe(1);
 expect(positionAncestors(child)).toEqual([{user:root,desk:1,leg:"left"},{user:root,desk:2,leg:"left"},{user:root,desk:4,leg:"left"}]);
 expect(()=>configureFourReferrals()).toThrow("existing_direct_position_review_required");
 saveSetting("seven_card_position_version",FOUR_REFERRAL_VERSION);
});
it("settles four new routes once and reverses the affected pools on refund",()=> {
 saveSetting("seven_card_plan_draft",JSON.stringify({revision:1,decisions:{overflow:"flush",counterScope:"member",voucherCountsTowardCap:true,topology:"own-desks",purchaseCredit:"purchase-value",weekStart:1}}));
 saveSetting("seven_card_live","1");saveSetting("seven_card_budget_unlimited","1");saveSetting("seven_card_live_since",String(Date.now()));
 const root=member();buy(root,70*M);
 const children=Array.from({length:4},(_,i)=>member("Paid leaf "+i,root));children.forEach((child,i)=>{setReferralPlacement(one("SELECT * FROM p_users WHERE id=?",root)!,{desk:i+4});bindDirect(root,child);});
 const sales=children.map(child=>buy(child,30*M));const monday=weekStartAt(Date.now(),1);
 runCardSettlement(monday+7*86400_000+3600000);
 expect(wallet(root).pending).toBe(19_600_000);
 expect(one("SELECT COUNT(*) n FROM p_card_position_lots WHERE user_id=? AND order_id IN (SELECT id FROM p_orders WHERE user_id=?)",root,root)!.n).toBe(0);
 refundOrder(sales[1].id,admin,true,"reverse leaf 5 purchase");expect(wallet(root).pending).toBe(9_800_000);
 expect(runCardSettlement(monday+7*86400_000+3600000)).toEqual([]);
 saveSetting("seven_card_live","0");
});

it("excludes pre-activation purchases even when settlement occurs after the leaf lights up",()=> {
 const t=Date.now()-10_000;saveSetting("seven_card_live","1");saveSetting("seven_card_live_since",String(t-1000));
 const root=member(),user=one("SELECT * FROM p_users WHERE id=?",root)!;
 const first=buy(root,10*M);run("UPDATE p_orders SET paid_at=? WHERE id=?",new Date(t).toISOString(),first.id);
 setReferralPlacement(user,{desk:7});const child=member("Before activation",root);bindDirect(root,child);
 const before=buy(child,30*M);run("UPDATE p_orders SET paid_at=? WHERE id=?",new Date(t+1000).toISOString(),before.id);
 const activation=buy(root,60*M);run("UPDATE p_orders SET paid_at=? WHERE id=?",new Date(t+2000).toISOString(),activation.id);
 const after=buy(child,30*M);run("UPDATE p_orders SET paid_at=? WHERE id=?",new Date(t+3000).toISOString(),after.id);
 const monday=weekStartAt(Date.now(),1);runCardSettlement(monday+14*86400_000+3600000);
 expect(one("SELECT COALESCE(SUM(volume),0) n FROM p_card_position_lots WHERE user_id=? AND desk=7",root)!.n).toBe(30*M);
 expect(one("SELECT COALESCE(SUM(volume),0) n FROM p_card_position_lots WHERE user_id=? AND desk=1",root)!.n).toBe(60*M);
 expect(one("SELECT COUNT(*) n FROM p_card_position_lots WHERE user_id=? AND desk=7 AND order_id=?",root,before.id)!.n).toBe(0);
 expect(one("SELECT COUNT(*) n FROM p_card_position_lots WHERE user_id=? AND desk=7 AND order_id=?",root,after.id)!.n).toBe(1);
 runCardSettlement(monday+21*86400_000+3600000);
 expect(one("SELECT COALESCE(SUM(volume),0) n FROM p_card_position_lots WHERE user_id=? AND desk=7",root)!.n).toBe(30*M);
 saveSetting("seven_card_live","0");
});
