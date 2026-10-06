"use client";
import { useEffect, useState } from "react";
import Localized from "../i18n/Localized";
import { api } from "../platform/client";
import { CheckCircle, XCircle, Clock } from "@phosphor-icons/react";
import { Money } from "./currency";

type Summary = { status: string; amount: number; reference: string | null; orders: string[]; checkoutPaid: boolean; paidPurchaseVolume?:number };

/** Result of a checkout or Bale payment. The state shown always comes from the server's
 * own verification of the transaction, never from the return URL. */
export default function PaymentResult() {
  const [checkoutId,setCheckoutId]=useState("");
  const [pid, setPid] = useState("");
  const [s, setS] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pid") || "";
    setPid(/^[0-9a-f-]{36}$/i.test(id) ? id : "");
    const checkout=new URLSearchParams(window.location.search).get("checkout")||"";
    setCheckoutId(/^[0-9a-f-]{36}$/i.test(checkout)?checkout:"");
    if (!/^[0-9a-f-]{36}$/i.test(id)&&!/^[0-9a-f-]{36}$/i.test(checkout)) setError("شناسهٔ پرداخت در نشانی نیست.");
  }, []);
  useEffect(() => {
    if (!pid&&!checkoutId) return;
    let tries = 0,
      stop = false;
    const load = async () => {
      try {
        // Still pending on arrival: ask the server to verify with Bale again.
        const group=checkoutId?await api(`checkouts/${checkoutId}`):null;
        const r = group ? {status:group.status==="paid"&&group.orders.length&&group.orders.every((o:{status:string})=>o.status==="refunded")?"refunded":group.status,amount:group.amount,reference:group.payment_ref,orders:group.orders.map((o:{id:string})=>o.id),checkoutPaid:group.status==="paid",paidPurchaseVolume:group.paidPurchaseVolume} : (tries === 0 ? await api(`payments/bale/${pid}`) : await api(`payments/bale/${pid}/verify`, "POST", {})) as unknown as Summary;
        if (stop) return;
        setS(r);
        tries++;
        if (["pending", "creating"].includes(r.status) && tries < 6) setTimeout(load, tries === 1 ? 1500 : 5000);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    load();
    return () => {
      stop = true;
    };
  }, [pid,checkoutId]);
  const recheck = async () => {
    setChecking(true);
    setError("");
    try {
      if(checkoutId){const group=await api(`checkouts/${checkoutId}`);setS({status:group.status==="paid"&&group.orders.length&&group.orders.every((o:{status:string})=>o.status==="refunded")?"refunded":group.status,amount:group.amount,reference:group.payment_ref,orders:group.orders.map((o:{id:string})=>o.id),checkoutPaid:group.status==="paid",paidPurchaseVolume:group.paidPurchaseVolume});}
      else setS((await api(`payments/bale/${pid}/verify`, "POST", {})) as unknown as Summary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };
  const view =
    !s ? { tone: "pending", title: "در حال بررسی تراکنش", text: checkoutId?"نتیجهٔ تأیید پرداخت و سفارش شما را از سامانه بررسی می‌کنیم.":"وضعیت پرداخت را مستقیماً از بله استعلام می‌کنیم؛ لطفاً صفحه را نبندید." }
    : s.status === "paid" ? { tone: "ok", title: "پرداخت موفق", text: "پرداخت شما تأیید شد و سفارش ثبت شد." }
    : s.status === "refunded" ? {tone:"bad",title:"وجه سفارش بازگشت",text:"وضعیت بازگشت وجه را در کیف پول و سفارش‌های حساب بررسی کنید."}
    : s.status === "cancelled" ? { tone: "bad", title: "پرداخت لغو شد", text: "پرداخت انجام نشد و مبلغی از حساب شما برداشت نشده است. می‌توانید دوباره از سبد خرید پرداخت کنید." }
    : s.status === "failed" || s.status === "request_failed" ? { tone: "bad", title: "پرداخت ناموفق", text: "تراکنش تأیید نشد. اگر مبلغی از حساب شما کم شده، طبق قوانین بانکی حداکثر ظرف ۷۲ ساعت برمی‌گردد؛ در غیر این صورت با پشتیبانی تماس بگیرید." }
    : { tone: "pending", title: "در حال بررسی تراکنش", text: checkoutId?"پرداخت هنوز تأیید نشده است. نتیجه را دوباره بررسی کنید یا از سبد خرید ادامه دهید.":"نتیجهٔ تراکنش هنوز از بله دریافت نشده است. سفارش شما محفوظ است و به‌محض تأیید، ثبت می‌شود." };
  return (
    <Localized>
      <div className="shop-wrap payment-result">
        <section className={"payment-result-card " + view.tone} aria-live="polite" aria-busy={view.tone === "pending"}>
          <span className="payment-result-icon" aria-hidden="true">
            {view.tone === "ok" ? <CheckCircle size={42}/> : view.tone === "bad" ? <XCircle size={42}/> : <Clock size={42}/>}
          </span>
          <span className="commerce-eyebrow">{checkoutId?"نتیجهٔ پرداخت سفارش":"پرداخت با بله"}</span>
          <h1>{view.title}</h1>
          <p>{view.text}</p>
          {s && (
            <dl>
              <div>
                <dt>مبلغ</dt>
                <dd>
                  <Money toman={s.amount} />
                </dd>
              </div>
              {s.orders.length > 0 && (
                <div>
                  <dt>شمارهٔ سفارش</dt>
                  <dd dir="ltr">{s.orders.join("، ")}</dd>
                </div>
              )}
              {s.reference && (
                <div>
                  <dt>شناسهٔ تراکنش</dt>
                  <dd dir="ltr" translate="no">
                    {s.reference}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {s?.status==="paid"&&s.paidPurchaseVolume!==undefined&&<p className="payment-volume">حجم خرید پرداخت‌شده: <Money toman={s.paidPurchaseVolume}/><br/>خرید واجد شرایط طبق زمان‌بندی و قوانین باشگاه محاسبه می‌شود.</p>}
          {error && <p role="alert">{error}</p>}
          <div className="payment-result-actions">
            {view.tone === "ok" && (
              <a className="commerce-button" href="/account?tab=orders">
                مشاهدهٔ سفارش‌ها
              </a>
            )}
            {view.tone === "pending" && s && (
              <button className="commerce-button" disabled={checking} onClick={recheck}>
                {checking ? "در حال بررسی…" : "بررسی دوباره"}
              </button>
            )}
            {view.tone === "bad" && (
              <a className="commerce-button" href="/cart">
                بازگشت به سبد خرید
              </a>
            )}
            {view.tone==="pending"&&checkoutId&&<a className="commerce-button outline" href="/cart">ادامه پرداخت از سبد خرید</a>}
            {error&&<a className="commerce-button outline" href="/account">ورود به حساب</a>}
            <a className="commerce-button outline" href="/shop">
              ادامهٔ خرید
            </a>
          </div>
        </section>
      </div>
    </Localized>
  );
}
