// @vitest-environment node
import {beforeAll,afterAll,it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {platformDb,run,one,all,now} from "./schema";
import {saveSetting} from "./providers";
import {SEVEN_LEVEL_VERSION,sevenLevelCardForPurchase} from "./card-levels";
import {cardPlan} from "./seven-card";
import {previewCardMatches} from "./seven-card-model";
import {configureSevenLevelPlan,bindDirect,assertDirectCapacity,personalPositionTree,positionAncestors,positionDesks} from "./card-positions";
import {runCardSettlement,weekStartAt,memberCardStatus} from "./seven-card-engine";
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
 saveSetting("seven_card_schedule_version","2026-10-06");configureSevenLevelPlan();
});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});

it("implements the seven cards, exact purchase boundaries, caps and branch limits",()=> {
 for(let level=1;level<=7;level++) {
   const card=sevenLevelCardForPurchase(level*10*M)!;
   expect(card.desks).toBe(level);expect(card.branches).toBe(level+1);expect(card.weeklyCapToman).toBe(level*15*M);
   if(level<7) expect(sevenLevelCardForPurchase((level+1)*10*M-1)?.level).toBe(level);
 }
 expect(sevenLevelCardForPurchase(10*M-1)).toBeNull();
 expect(sevenLevelCardForPurchase(100*M)).toMatchObject({level:7,name:"سیمرغ",desks:7,branches:8,weeklyCapToman:105*M});
 expect(cardPlan().cards).toHaveLength(7);expect(cardPlan().deskWeeklyCapToman).toBe(15*M);
});
it("requires manual endpoint placement and unlocks exactly 2–8 branches as purchases increase",()=> {
 const root=member(),user=one("SELECT * FROM p_users WHERE id=?",root)!;
 buy(root,10*M);expect(memberCardStatus(root)).toMatchObject({cardName:"جوانه",level:1,desks:1,branches:2,weeklyCapToman:15*M});
 expect(()=>bindDirect(root,member())).toThrow("direct_position_required");
 expect(()=>setReferralPlacement(user,{ordinal:3})).toThrow("direct_capacity_reached");
 for(let ordinal=1;ordinal<=8;ordinal++) {
   if(ordinal>2) buy(root,10*M);
   expect(personalPositionTree(root).directCapacity).toBe(ordinal<=2 ? 2 : ordinal);
   setReferralPlacement(user,{ordinal});const child=member("Branch "+ordinal,root);expect(bindDirect(root,child).ordinal).toBe(ordinal);
   expect(one("SELECT * FROM p_referral_endpoint_choice WHERE user_id=?",root)).toBeUndefined();
   expect(()=>setReferralPlacement(user,{ordinal})).toThrow("direct_position_occupied");
 }
 expect(memberCardStatus(root)).toMatchObject({cardName:"سیمرغ",level:7,desks:7,branches:8,weeklyCapToman:105*M});
 expect(()=>assertDirectCapacity(root)).toThrow("direct_capacity_reached");
});
it("protects the full-plan placement API from unauthenticated or malformed choices",async()=> {
 const root=member();buy(root,20*M);const token=session(root,"test");
 const request=(payload:unknown,cookie="")=>handle(new Request("https://homay.test/api/platform/referral/placement",{method:"POST",headers:{origin:"https://homay.test",host:"homay.test","content-type":"application/json",cookie},body:JSON.stringify(payload)}),["referral","placement"]);
 expect((await request({ordinal:2})).status).toBe(401);
 expect((await request({desk:7},SESSION_COOKIE+"="+token)).status).toBe(400);
 expect((await request({ordinal:4},SESSION_COOKIE+"="+token)).status).toBe(409);
 expect((await request({ordinal:2},SESSION_COOKIE+"="+token)).status).toBe(200);
});
it("settles up to 15m per position and 105m total, including the shared voucher counter",()=> {
 saveSetting("seven_card_plan_draft",JSON.stringify({revision:1,decisions:{overflow:"flush",counterScope:"member",voucherCountsTowardCap:true,topology:"own-desks",purchaseCredit:"purchase-value",weekStart:1}}));
 saveSetting("seven_card_live","1");saveSetting("seven_card_budget_unlimited","1");saveSetting("seven_card_live_since",String(Date.now()));
 const root=member(),user=one("SELECT * FROM p_users WHERE id=?",root)!;buy(root,70*M);
 const children=Array.from({length:8},(_,i)=>member("Paid "+i,root));children.forEach((child,i)=>{setReferralPlacement(user,{ordinal:i+1});bindDirect(root,child);});
 const orders=children.map(child=>buy(child,300*M));const monday=weekStartAt(Date.now(),1);runCardSettlement(monday+7*86400_000+3600000);
 const rows=all("SELECT m.desk,SUM(d.amount) total FROM p_card_due d JOIN p_card_matches m ON m.id=d.match_id WHERE d.user_id=? GROUP BY m.desk",root);
 expect(rows).toHaveLength(7);expect(rows.every(row=>row.total===15*M)).toBe(true);
 expect(rows.reduce((sum,row)=>sum+row.total,0)).toBe(105*M);
 expect(one("SELECT COUNT(*) n FROM p_card_due WHERE user_id=? AND kind='voucher'",root)!.n).toBeGreaterThan(0);
 expect(runCardSettlement(monday+7*86400_000+3600000)).toEqual([]);
 const pending=wallet(root).pending;refundOrder(orders[0].id,admin,true,"reverse purchase");expect(wallet(root).pending).toBeLessThan(pending);
 saveSetting("seven_card_live","0");
});
it("does not backfill a dormant leaf when later purchases light it",()=> {
 const t=Date.now()-10_000;saveSetting("seven_card_live","1");saveSetting("seven_card_live_since",String(t-1000));
 const root=member(),user=one("SELECT * FROM p_users WHERE id=?",root)!;
 const own=buy(root,10*M);run("UPDATE p_orders SET paid_at=? WHERE id=?",new Date(t).toISOString(),own.id);
 setReferralPlacement(user,{ordinal:2});const child=member("Leaf 7 right",root);bindDirect(root,child);
 const before=buy(child,30*M);run("UPDATE p_orders SET paid_at=? WHERE id=?",new Date(t+1000).toISOString(),before.id);
 const activation=buy(root,60*M);run("UPDATE p_orders SET paid_at=? WHERE id=?",new Date(t+2000).toISOString(),activation.id);
 const after=buy(child,30*M);run("UPDATE p_orders SET paid_at=? WHERE id=?",new Date(t+3000).toISOString(),after.id);
 const monday=weekStartAt(Date.now(),1);runCardSettlement(monday+14*86400_000+3600000);
 expect(one("SELECT COALESCE(SUM(volume),0) n FROM p_card_position_lots WHERE user_id=? AND desk=7",root)!.n).toBe(30*M);
 expect(one("SELECT COALESCE(SUM(volume),0) n FROM p_card_position_lots WHERE user_id=? AND desk=1",root)!.n).toBe(60*M);
 expect(one("SELECT COUNT(*) n FROM p_card_position_lots WHERE user_id=? AND desk=7 AND order_id=?",root,before.id)!.n).toBe(0);
 runCardSettlement(monday+21*86400_000+3600000);expect(one("SELECT COALESCE(SUM(volume),0) n FROM p_card_position_lots WHERE user_id=? AND desk=7",root)!.n).toBe(30*M);
 saveSetting("seven_card_live","0");
});
it("refuses reinterpretation of existing history and uses the 15m preview cap",()=> {
 saveSetting("seven_card_position_version","manual-referrals-2026-10-07");expect(()=>configureSevenLevelPlan()).toThrow("position_history_review_required");
 saveSetting("seven_card_position_version",SEVEN_LEVEL_VERSION);
 const preview=previewCardMatches({left:120*M,right:120*M,earnedThisWeek:0,previousMatches:0,budget:100*M,voucherCountsTowardCap:true},15*M);
 expect(preview.gross).toBe(15*M);expect(preview.flushed).toBe(4_600_000);
});
