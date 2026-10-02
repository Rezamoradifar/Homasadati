"use client";
import { useEffect, useState } from "react";
import Localized from "../i18n/Localized";
import { api } from "../platform/client";
import { Money } from "./currency";

type Summary = { status: string; amount: number; reference: string | null; orders: string[]; checkoutPaid: boolean };

/** Result of a Bale payment. The state shown always comes from the server's
 * own verification of the transaction, never from the return URL. */
export default function PaymentResult() {
  const [pid, setPid] = useState("");
  const [s, setS] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pid") || "";
    setPid(/^[0-9a-f-]{36}$/i.test(id) ? id : "");
    if (!id) setError("شناسهٔ پرداخت در نشانی نیست.");
  }, []);
  useEffect(() => {
    if (!pid) return;
    let tries = 0,
      stop = false;
    const load = async () => {
      try {
        // Still pending on arrival: ask the server to verify with Bale again.
        const r = (tries === 0 ? await api(`payments/bale/${pid}`) : await api(`payments/bale/${pid}/verify`, "POST", {})) as unknown as Summary;
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
  }, [pid]);
  const recheck = async () => {
    setChecking(true);
    setError("");
    try {
      setS((await api(`payments/bale/${pid}/verify`, "POST", {})) as unknown as Summary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };
  const view =
    !s ? { tone: "pending", title: "در حال بررسی تراکنش", text: "وضعیت پرداخت را مستقیماً از بله استعلام می‌کنیم؛ لطفاً صفحه را نبندید." }
    : s.status === "paid" ? { tone: "ok", title: "پرداخت موفق", text: "پرداخت شما تأیید شد و سفارش ثبت شد." }
    : s.status === "cancelled" ? { tone: "bad", title: "پرداخت لغو شد", text: "پرداخت انجام نشد و مبلغی از حساب شما برداشت نشده است. می‌توانید دوباره از سبد خرید پرداخت کنید." }
    : s.status === "failed" || s.status === "request_failed" ? { tone: "bad", title: "پرداخت ناموفق", text: "تراکنش تأیید نشد. اگر مبلغی از حساب شما کم شده، طبق قوانین بانکی حداکثر ظرف ۷۲ ساعت برمی‌گردد؛ در غیر این صورت با پشتیبانی تماس بگیرید." }
    : { tone: "pending", title: "در حال بررسی تراکنش", text: "نتیجهٔ تراکنش هنوز از بله دریافت نشده است. سفارش شما محفوظ است و به‌محض تأیید، ثبت می‌شود." };
  return (
    <Localized>
      <div className="shop-wrap payment-result">
        <section className={"payment-result-card " + view.tone} aria-live="polite" aria-busy={view.tone === "pending"}>
          <span className="payment-result-icon" aria-hidden="true">
            {view.tone === "ok" ? "✓" : view.tone === "bad" ? "!" : "…"}
          </span>
          <span className="commerce-eyebrow">پرداخت با بله</span>
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
            <a className="commerce-button outline" href="/shop">
              ادامهٔ خرید
            </a>
          </div>
        </section>
      </div>
    </Localized>
  );
}
