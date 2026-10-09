// @vitest-environment node
import {beforeAll,afterAll,afterEach,it,expect,vi} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {platformDb,run,one,now} from "./schema";
import {manageCompanyMember,companyCredit,companyPositionStatus,reviewCompanyPositions} from "./company-members";
import {saveSetting} from "./providers";
import {positionDesks} from "./card-positions";
import {createOrder,settleOrder,refundOrder,wallet} from "./finance";
import {createCheckout} from "./checkout";
import {session} from "./security";
import {runCardSettlement} from "./seven-card-engine";
const dir=mkdtempSync(join(tmpdir(),"homay-company-")),M=1000000,DAY=86400000;
let owner:string,product:string;
function member(){const id=randomUUID();run("INSERT INTO p_users(id,name,password,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?)",id,"Test Person","unused",id,now(),now(),"test");run("INSERT INTO p_wallets(user_id) VALUES(?)",id);return id;}
function action(userId:string,action:string,extra:object={}){return manageCompanyMember(owner,{userId,action,reason:"owner request",eventId:randomUUID(),...extra});}
function clock(t=Date.parse('2026-10-06T10:00:00Z')){vi.useFakeTimers();vi.setSystemTime(t);return t;}
function buy(user:string,amount:number,method='zibal'){run('UPDATE p_products SET price=? WHERE id=?',amount,product);const live=one("SELECT value FROM p_settings WHERE key='seven_card_live'")!.value;saveSetting('seven_card_live','0');try{return settleOrder(createOrder(user,product,1,method,randomUUID()).id,'bank-'+randomUUID());}finally{saveSetting('seven_card_live',live);}}
beforeAll(()=>{process.env.DATABASE_PATH=join(dir,'test.sqlite');owner=member();run("UPDATE p_users SET role='superadmin' WHERE id=?",owner);product=randomUUID();run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,cancel_hours,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",product,"Sale","","tourism","tour",10*M,1000,0,1,now(),now());saveSetting('commission_policy',JSON.stringify({directBps:0,levels:[],binaryBps:0,maxPayoutBps:0,warningBps:5000,criticalBps:8000,withdrawMin:1,withdrawMax:100*M,paused:false}));saveSetting('seven_card_position_version','aa-2026-10-06');saveSetting('seven_card_schedule_version','2026-10-06');saveSetting('seven_card_live','1');saveSetting('seven_card_live_since',String(Date.parse('2026-10-06T09:00:00Z')));saveSetting('seven_card_plan_draft',JSON.stringify({revision:1,decisions:{overflow:'flush',counterScope:'member',voucherCountsTowardCap:true,topology:'own-desks',purchaseCredit:'purchase-value',weekStart:1}}));});
afterEach(()=>vi.useRealTimers());afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it('activates provisional positions but requires 20m of new bank purchases within 35 days',()=>{const t=clock(),u=member();action(u,'positions',{desks:7});expect(positionDesks(u)).toBe(7);buy(u,10*M);expect(companyPositionStatus(u)?.status).toBe('grace');vi.setSystemTime(t+35*DAY);expect(companyPositionStatus(u)?.status).toBe('suspended');expect(positionDesks(u)).toBe(1);reviewCompanyPositions();expect(one('SELECT last_status FROM p_company_positions WHERE user_id=?',u)?.last_status).toBe('suspended');vi.setSystemTime(t+35*DAY+1000);buy(u,10*M);expect(companyPositionStatus(u)?.status).toBe('suspended');expect(positionDesks(u)).toBe(2);});
it('qualifies before deadline, reverses qualification on refund, and never counts prior purchases',()=>{const t=clock(),u=member();vi.setSystemTime(t-DAY);buy(u,30*M);vi.setSystemTime(t);action(u,'positions',{desks:7});expect(companyPositionStatus(u)?.realPurchaseToman).toBe(0);vi.setSystemTime(t+34*DAY);const o=buy(u,20*M);vi.setSystemTime(t+36*DAY);expect(companyPositionStatus(u)?.status).toBe('qualified');refundOrder(o.id,owner,true,'refund');expect(companyPositionStatus(u)?.status).toBe('suspended');});
it('keeps company purchase credit separate, spends atomically, and refunds without creating withdrawable money or plan volume',()=>{const t=clock(),u=member();const eventId=randomUUID();const grant={userId:u,action:'credit',amount:30*M,reason:'gift',eventId};manageCompanyMember(owner,grant);manageCompanyMember(owner,grant);expect(companyCredit(u)).toBe(30*M);expect(()=>manageCompanyMember(owner,{...grant,amount:40*M})).toThrow();action(u,'positions',{desks:3});run('UPDATE p_products SET price=? WHERE id=?',10*M,product);const input={items:[{productId:product,quantity:1}],method:'company_credit' as const,idempotencyKey:randomUUID(),expectedTotal:10*M};const c=createCheckout(u,input);expect(c.status).toBe('paid');createCheckout(u,input);expect(companyCredit(u)).toBe(20*M);expect(wallet(u).available).toBe(0);expect(companyPositionStatus(u)?.realPurchaseToman).toBe(0);const o=one('SELECT o.* FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=?',c.id)!;expect(one('SELECT COUNT(*) n FROM p_commissions WHERE order_id=?',o.id)?.n).toBe(0);runCardSettlement(t+7*DAY);expect(one('SELECT order_id FROM p_card_orders WHERE order_id=?',o.id)).toBeUndefined();refundOrder(o.id,owner,true,'gift refund');expect(companyCredit(u)).toBe(30*M);expect(wallet(u).available).toBe(0);const stock=one('SELECT stock FROM p_products WHERE id=?',product)!.stock;expect(()=>createCheckout(u,{...input,items:[{productId:product,quantity:4}],expectedTotal:40*M,idempotencyKey:randomUUID()})).toThrow();expect(companyCredit(u)).toBe(30*M);expect(one('SELECT stock FROM p_products WHERE id=?',product)!.stock).toBe(stock);expect(()=>createCheckout(u,{...input,idempotencyKey:randomUUID(),useVoucher:true})).toThrow();});
it('archives and restores without deleting transactions, revokes sessions, rejects non-owners and duplicate credit',()=>{clock();const u=member();session(u,'test');buy(u,10*M);expect(()=>manageCompanyMember(u,{userId:owner,action:'credit',amount:M,reason:'no',eventId:randomUUID()})).toThrow();action(u,'archive');expect(one('SELECT blocked FROM p_users WHERE id=?',u)?.blocked).toBe(1);expect(one('SELECT user_id FROM p_sessions WHERE user_id=?',u)).toBeUndefined();expect(one('SELECT id FROM p_orders WHERE user_id=?',u)).toBeTruthy();action(u,'restore');expect(one('SELECT blocked FROM p_users WHERE id=?',u)?.blocked).toBe(0);expect(()=>action(owner,'archive')).toThrow();});

it('keeps only the designated active main administrator permanent after 35 days',()=>{const t=clock();run("INSERT INTO p_company_positions VALUES(?,?,?,?,?,?)",owner,7,now(),new Date(t+35*DAY).toISOString(),owner,'qualified');saveSetting('company_position_permanent_owner',owner);vi.setSystemTime(t+100*DAY);expect(positionDesks(owner)).toBe(7);expect(companyPositionStatus(owner)?.deadline).toBeNull();reviewCompanyPositions();expect(positionDesks(owner)).toBe(7);run("UPDATE p_users SET blocked=1 WHERE id=?",owner);expect(companyPositionStatus(owner)?.status).toBe('suspended');run("UPDATE p_users SET blocked=0 WHERE id=?",owner);});

it('reports manager activation provenance without purchases and hides it for blocked or expired grants',async()=>{
 const {managerActivated}=await import('./company-members');
 const t=clock(),u=member();
 expect(managerActivated(u)).toBe(false);
 action(u,'activate');expect(managerActivated(u)).toBe(true);
 action(u,'archive');expect(managerActivated(u)).toBe(false);
 action(u,'restore');expect(managerActivated(u)).toBe(true);
 const gifted=member();action(gifted,'positions',{desks:3});
 expect(managerActivated(gifted)).toBe(true);
 vi.setSystemTime(t+36*DAY);expect(managerActivated(gifted)).toBe(false);
 expect(one('SELECT COUNT(*) n FROM p_orders WHERE user_id=?',u)!.n).toBe(0);
});

it('recognizes an administrative unblock but not a role-only edit',async()=>{
 const {managerActivated}=await import('./company-members');
 const {audit}=await import('./security');clock();
 const u=member();audit(owner,'user.update',u,{blocked:0,role:'user'},{role:'content'},'role edit');
 expect(managerActivated(u)).toBe(false);
 audit(owner,'user.update',u,{blocked:1},{blocked:false},'activate');
 expect(managerActivated(u)).toBe(true);
});
