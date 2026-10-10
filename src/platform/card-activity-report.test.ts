// @vitest-environment node
import {beforeAll,afterAll,it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {platformDb,run,now} from "./schema";
import {saveSetting} from "./providers";
import {SEVEN_LEVEL_VERSION} from "./card-levels";
import {cardActivityReport} from "./card-activity-report";
const dir=mkdtempSync(join(tmpdir(),"homay-report-"));
beforeAll(()=>{process.env.DATABASE_PATH=join(dir,'test.sqlite');
 for(const id of ['owner','other']){run("INSERT INTO p_users(id,name,password,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?)",id,id,'unused',id,now(),now(),'test');run('INSERT INTO p_wallets(user_id) VALUES(?)',id);}
 run("INSERT INTO p_products(id,vertical,title,description,subtype,price,stock,published,created_at,updated_at) VALUES('product','craft','Fixture','','standard',10000000,10,1,?,?)",now(),now());
 run("INSERT INTO p_orders(id,user_id,product_id,title,vertical,quantity,unit_price,amount,status,payment_method,policy,expires_at,created_at,paid_at,idem_key) VALUES('order','owner','product','Fixture','craft',1,10000000,10000000,'processing','wallet','{}',?,?,?,'fixture')",now(),now(),now());
 saveSetting('seven_card_position_version',SEVEN_LEVEL_VERSION);
 run("INSERT INTO p_card_position_lots VALUES('l','order','owner',1,'left',60000000,30000000,0,?)",now());
 run("INSERT INTO p_orders SELECT 'order2',user_id,product_id,title,vertical,quantity,unit_price,amount,status,payment_method,NULL,NULL,NULL,policy,cancel_until,expires_at,created_at,paid_at,refunded_at,'fixture2' FROM p_orders WHERE id='order'");
 run("INSERT INTO p_card_position_lots VALUES('r','order2','owner',1,'right',40000000,10000000,0,?)",now());
 run("INSERT INTO p_card_position_lots VALUES('void','order','owner',2,'left',999999,999999,1,?)",now());
 for(const [id,user,kind,amount,voided] of [['cash','owner','cash',4900000,0],['voucher','owner','voucher',4900000,0],['void','owner','cash',999,1],['private','other','cash',999,0]] as const){run('INSERT INTO p_card_matches VALUES(?,?,1,?,1,?,?,?,?)',id,user,'2026-10-04T20:30Z',kind,amount,voided,now());run('INSERT INTO p_card_due(match_id,user_id,kind,amount,release_at) VALUES(?,?,?,?,?)',id,user,kind,amount,'2026-10-18T20:30:00Z');}
 run("INSERT INTO p_card_flush VALUES('cash',1000,'weekly-cap')");
});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it('separates each volume pool, excludes voids, and reports cash and voucher without changing balances',()=>{
 const before=platformDb().prepare("SELECT total_changes() n").get() as {n:number};const r=cardActivityReport('owner',1)!;
 expect(r.positions).toHaveLength(7);expect(r.positions[0].left).toMatchObject({total:60000000,remaining:30000000,consumed:30000000});expect(r.positions[1].left.total).toBe(0);
 expect(r.summary).toMatchObject({pendingCash:4900000,pendingVoucher:4900000,nextRelease:'2026-10-18T20:30:00Z'});
 expect(r.matches.find(m=>m.id==='cash')).toMatchObject({amount:4900000,flushed:1000,status:'pending'});expect(r.matches.some(m=>m.id==='private')).toBe(false);
 expect(platformDb().prepare("SELECT total_changes() n").get()).toEqual(before);
});
it('returns no card report for the legacy mode',()=>{saveSetting('seven_card_position_version','legacy');expect(cardActivityReport('owner',1)).toBeNull();saveSetting('seven_card_position_version',SEVEN_LEVEL_VERSION);});
