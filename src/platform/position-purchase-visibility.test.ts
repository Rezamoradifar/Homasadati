// @vitest-environment node
import {beforeAll,afterAll,it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {platformDb,run,now,one} from "./schema";
import {saveSetting} from "./providers";
import {createOrder,settleOrder,refundOrder} from "./finance";
import {personalPositionTree} from "./card-positions";
import {runCardSettlement,setCardLive,weekStartAt} from "./seven-card-engine";
import {SEVEN_LEVEL_VERSION} from "./card-levels";

const dir=mkdtempSync(join(tmpdir(),"homa-visible-purchases-"));
const M=1_000_000, WEEK=7*86400_000;
let admin:string,product:string;
function member(name:string,sponsor?:string){
  const id=randomUUID();
  run("INSERT INTO p_users(id,name,password,referral_code,sponsor_id,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",id,name,"unused",id,sponsor||null,now(),now(),"test");
  run("INSERT INTO p_wallets(user_id) VALUES(?)",id);
  return id;
}
function paid(user:string,amount:number){
  run("UPDATE p_products SET price=? WHERE id=?",amount,product);
  const order=createOrder(user,product,1,"zibal",randomUUID());
  return settleOrder(order.id,"bank-"+randomUUID());
}
beforeAll(()=>{
  process.env.DATABASE_PATH=join(dir,"test.sqlite");
  admin=member("Admin");
  run("UPDATE p_users SET role='superadmin' WHERE id=?",admin);
  product=randomUUID();
  run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,cancel_hours,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",product,"Fixture","","craft","card",10*M,10000,0,1,now(),now());
  saveSetting("commission_policy",JSON.stringify({directBps:0,levels:[],binaryBps:0,maxPayoutBps:0,warningBps:5000,criticalBps:8000,withdrawMin:1,withdrawMax:1_000_000_000,paused:false}));
  saveSetting("seven_card_plan_draft",JSON.stringify({revision:1,decisions:{overflow:"flush",counterScope:"member",voucherCountsTowardCap:true,topology:"own-desks",purchaseCredit:"purchase-value",weekStart:1}}));
  saveSetting("seven_card_schedule_version","2026-10-06");
  saveSetting("seven_card_position_version",SEVEN_LEVEL_VERSION);
  setCardLive(admin,{live:true,unlimitedBudget:true,reason:"isolated fixture"});
});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});

it("shows paid purchases immediately on the correct position legs, separates personal purchases, excludes invalid orders and prevents posting duplicates",()=>{
  const root=member("Sponsor");
  const left=member("Left buyer",root),right=member("Right buyer",root);
  run("INSERT INTO p_card_direct_positions VALUES(?,?,?,?)",left,root,1,now());
  run("INSERT INTO p_card_direct_positions VALUES(?,?,?,?)",right,root,2,now());

  // This payment predates sponsor desk activation; it must not create
  // retrospective commissionable volume when the sponsor later activates.
  paid(left,4*M);
  paid(root,10*M);
  const initially=personalPositionTree(root);
  expect(initially.personalPaidVolume).toBe(10*M);
  expect(initially.tree.confirmedLeftVolume).toBe(0);
  expect(initially.tree.confirmedRightVolume).toBe(0);

  const pending=createOrder(right,product,1,"zibal",randomUUID());
  expect(pending.paid_at).toBeNull();
  const leftOrder=paid(left,30*M);
  const refunded=paid(right,5*M);
  refundOrder(refunded.id,admin,true,"test return");
  paid(right,40*M);
  const before=personalPositionTree(root);
  expect(before.tree.leftVolume).toBe(0);
  expect(before.tree.rightVolume).toBe(0);
  expect(before.tree.pendingLeftVolume).toBe(30*M);
  expect(before.tree.pendingRightVolume).toBe(40*M);
  expect(before.tree.confirmedLeftVolume).toBe(30*M);
  expect(before.tree.confirmedRightVolume).toBe(40*M);
  expect(before.tree.confirmedTotalSales).toBe(70*M);
  expect(before.tree.confirmedWeeklySales).toBe(70*M);
  expect(before.directs[0].member.paidPurchaseVolume).toBe(34*M);
  expect(before.directs[1].member.paidPurchaseVolume).toBe(40*M);
  expect(before.personalPaidVolume).toBe(10*M);
  expect(one("SELECT COUNT(*) n FROM p_card_position_lots WHERE user_id=?",root)!.n).toBe(0);

  // Weekly posting transfers exactly these amounts from awaiting to posted.
  const monday=weekStartAt(Date.now(),1);
  const processed=runCardSettlement(monday+WEEK+3600_000);
  expect(processed.length).toBeGreaterThan(0);
  const after=personalPositionTree(root);
  expect(after.tree.leftVolume).toBe(30*M);
  expect(after.tree.rightVolume).toBe(40*M);
  expect(after.tree.pendingLeftVolume).toBe(0);
  expect(after.tree.pendingRightVolume).toBe(0);
  expect(after.tree.confirmedLeftVolume).toBe(30*M);
  expect(after.tree.confirmedRightVolume).toBe(40*M);
  expect(after.personalPaidVolume).toBe(10*M);
  expect(one("SELECT COUNT(*) n FROM p_card_position_lots WHERE user_id=? AND order_id=?",root,leftOrder.id)!.n).toBe(1);
  expect(runCardSettlement(monday+WEEK+3600_000)).toEqual([]);
  expect(personalPositionTree(root).tree.confirmedTotalSales).toBe(70*M);
});
