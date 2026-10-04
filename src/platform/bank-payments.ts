import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, body, json, limit, sameOrigin } from "../server/http";
import { all, atomic, now, one, run, Row } from "./schema";
import { userOf, audit } from "./security";
import { notify, settleOrder } from "./finance";
import { settleCheckout } from "./checkout";

export const bankDestination = {
  bank: "بانک پارسیان",
  company: "میراث جاویدان و ماندگار ایرانیان",
  card: "6221061249634256",
  account: "123120101381305607",
  contactName: "محمدحسن عامری",
  phone: "+989192370159",
  // Supplied IBAN failed mod-97. Do not present an invalid destination for transfer.
  iban: null,
  method: "card",
};
const referenceSchema = z.string().trim().regex(/^[A-Za-z0-9-]{3,80}$/).transform(v=>v.toUpperCase());
const safeColumns = "id,user_id,order_id,checkout_id,amount,reference,transferred_at,status,reason,reviewed_by,bank_reference,created_at,reviewed_at";
function target(orderId: string, userId: string) {
  const order=one("SELECT * FROM p_orders WHERE id=? AND user_id=?",orderId,userId);
  if (!order) throw new ApiError(404,"not_found");
  if (order.payment_method!=="bank_transfer") throw new ApiError(409,"invalid_state");
  const group=one("SELECT checkout_id FROM p_checkout_items WHERE order_id=?",order.id);
  const checkout=group && one("SELECT * FROM p_checkouts WHERE id=? AND user_id=?",group.checkout_id,userId);
  const rows=checkout ? all("SELECT o.* FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=?",checkout.id) : [order];
  return {order,checkout,rows,amount:checkout?.amount ?? order.amount};
}
function assertPayable(t: ReturnType<typeof target>, checkExpiry: boolean) {
  if (t.rows.some(o=>o.paid_at || o.status!=="pending") || t.checkout?.status==="paid") throw new ApiError(409,"invalid_state");
  if (checkExpiry && t.rows.some(o=>o.expires_at<=now())) throw new ApiError(409,"payment_expired");
}
export function paymentInfo(orderId: string, userId: string) {
  const t=target(orderId,userId);
  const receipts=all(`SELECT ${safeColumns} FROM p_bank_receipts WHERE user_id=? AND (order_id=? OR checkout_id=?) ORDER BY created_at DESC`,userId,t.order.id,t.checkout?.id??"");
  return {destination:bankDestination,orderId:t.order.id,checkoutId:t.checkout?.id??null,amountRial:t.amount*10,
    expiresAt:t.order.expires_at,paid:!!t.order.paid_at,payable:t.rows.every(o=>!o.paid_at && o.status==="pending" && o.expires_at>now()),receipts};
}
export function submitReceipt(userId: string, orderId: string, reference: string, transferredAt: string, amountRial: number, image: Buffer) {
  return atomic(()=>{
    reference=referenceSchema.parse(reference);
    const time=z.string().datetime().parse(transferredAt);
    if (new Date(time).getTime()>Date.now()+300000) throw new ApiError(400,"invalid_input");
    const t=target(orderId,userId); assertPayable(t,true);
    if (!Number.isSafeInteger(amountRial) || amountRial!==t.amount*10) throw new ApiError(400,"receipt_amount_mismatch");
    const hash=createHash("sha256").update(image).digest("hex");
    const pending=one("SELECT * FROM p_bank_receipts WHERE status='pending' AND (order_id=? OR checkout_id=?)",t.order.id,t.checkout?.id??"");
    if (pending) {
      if (pending.reference===reference && pending.image_hash===hash) return {id:pending.id,status:pending.status};
      throw new ApiError(409,"receipt_pending");
    }
    if (one("SELECT id FROM p_bank_receipts WHERE status IN ('pending','approved') AND (reference=? OR image_hash=?)",reference,hash)) throw new ApiError(409,"receipt_duplicate");
    const id=randomUUID();
    run("INSERT INTO p_bank_receipts(id,user_id,order_id,checkout_id,amount,reference,transferred_at,image,image_hash,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,'pending',?)",
      id,userId,t.checkout?null:t.order.id,t.checkout?.id??null,t.amount,reference,time,image,hash,now());
    audit(userId,"receipt.submit",id,null,{orderId:t.order.id,checkoutId:t.checkout?.id,reference,amount:t.amount});
    notify(userId,"رسید واریز ثبت شد","رسید در انتظار تطبیق با واریز بانکی است؛ سفارش هنوز پرداخت‌شده نیست.");
    return {id,status:"pending"};
  });
}
export const receiptReviewSchema=z.object({id:z.string().uuid(),status:z.enum(["approved","rejected"]),reason:z.string().trim().min(3).max(1000),
  bankReference:referenceSchema.optional(),verifiedAmountRial:z.number().int().positive().max(1e13).optional(),confirmedInBank:z.boolean().optional()}).strict()
  .refine(x=>x.status!=="approved" || (!!x.bankReference && !!x.verifiedAmountRial && x.confirmedInBank===true));
export function reviewReceipt(actorId: string, input: z.infer<typeof receiptReviewSchema>) {
  return atomic(()=>{
    const d=receiptReviewSchema.parse(input);
    const r=one("SELECT * FROM p_bank_receipts WHERE id=?",d.id);
    if (!r) throw new ApiError(404,"not_found");
    if (!["finance","superadmin"].includes(one("SELECT role FROM p_users WHERE id=? AND blocked=0",actorId)?.role)) throw new ApiError(403,"forbidden");
    if (r.status!=="pending") {
      if (r.status===d.status && r.reviewed_by===actorId && (d.status!=="approved" || r.bank_reference===d.bankReference)) return {id:r.id,status:r.status};
      throw new ApiError(409,"invalid_state");
    }
    if (actorId===r.user_id) throw new ApiError(403,"cannot_review_self");
    const orderId=r.order_id ?? one("SELECT order_id FROM p_checkout_items WHERE checkout_id=? LIMIT 1",r.checkout_id)?.order_id;
    const t=target(orderId,r.user_id);
    if(d.status==="approved") {
      assertPayable(t,false);
      if (d.verifiedAmountRial!==r.amount*10 || t.amount!==r.amount) throw new ApiError(400,"receipt_amount_mismatch");
      if(one("SELECT id FROM p_bank_receipts WHERE bank_reference=?",d.bankReference) ||
        one("SELECT id FROM p_orders WHERE payment_ref=?","bank:"+d.bankReference) ||
        one("SELECT id FROM p_checkouts WHERE payment_ref=?","bank:"+d.bankReference)) throw new ApiError(409,"receipt_duplicate");
      if(r.checkout_id) settleCheckout(r.checkout_id,"bank:"+d.bankReference);
      else settleOrder(r.order_id,"bank:"+d.bankReference);
    } else {
      // Give the member one day to correct a rejected receipt before releasing inventory.
      const expires=new Date(Date.now()+86400000).toISOString();
      for(const o of t.rows) if(o.status==="pending")run("UPDATE p_orders SET expires_at=? WHERE id=?",expires,o.id);
      if(t.checkout)run("UPDATE p_checkouts SET expires_at=? WHERE id=?",expires,t.checkout.id);
    }
    run("UPDATE p_bank_receipts SET status=?,reason=?,reviewed_by=?,bank_reference=?,reviewed_at=? WHERE id=?",d.status,d.reason,actorId,d.status==="approved"?d.bankReference:null,now(),r.id);
    audit(actorId,"receipt."+d.status,r.id,{status:r.status},{status:d.status,bankReference:d.bankReference,amount:r.amount},d.reason);
    notify(r.user_id,d.status==="approved"?"واریز بانکی تأیید شد":"رسید واریز رد شد",d.reason);
    return {id:r.id,status:d.status};
  });
}
async function readImage(req: Request) {
  if (!["image/jpeg","image/png","image/webp"].includes(req.headers.get("content-type")??""))throw new ApiError(415,"invalid_image");
  const reader=req.body?.getReader(); if(!reader)throw new ApiError(400,"invalid_image");
  const chunks:Uint8Array[]=[];let size=0;
  try {for(;;){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>5*1024*1024){await reader.cancel();throw new ApiError(413,"too_large");}chunks.push(c.value);}}
  finally{reader.releaseLock();}
  try {
    const s=sharp(Buffer.concat(chunks),{limitInputPixels:20_000_000,failOn:"warning"});
    const m=await s.metadata();
    if(!["jpeg","png","webp"].includes(m.format??"") || (m.pages??1)>1)throw new Error("format");
    return await s.rotate().resize({width:2400,height:2400,fit:"inside",withoutEnlargement:true}).webp({quality:92}).toBuffer();
  }catch{throw new ApiError(400,"invalid_image");}
}
export async function bankPayments(req: Request,path: string[]) {
  const admin=path[0]==="admin";
  if(admin) {
    const u=userOf(req,["superadmin","finance"]);
    if(req.method==="GET" && path.length===2) {
      const url=new URL(req.url),page=z.coerce.number().int().min(1).max(100000).parse(url.searchParams.get("page")??1);
      const status=z.enum(["","pending","approved","rejected"]).parse(url.searchParams.get("status")??"");
      const q=z.string().max(200).parse(url.searchParams.get("q")??"");
      const where="WHERE (?='' OR r.status=?) AND (u.name LIKE ? OR r.reference LIKE ? OR r.id LIKE ?)";
      const args=[status,status,"%"+q+"%","%"+q+"%","%"+q+"%"];
      return json({rows:all(`SELECT ${safeColumns.split(",").map(c=>"r."+c).join(",")},u.name FROM p_bank_receipts r JOIN p_users u ON u.id=r.user_id ${where} ORDER BY r.created_at DESC LIMIT 30 OFFSET ?`,...args,(page-1)*30),
        total:one(`SELECT COUNT(*) n FROM p_bank_receipts r JOIN p_users u ON u.id=r.user_id ${where}`,...args)!.n,page,hasMore:one(`SELECT COUNT(*) n FROM p_bank_receipts r JOIN p_users u ON u.id=r.user_id ${where}`,...args)!.n>page*30});
    }
    if(req.method==="PATCH" && path.length===2) {
      sameOrigin(req);limit("receipt-review:"+u.id,60,300);
      return json(reviewReceipt(u.id,receiptReviewSchema.parse(await body(req,65536))));
    }
    throw new ApiError(405,"invalid_input");
  }
  const u=userOf(req);
  if(path[1]==="orders" && path.length===3) {
    const orderId=z.string().uuid().parse(path[2]);
    if(req.method==="GET")return json(paymentInfo(orderId,u.id));
    if(req.method==="POST") {
      sameOrigin(req);limit("receipt-upload:"+u.id,10,300);
      paymentInfo(orderId,u.id);
      const reference=referenceSchema.parse(req.headers.get("x-receipt-reference"));
      const time=z.string().datetime().parse(req.headers.get("x-transferred-at"));
      const amount=z.coerce.number().int().positive().max(1e13).parse(req.headers.get("x-amount-rial"));
      const image=await readImage(req);
      return json(submitReceipt(u.id,orderId,reference,time,amount,image),201);
    }
  }
  if(path[1]==="receipts" && path[3]==="image" && path.length===4 && req.method==="GET") {
    const r=one("SELECT image,user_id FROM p_bank_receipts WHERE id=?",z.string().uuid().parse(path[2]));
    if(!r || (r.user_id!==u.id && !["superadmin","finance"].includes(u.role)))throw new ApiError(404,"not_found");
    return new Response(new Uint8Array(r.image),{headers:{"Content-Type":"image/webp","Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"}});
  }
  throw new ApiError(404,"not_found");
}
