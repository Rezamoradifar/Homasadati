// @vitest-environment node
import {beforeAll,afterAll,it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {platformDb,run,one,all,now} from "./schema";
import {saveSetting} from "./providers";
import {directRoutes,DIRECT_PATHS,POSITION_PATHS,directCapacity} from "./card-position-model";
import {positionDesks,bindDirect,assertDirectCapacity,positionAncestors,personalPositionTree,configurePositions,positionMode,positionVolume} from "./card-positions";
import {createOrder,settleOrder,refundOrder,wallet} from "./finance";
import {setCardLive,runCardSettlement,weekStartAt,releaseCardRewards,voucherBalance} from "./seven-card-engine";
import {placementTree,searchTree} from "./network-tree";
const dir=mkdtempSync(join(tmpdir(),"homay-position-test-"));const M=1_000_000,DAY=86400_000;
let product:string,admin:string;
function member(name="Fixture",sponsor:string|null=null){const id=randomUUID();run("INSERT INTO p_users(id,name,password,referral_code,sponsor_id,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",id,name,"unused",id,sponsor,now(),now(),"test");run("INSERT INTO p_wallets(user_id) VALUES(?)",id);return id;}
function buy(user:string,amount:number){run("UPDATE p_products SET price=? WHERE id=?",amount,product);return settleOrder(createOrder(user,product,1,"zibal",randomUUID()).id,"bank-"+randomUUID());}
beforeAll(()=>{process.env.DATABASE_PATH=join(dir,"test.sqlite");admin=member();run("UPDATE p_users SET role='superadmin' WHERE id=?",admin);product=randomUUID();run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,cancel_hours,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",product,"Purchase","","craft","card",10*M,10000,0,1,now(),now());saveSetting("commission_policy",JSON.stringify({directBps:0,levels:[],binaryBps:0,maxPayoutBps:0,warningBps:5000,criticalBps:8000,withdrawMin:1,withdrawMax:1_000_000_000,paused:false}));saveSetting("seven_card_plan_draft",JSON.stringify({revision:1,decisions:{overflow:"flush",counterScope:"member",voucherCountsTowardCap:true,topology:"own-desks",purchaseCredit:"purchase-value",weekStart:1}}));saveSetting("seven_card_schedule_version","2026-10-06");});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it("maps exactly the seven diagrams: BFS positions and stable eight direct endpoints",()=>{
 expect(POSITION_PATHS).toEqual(["","L","R","LL","LR","RL","RR"]);
 expect(DIRECT_PATHS).toEqual(["LLL","RRR","LRL","RLL","LLR","LRR","RLR","RRL"]);
 for(let desks=1;desks<=7;desks++)expect(directCapacity(desks)).toBe(desks+1);
 expect(directCapacity(0)).toBe(0);expect(directCapacity(8)).toBe(8);
 expect(directRoutes(1,7)).toEqual([{desk:1,leg:"left"},{desk:2,leg:"left"},{desk:4,leg:"left"}]);
 expect(directRoutes(3,7)).toEqual([{desk:1,leg:"left"},{desk:2,leg:"right"},{desk:5,leg:"left"}]);
 expect(directRoutes(8,7)).toEqual([{desk:1,leg:"right"},{desk:3,leg:"right"},{desk:7,leg:"left"}]);
});
it("rejects a migration with incompatible existing direct capacity without enabling mode",()=>{const owner=member(),child=member("Existing",owner);expect(()=>configurePositions()).toThrow("existing_direct_capacity_conflict");expect(positionMode()).toBe(false);run("UPDATE p_users SET sponsor_id=NULL WHERE id=?",child);configurePositions();expect(positionMode()).toBe(true);});
it("lights immediately on confirmed top-ups, enforces capacities atomically, and preserves direct identities",()=>{
 const root=member();expect(positionDesks(root)).toBe(0);expect(()=>assertDirectCapacity(root)).toThrow();
 buy(root,10*M);expect(positionDesks(root)).toBe(1);
 const d1=member("First",root),d2=member("Second",root);expect(bindDirect(root,d1).ordinal).toBe(1);expect(bindDirect(root,d2).ordinal).toBe(2);
 expect(()=>assertDirectCapacity(root)).toThrow("direct_capacity_reached");const d3=member("Third");expect(()=>bindDirect(root,d3)).toThrow();
 buy(root,10*M);run("UPDATE p_users SET sponsor_id=? WHERE id=?",root,d3);expect(bindDirect(root,d3).ordinal).toBe(3);expect(bindDirect(root,d1).ordinal).toBe(1);
 const t=personalPositionTree(root);expect(t.desks).toBe(2);expect(t.tree.active).toBe(true);expect(t.tree.left.active).toBe(true);expect(t.tree.right.active).toBe(false);expect(t.directs.filter(x=>x.enabled)).toHaveLength(3);
 const scope=placementTree(root,d3,2);expect(scope.path.map(p=>p.id)).toEqual([root,d3]);expect(searchTree(root,"Third")[0].id).toBe(d3);expect(()=>placementTree(d3,root,2)).toThrow();
 const up=buy(root,10*M);expect(positionDesks(root)).toBe(3);refundOrder(up.id,admin,true,"return top-up");expect(positionDesks(root)).toBe(2);
});
it("settles independent position pools, never pays own purchases, and reverses position allocations on refund",()=>{
 const root=member("Plan owner");buy(root,30*M);
 const directs=Array.from({length:4},(_,i)=>member("D"+(i+1),root));directs.forEach(d=>bindDirect(root,d));
 setCardLive(admin,{live:true,unlimitedBudget:true,reason:"fixture only"});
 buy(root,30*M);const sales=directs.map(d=>buy(d,30*M));
 const monday=weekStartAt(Date.now(),1);
 const [week]=runCardSettlement(monday+7*DAY+3600000) as any[];
 // root: 60/60 => 9.8m. desk2: D1/D3 => 4.9m. desk3: D4/D2 => 4.9m.
 expect(week.cash).toBe(19_600_000);expect(wallet(root)).toMatchObject({available:0,pending:19_600_000});
 expect(all("SELECT desk,amount FROM p_card_matches WHERE user_id=? ORDER BY desk",root).map(x=>[x.desk,x.amount])).toEqual([[1,4_900_000],[1,4_900_000],[2,4_900_000],[3,4_900_000]]);
 expect(one("SELECT COUNT(*) n FROM p_card_position_lots WHERE user_id=? AND order_id IN (SELECT id FROM p_orders WHERE user_id=?)",root,root)!.n).toBe(0);
 expect(positionAncestors(directs[2])).toContainEqual({user:root,desk:2,leg:"right"});
 expect(releaseCardRewards(monday+14*DAY-1)).toBe(0);
 refundOrder(sales[2].id,admin,true,"reverse D3 purchase");
 expect(wallet(root).pending).toBe(9_800_000);
 const before=positionVolume(root,2,"left");refundOrder(sales[2].id,admin,true,"repeat");expect(positionVolume(root,2,"left")).toBe(before);
 expect(runCardSettlement(monday+7*DAY+3600000)).toEqual([]);
 expect(releaseCardRewards(monday+14*DAY)).toBe(2);expect(wallet(root).available).toBe(9_800_000);expect(voucherBalance(root)).toBe(0);
});
it("enforces each position cap and the shared eighth voucher counter, with next-week release",()=>{
 const root=member("Seven-position owner");buy(root,30*M);buy(root,40*M);
 const directs=Array.from({length:8},(_,i)=>member("Eight D"+(i+1),root));directs.forEach(d=>bindDirect(root,d));
 // Do not include earlier carry, since this scenario uses new independent members.
 directs.forEach(d=>buy(d,30*M));
 const monday=weekStartAt(Date.now(),1),[week]=runCardSettlement(monday+14*DAY+3600000) as any[];
 const rows=all("SELECT desk,SUM(d.amount) total FROM p_card_due d JOIN p_card_matches m ON m.id=d.match_id WHERE d.user_id=? AND d.status='pending' GROUP BY desk",root);
 expect(rows.find(x=>x.desk===1)!.total).toBe(10_500_000);
 expect(rows.every(x=>x.total<=10_500_000)).toBe(true);
 expect(one("SELECT SUM(amount) n FROM p_card_due WHERE user_id=? AND kind='voucher'",root)!.n).toBe(4_900_000);
 expect(one("SELECT SUM(f.amount) n FROM p_card_flush f JOIN p_card_matches m ON m.id=f.match_id WHERE m.user_id=?",root)!.n).toBe(9_100_000);
 expect(wallet(root).available).toBe(0);expect(wallet(root).pending).toBe(44_800_000);expect(voucherBalance(root)).toBe(0);
 releaseCardRewards(monday+21*DAY);expect(wallet(root).available).toBe(44_800_000);expect(voucherBalance(root)).toBe(4_900_000);
 expect(releaseCardRewards(monday+21*DAY)).toBe(0);
});
it("refuses switching existing financial history to a new topology",()=>{saveSetting("seven_card_position_version","");expect(()=>configurePositions()).toThrow("position_history_review_required");saveSetting("seven_card_position_version","aa-2026-10-06");});
