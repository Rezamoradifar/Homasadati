"use client";
import {useEffect} from "react";
import {PurchaseActivationReceipt} from "./PurchaseActivationReceipt";
import {date,RecordData} from "./client";
import {DataState,useData} from "./Widgets";
const descriptions:Record<string,string>={pending:"پرداخت این سفارش هنوز تأیید نشده است.",processing:"پرداخت تأیید شده؛ سفارش در حال آماده‌سازی است.",shipped:"سفارش ارسال شده است.",delivered:"سفارش تحویل شده است.",cancelled:"سفارش لغو شده است.",refunded:"وجه سفارش برگشت داده شده است."};
export function OrderTracking({order,onLoaded}:{order:RecordData;onLoaded?:(current:RecordData)=>void}) {
  const state=useData("orders/"+encodeURIComponent(order.id),0);
  useEffect(()=>{if(state.data)onLoaded?.(state.data);},[state.data,onLoaded]);
  return <DataState state={state}>{current=><section className="order-tracking"><h3>پیگیری سفارش و پرداخت</h3><p>{descriptions[current.status]}</p><ol><li><strong>ثبت سفارش</strong><span>{date(current.created_at)}</span></li><li><strong>{current.paid_at?"پرداخت تأیید شد":"پرداخت تأیید نشده"}</strong><span>{current.paid_at?date(current.paid_at):"در انتظار تأیید پرداخت"}</span></li>{current.refunded_at&&<li><strong>برگشت وجه ثبت شد</strong><span>{date(current.refunded_at)}</span></li>}</ol>{current.payment_ref&&<p>مرجع پرداخت: <bdi translate="no">{current.payment_ref}</bdi></p>}{["cancelled","refunded"].includes(current.status)&&<p className="portal-notice">برای پیگیری دلیل لغو یا برگشت، شناسه سفارش را در تیکت پشتیبانی درج کنید.</p>}<a className="portal-button secondary" href={"/account?tab=tickets&order="+encodeURIComponent(current.id)}>پیگیری از پشتیبانی</a><PurchaseActivationReceipt receipt={current.activationReceipt}/></section>}</DataState>;
}
