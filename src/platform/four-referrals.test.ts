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
import {referralStatus} from "./referral";
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
it("requires each leaf to be paid before accepting its one referral and uses a shared left-to-right order",()=> {
 const root=member();expect(fourDirectCapacity(0)).toBe(0);
 buy(root,10*M);expect(positionDesks(root)).toBe(1);expect(referralStatus(one("SELECT * FROM p_users WHERE id=?",root)!).active).toBe(false);expect(()=>assertDirectCapacity(root)).toThrow("direct_capacity_reached");
 buy(root,30*M);const children:string[]=[];
 for (let i=0;i<4;i++) {
   if(i) buy(root,10*M);
   assertDirectCapacity(root);expect(referralStatus(one("SELECT * FROM p_users WHERE id=?",root)!).active).toBe(true);const child=member("Leaf "+i,root);children.push(child);
   expect(bindDirect(root,child).ordinal).toBe(i+1);
   expect(bindDirect(root,child).ordinal).toBe(i+1);
   expect(()=>assertDirectCapacity(root)).toThrow("direct_capacity_reached");
   expect(referralStatus(one("SELECT * FROM p_users WHERE id=?",root)!).active).toBe(false);
 }
 const tree=personalPositionTree(root);expect(tree.version).toBe(FOUR_REFERRAL_VERSION);expect(tree.desks).toBe(7);
 expect(tree.directs.map(d=>[d.desk,d.enabled,d.member?.child_id])).toEqual(children.map((child,i)=>[i+4,true,child]));
 expect(()=>bindDirect(root,member())).toThrow("direct_capacity_reached");
 expect(positionAncestors(children[1])).toEqual([{user:root,desk:1,leg:"left"},{user:root,desk:2,leg:"right"},{user:root,desk:5,leg:"left"}]);
 expect(positionAncestors(children[3])).toEqual([{user:root,desk:1,leg:"right"},{user:root,desk:3,leg:"right"},{user:root,desk:7,leg:"left"}]);
 expect(placementTree(root,children[2],2).path.map(p=>p.id)).toEqual([root,children[2]]);
 expect(searchTree(root,"Leaf")).toHaveLength(4);expect(()=>placementTree(children[0],root)).toThrow();
});
it("a refund disables the leaf without moving an existing member",()=> {
 const root=member();buy(root,30*M);const topup=buy(root,10*M),child=member("Existing leaf",root);bindDirect(root,child);
 refundOrder(topup.id,admin,true,"return top-up");const tree=personalPositionTree(root);
 expect(tree.desks).toBe(3);expect(tree.directCapacity).toBe(0);expect(tree.directs[0].enabled).toBe(false);expect(tree.directs[0].member?.child_id).toBe(child);
 expect(()=>bindDirect(root,member())).toThrow("direct_capacity_reached");
});
it("refuses reinterpretation of live networks and financial history",()=> {
 saveSetting("seven_card_position_version","aa-2026-10-06");
 expect(()=>configureFourReferrals()).toThrow("existing_direct_position_review_required");
 expect(one("SELECT value FROM p_settings WHERE key='seven_card_position_version'")?.value).toBe("aa-2026-10-06");
 saveSetting("seven_card_live","1");expect(()=>configureFourReferrals()).toThrow("position_history_review_required");
 saveSetting("seven_card_live","0");saveSetting("seven_card_position_version",FOUR_REFERRAL_VERSION);expect(()=>configureFourReferrals()).not.toThrow();
});

it("settles four new routes once and reverses the affected pools on refund",()=> {
 saveSetting("seven_card_plan_draft",JSON.stringify({revision:1,decisions:{overflow:"flush",counterScope:"member",voucherCountsTowardCap:true,topology:"own-desks",purchaseCredit:"purchase-value",weekStart:1}}));
 saveSetting("seven_card_live","1");saveSetting("seven_card_budget_unlimited","1");saveSetting("seven_card_live_since",String(Date.now()));
 const root=member();buy(root,70*M);
 const children=Array.from({length:4},(_,i)=>member("Paid leaf "+i,root));children.forEach(child=>bindDirect(root,child));
 const sales=children.map(child=>buy(child,30*M));const monday=weekStartAt(Date.now(),1);
 runCardSettlement(monday+7*86400_000+3600000);
 expect(wallet(root).pending).toBe(19_600_000);
 expect(one("SELECT COUNT(*) n FROM p_card_position_lots WHERE user_id=? AND order_id IN (SELECT id FROM p_orders WHERE user_id=?)",root,root)!.n).toBe(0);
 refundOrder(sales[1].id,admin,true,"reverse leaf 5 purchase");expect(wallet(root).pending).toBe(9_800_000);
 expect(runCardSettlement(monday+7*86400_000+3600000)).toEqual([]);
 saveSetting("seven_card_live","0");
});
