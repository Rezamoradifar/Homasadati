// @vitest-environment node
import {beforeAll,afterAll,beforeEach,it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import Database from "better-sqlite3";
import sharp from "sharp";
import {platformDb,one,all,run,now} from "./schema";
import {saveSetting} from "./providers";
import {createOrder,refundOrder,wallet} from "./finance";
import {createCheckout} from "./checkout";
import {bankDestination,paymentInfo,submitReceipt,reviewReceipt} from "./bank-payments";
import {handle} from "./api";
import {session,SESSION_COOKIE} from "./security";
import {migrateBankTransfer} from "./migrate-bank-transfer";
import {maintenance} from "./maintenance";

const dir=mkdtempSync(join(tmpdir(),"homay-receipts-"));
let user:string,finance:string,other:string,product:string,image:Buffer;
function member(role="user") {
 const id=randomUUID();
 run("INSERT INTO p_users(id,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",id,"Fixture","unused",role,id,now(),now(),"test");
 run("INSERT INTO p_wallets(user_id) VALUES(?)",id);return id;
}
function order() {return createOrder(user,product,1,"bank_transfer",randomUUID());}
function submit(o:Record<string,any>,ref=randomUUID()){return submitReceipt(user,o.id,ref,now(),o.amount*10,Buffer.concat([image,Buffer.from(ref)]));}
function approve(id:string,ref=randomUUID()) {return reviewReceipt(finance,{id,status:"approved",reason:"Verified in bank",bankReference:ref,verifiedAmountRial:1000000,confirmedInBank:true});}
beforeAll(async()=>{
 process.env.DATABASE_PATH=join(dir,"test.sqlite");process.env.APP_ORIGIN="https://bank.test";
 image=await sharp({create:{width:20,height:20,channels:3,background:"white"}}).png().toBuffer();
});
beforeEach(()=>{
 saveSetting("commission_policy",JSON.stringify({directBps:0,levels:[],binaryBps:0,maxPayoutBps:3000,warningBps:5000,criticalBps:8000,withdrawMin:1,withdrawMax:1e9,paused:false}));
 user=member();finance=member("finance");other=member();
 product=randomUUID();
 run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)",product,"Test","Fixture","ai","subscription",100000,20,now(),now());
});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it("stores an unpaid receipt and only settles once after bank verification",()=>{
 const o=order(),r=submit(o);
 expect(one("SELECT paid_at FROM p_orders WHERE id=?",o.id)!.paid_at).toBeNull();
 expect(all("SELECT * FROM p_subscriptions WHERE order_id=?",o.id)).toHaveLength(0);
 expect(()=>refundOrder(o.id,user)).toThrow("receipt_pending");
 expect(()=>reviewReceipt(finance,{id:r.id,status:"approved",reason:"No bank check"})).toThrow();
 const ref=randomUUID();approve(r.id,ref);approve(r.id,ref);
 expect(one("SELECT status FROM p_orders WHERE id=?",o.id)!.status).toBe("processing");
 expect(all("SELECT * FROM p_subscriptions WHERE order_id=?",o.id)).toHaveLength(1);
 expect(wallet(user).available).toBe(0);
 expect(all("SELECT * FROM p_audit WHERE entity_id=? AND action='receipt.approved'",r.id)).toHaveLength(1);
});
it("rejects mismatched amounts, duplicates, ownership violations and self review",()=>{
 const o=order(),ref=randomUUID(),raw=Buffer.concat([image,Buffer.from(ref)]);
 expect(()=>submitReceipt(user,o.id,ref,now(),1,raw)).toThrow("receipt_amount_mismatch");
 const r=submitReceipt(user,o.id,ref,now(),1000000,raw);
 expect(submitReceipt(user,o.id,ref,now(),1000000,raw).id).toBe(r.id);
 expect(()=>paymentInfo(o.id,other)).toThrow("not_found");
 expect(()=>reviewReceipt(other,{id:r.id,status:"rejected",reason:"bad"})).toThrow("forbidden");
 run("UPDATE p_users SET role='finance' WHERE id=?",user);
 expect(()=>reviewReceipt(user,{id:r.id,status:"rejected",reason:"bad"})).toThrow("cannot_review_self");
 const next=order();
 expect(()=>submitReceipt(user,next.id,ref,now(),1000000,Buffer.from("new"))).toThrow("receipt_duplicate");
 expect(()=>submitReceipt(user,next.id,randomUUID(),now(),1000000,raw)).toThrow("receipt_duplicate");
 expect(()=>reviewReceipt(finance,{id:r.id,status:"approved",reason:"bad",bankReference:randomUUID(),verifiedAmountRial:999,confirmedInBank:true})).toThrow("receipt_amount_mismatch");
 expect(one("SELECT paid_at FROM p_orders WHERE id=?",o.id)!.paid_at).toBeNull();
});
it("rejects receipts with a reason and allows a corrected submission",()=>{
 const o=order(),r=submit(o);
 reviewReceipt(finance,{id:r.id,status:"rejected",reason:"Unreadable receipt"});
 expect(paymentInfo(o.id,user).receipts[0].reason).toBe("Unreadable receipt");
 expect(one("SELECT paid_at FROM p_orders WHERE id=?",o.id)!.paid_at).toBeNull();
 const corrected=submit(o);approve(corrected.id);
 expect(one("SELECT status FROM p_bank_receipts WHERE id=?",r.id)!.status).toBe("rejected");
});
it("settles the entire cart from one receipt and protects pending inventory from expiry",async()=>{
 const c=createCheckout(user,{items:[{productId:product,quantity:2}],method:"bank_transfer",idempotencyKey:randomUUID(),expectedTotal:200000});
 const o=one("SELECT o.* FROM p_orders o JOIN p_checkout_items i ON o.id=i.order_id WHERE i.checkout_id=?",c.id)!;
 const r=submitReceipt(user,o.id,randomUUID(),now(),2000000,image);
 run("UPDATE p_orders SET expires_at='2000' WHERE id=?",o.id);run("UPDATE p_checkouts SET expires_at='2000' WHERE id=?",c.id);
 await maintenance();
 expect(one("SELECT status FROM p_orders WHERE id=?",o.id)!.status).toBe("pending");
 reviewReceipt(finance,{id:r.id,status:"approved",reason:"Bank verified",bankReference:randomUUID(),verifiedAmountRial:2000000,confirmedInBank:true});
 expect(one("SELECT status FROM p_checkouts WHERE id=?",c.id)!.status).toBe("paid");
 expect(all("SELECT * FROM p_subscriptions WHERE order_id=?",o.id)).toHaveLength(1);
});
it("does not accept expired or cancelled orders and never credits money from their screenshots",()=>{
 const o=order();run("UPDATE p_orders SET expires_at='2000' WHERE id=?",o.id);
 expect(()=>submit(o)).toThrow("payment_expired");refundOrder(o.id,user);
 expect(()=>submit(o)).toThrow("invalid_state");
 expect(wallet(user).available).toBe(0);
});
it("keeps receipt images private, restricts roles, checks origin and decodes actual image bytes",async()=>{
 const o=order();
 const request=(who:string,path:string,method="GET",extra:Record<string,string>={},data?:Buffer)=>new Request("https://bank.test/api/platform/"+path,{method,headers:{cookie:SESSION_COOKIE+"="+session(who,"test"),...extra},...(data?{body:new Uint8Array(data)}:{})});
 const path="bank-payments/orders/"+o.id;
 const headers={"origin":"https://bank.test","content-type":"image/png","x-receipt-reference":randomUUID(),"x-transferred-at":now(),"x-amount-rial":"1000000"};
 const upload=await handle(request(user,path,"POST",headers,image),path.split("/"));
 expect(upload.status).toBe(201);const r=await upload.json();
 const imagePath="bank-payments/receipts/"+r.id+"/image";
 expect((await handle(request(other,imagePath),imagePath.split("/"))).status).toBe(404);
 const good=await handle(request(finance,imagePath),imagePath.split("/"));
 expect(good.status).toBe(200);expect(good.headers.get("cache-control")).toBe("private,no-store");
 expect((await handle(request(other,"admin/bank-receipts"),["admin","bank-receipts"])).status).toBe(403);
 const another=order(),p="bank-payments/orders/"+another.id;
 expect((await handle(request(user,p,"POST",{...headers,origin:"https://evil.test"},image),p.split("/"))).status).toBe(403);
 expect((await handle(request(user,p,"POST",headers,Buffer.from("not image")),p.split("/"))).status).toBe(400);
 expect((await handle(request(user,p,"POST",headers,Buffer.alloc(5*1024*1024+1)),p.split("/"))).status).toBe(413);
 const list=await handle(request(finance,"admin/bank-receipts"),["admin","bank-receipts"]);
 const result=await list.json();expect(result.rows.some((v:any)=>v.id===r.id)).toBe(true);expect(JSON.stringify(result)).not.toContain('"image":');
});
it("prevents reuse of the verified bank reference on another receipt",()=>{
 const r=submit(order()),ref=randomUUID();approve(r.id,ref);
 const next=submit(order());expect(()=>approve(next.id,ref)).toThrow("receipt_duplicate");
 expect(one("SELECT status FROM p_bank_receipts WHERE id=?",next.id)!.status).toBe("pending");
});
it("preserves old rows, dependent references, indexes and checks through repeatable migration",()=>{
 const d=new Database(":memory:");d.pragma("foreign_keys=ON");
 d.exec("CREATE TABLE p_orders(id TEXT PRIMARY KEY,payment_method TEXT CHECK(payment_method IN ('wallet','zarinpal'))); CREATE INDEX old_method ON p_orders(payment_method); CREATE TABLE child(id TEXT REFERENCES p_orders(id)); INSERT INTO p_orders VALUES('existing','wallet'); INSERT INTO child VALUES('existing'); CREATE TABLE p_checkouts(id TEXT PRIMARY KEY,method TEXT CHECK(method IN ('wallet','zarinpal')));");
 migrateBankTransfer(d);migrateBankTransfer(d);
 expect(d.prepare("SELECT * FROM child").all()).toHaveLength(1);
 expect(d.prepare("SELECT * FROM p_orders WHERE id='existing'").get()).toBeTruthy();
 d.prepare("INSERT INTO p_orders VALUES('new','bank_transfer')").run();
 expect(()=>d.prepare("INSERT INTO p_orders VALUES('bad','unknown')").run()).toThrow();
 expect(d.pragma("foreign_key_check")).toEqual([]);expect(d.pragma("foreign_keys",{simple:true})).toBe(1);
 expect(d.prepare("SELECT name FROM sqlite_master WHERE name='old_method'").get()).toBeTruthy();
 d.close();expect(bankDestination.iban).toBeNull();
});
