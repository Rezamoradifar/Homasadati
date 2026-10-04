"use client";
import { useState } from "react";
import { api, amount, date, errors, RecordData } from "./client";
import { DataState, Listing, Modal, Notice, useData } from "./Widgets";

function latinDigits(s:string) {return s.replace(/[۰-۹]/g,c=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g,c=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));}
export function BankPayment({orderId,onChange}:{orderId:string;onChange?:()=>void}) {
  const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const state=useData("bank-payments/orders/"+orderId,revision);
  return <section dir="rtl" className="portal-section">
    <h2>واریز بانکی و ارسال رسید</h2>
    <Notice error={error}/>
    {message && <p role="status">{message}</p>}
    <DataState state={state}>{d=><>
      <p>مبلغ دقیق واریز: <strong>{amount(d.amountRial)} ریال</strong></p>
      <p>{d.destination.bank} — {d.destination.company}</p>
      <p>شماره کارت: <strong dir="ltr" translate="no">{d.destination.card.replace(/(.{4})/g,"$1 ").trim()}</strong></p>
      <button type="button" className="portal-button" onClick={async()=>{try{await navigator.clipboard.writeText(d.destination.card);setMessage("شماره کارت کپی شد.");}catch{setError("شماره کارت را دستی کپی کنید.");}}}>کپی شماره کارت</button>
      <p>شماره حساب اعلام‌شده: <span dir="ltr" translate="no">{d.destination.account}</span></p>
      <p>تماس: {d.destination.contactName} — <a dir="ltr" href={"tel:"+d.destination.phone}>{d.destination.phone}</a></p>
      <p>فقط مبلغ سفارش را به شماره کارت بالا واریز کنید. رسید پس از تطبیق با واریز واقعی توسط مدیر مالی تأیید می‌شود. ارسال رسید به‌تنهایی تأیید پرداخت نیست.</p>
      <p>مهلت ارسال رسید: {date(d.expiresAt)}</p>
      {d.checkoutId && <p>این واریز برای مجموع اقلام سبد است؛ برای هر قلم جداگانه واریز نکنید.</p>}
      {d.receipts.map((r:RecordData)=><div key={r.id}>
        <p>رسید {r.reference} — {r.status==="pending"?"در انتظار بررسی":r.status==="approved"?"تأیید شده":"رد شده"} — {date(r.created_at)}</p>
        {r.reason && <p>{r.reason}</p>}
        <a href={"/api/platform/bank-payments/receipts/"+r.id+"/image"} target="_blank" rel="noreferrer">مشاهده رسید</a>
      </div>)}
      {d.paid ? <p role="status">پرداخت سفارش تأیید شده است.</p> : d.receipts.some((r:RecordData)=>r.status==="pending") ?
        <p role="status">رسید در انتظار بررسی است. مبلغ را دوباره واریز نکنید.</p> : d.payable ?
        <form onSubmit={async e=>{
          e.preventDefault();if(busy)return;
          const f=new FormData(e.currentTarget),file=f.get("receipt") as File;
          if(!file?.size || file.size>5*1024*1024){setError("تصویر رسید باید حداکثر ۵ مگابایت باشد.");return;}
          setBusy(true);setError("");setMessage("");
          try {
            const reference=latinDigits(String(f.get("reference"))).trim();
            if(!/^[A-Za-z0-9-]{3,80}$/.test(reference))throw new Error("شماره پیگیری باید ۳ تا ۸۰ رقم یا حرف لاتین باشد.");
            const time=new Date(String(f.get("transferredAt"))).toISOString();
            const r=await fetch("/api/platform/bank-payments/orders/"+orderId,{method:"POST",credentials:"same-origin",
              headers:{"Content-Type":file.type,"X-Receipt-Reference":reference,"X-Transferred-At":time,"X-Amount-Rial":latinDigits(String(f.get("amountRial"))).replace(/[,٬\s]/g,"")},
              body:file});
            const v=await r.json();if(!r.ok)throw new Error(errors[v.error]??"ثبت رسید انجام نشد.");
            setMessage("رسید ثبت شد و در انتظار تأیید مدیر مالی است.");setRevision(x=>x+1);onChange?.();
          } catch(e){setError((e as Error).message);}finally{setBusy(false);}
        }}>
          <p><label>مبلغ واریزشده به ریال <input name="amountRial" inputMode="numeric" required defaultValue={d.amountRial}/></label></p>
          <p><label>شماره پیگیری واریز <input name="reference" required minLength={3} maxLength={80} inputMode="numeric"/></label></p>
          <p><label>زمان واریز <input name="transferredAt" type="datetime-local" required/></label></p>
          <p><label>تصویر رسید حداکثر ۵ مگابایت <input name="receipt" type="file" accept="image/jpeg,image/png,image/webp" required/></label></p>
          <button disabled={busy} className="portal-button primary">{busy?"در حال ارسال…":"ثبت رسید برای بررسی"}</button>
        </form> : <p>مهلت پرداخت تمام شده یا سفارش لغو شده است. قبل از واریز، وضعیت سفارش را با پشتیبانی بررسی کنید.</p>}
    </>}</DataState>
  </section>;
}
export function AdminBankReceipts({refresh,onChange}:{refresh:number;onChange:()=>void}) {
  const [selected,setSelected]=useState<RecordData|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  return <>
    <h2>رسیدهای واریز بانکی</h2>
    <Listing endpoint="admin/bank-receipts" refresh={refresh} filters={{statuses:["pending","approved","rejected"]}}
      columns={[["name","کاربر"],["reference","پیگیری اعلام‌شده"],["amount","مبلغ سفارش","money"],["status","وضعیت","label"],["created_at","ثبت","date"]]}
      actions={r=><button className="portal-button" onClick={()=>{setSelected(r);setError("");}}>بررسی رسید</button>}/>
    {selected && <Modal title="تطبیق واریز با حساب بانک" onClose={()=>setSelected(null)}>
      <p>کاربر: {selected.name} — مبلغ: {amount(selected.amount*10)} ریال</p>
      <p>پیگیری اعلام‌شده: {selected.reference} — زمان واریز: {date(selected.transferred_at)}</p>
      <p>شناسه سفارش یا سبد: {selected.checkout_id||selected.order_id}</p>
      <a href={"/api/platform/bank-payments/receipts/"+selected.id+"/image"} target="_blank" rel="noreferrer">باز کردن تصویر کامل</a>
      <img src={"/api/platform/bank-payments/receipts/"+selected.id+"/image"} alt="رسید واریز کاربر" style={{maxWidth:"100%",maxHeight:450,objectFit:"contain"}}/>
      <Notice error={error}/>
      {selected.status==="pending"?<form onSubmit={async e=>{
        e.preventDefault();if(busy)return;
        const f=new FormData(e.currentTarget),status=String(f.get("status"));
        setBusy(true);setError("");
        try {
          await api("admin/bank-receipts","PATCH",{id:selected.id,status,reason:f.get("reason"),
            ...(status==="approved"?{bankReference:latinDigits(String(f.get("bankReference"))).trim(),verifiedAmountRial:Number(latinDigits(String(f.get("amountRial"))).replace(/[,٬\s]/g,"")),confirmedInBank:f.get("confirmed")==="on"}:{})});
          setSelected(null);onChange();
        }catch(e){setError((e as Error).message);}finally{setBusy(false);}
      }}>
        <p><label>تصمیم <select name="status"><option value="rejected">رد رسید</option><option value="approved">تأیید واریز</option></select></label></p>
        <p><label>شماره پیگیری قطعی از بانک <input name="bankReference" maxLength={80}/></label></p>
        <p><label>مبلغ مشاهده‌شده در بانک به ریال <input name="amountRial" inputMode="numeric"/></label></p>
        <p><label><input name="confirmed" type="checkbox"/>واریز واقعی را در گردش حساب بانک مشاهده و با این سفارش تطبیق داده‌ام</label></p>
        <p><label>توضیح برای کاربر و گزارش حسابرسی <textarea name="reason" required minLength={3} maxLength={1000}/></label></p>
        <button disabled={busy} className="portal-button primary">ثبت تصمیم</button>
      </form>:<p>{selected.reason} — مرجع قطعی: {selected.bank_reference||"—"}</p>}
    </Modal>}
  </>;
}
