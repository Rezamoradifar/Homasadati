"use client";
import { useEffect, useState } from "react";
import Localized from "../i18n/Localized";
import { PurchaseActivationReceipt } from "../platform/PurchaseActivationReceipt";
import { api, type RecordData } from "../platform/client";
import { CheckCircle, XCircle, Clock } from "@phosphor-icons/react";
import { Money } from "./currency";

type Summary = {
  status: string;
  amount: number;
  reference: string | null;
  orders: string[];
  checkoutPaid: boolean;
  activationReceipt?: RecordData | null;
  paidPurchaseVolume?: number;
};
type PaymentTarget = {
  checkoutId: string;
  pid: string;
  provider: "bale" | "digipay";
};
const paymentId = /^[0-9a-f-]{36}$/i;

async function readSummary(target: PaymentTarget, verify: boolean): Promise<Summary> {
  if (target.checkoutId) {
    const group = await api(`checkouts/${target.checkoutId}`);
    return {
      status: group.status === "paid" && group.orders.length && group.orders.every((order: { status: string }) => order.status === "refunded")
        ? "refunded"
        : group.status,
      amount: group.amount,
      reference: group.payment_ref,
      orders: group.orders.map((order: { id: string }) => order.id),
      checkoutPaid: group.status === "paid",
      activationReceipt: group.activationReceipt,
      paidPurchaseVolume: group.paidPurchaseVolume,
    };
  }
  const path = `payments/${target.provider}/${target.pid}`;
  return (verify ? await api(`${path}/verify`, "POST", {}) : await api(path)) as unknown as Summary;
}

/** Only the authenticated server's verified transaction and checkout state can
 * show success. Provider names in the return URL select an endpoint, not a result. */
export default function PaymentResult() {
  const [target, setTarget] = useState<PaymentTarget | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutId = params.get("checkout") || "";
    const pid = params.get("pid") || "";
    const provider = params.get("provider") || "bale";
    if (paymentId.test(checkoutId)) {
      setTarget({ checkoutId, pid: "", provider: "bale" });
    } else if (paymentId.test(pid) && (provider === "bale" || provider === "digipay")) {
      setTarget({ checkoutId: "", pid, provider });
    } else {
      setError("شناسهٔ پرداخت در نشانی معتبر نیست.");
    }
  }, []);

  useEffect(() => {
    if (!target) return;
    let tries = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (stopped) return;
      try {
        const result = await readSummary(target, tries > 0);
        if (stopped) return;
        setSummary(result);
        setError("");
        tries++;
        const awaitingSettlement = result.status === "paid" && !result.checkoutPaid;
        if ((["pending", "creating"].includes(result.status) || awaitingSettlement) && tries < 6) {
          timer = setTimeout(load, tries === 1 ? 1500 : 5000);
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [target]);

  const recheck = async () => {
    if (!target || checking) return;
    setChecking(true);
    setError("");
    try {
      setSummary(await readSummary(target, true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };
  const isCheckout = !!target?.checkoutId;
  const isDigiPay = target?.provider === "digipay";
  const confirmedPaid = summary?.status === "paid" && summary.checkoutPaid;
  const needsReview = summary?.status === "review";
  const view =
    !summary
      ? {
          tone: "pending",
          title: "در حال بررسی تراکنش",
          text: isDigiPay
            ? "تأیید پرداخت دیجی‌پی و وضعیت سفارش را از سامانه بررسی می‌کنیم."
            : isCheckout || !target
              ? "نتیجهٔ تأیید پرداخت و سفارش شما را از سامانه بررسی می‌کنیم."
              : "وضعیت پرداخت را مستقیماً از بله استعلام می‌کنیم؛ لطفاً صفحه را نبندید.",
        }
      : confirmedPaid
        ? { tone: "ok", title: "پرداخت موفق", text: "پرداخت شما تأیید شد و سفارش ثبت شد." }
        : summary.status === "refunded"
          ? {
              tone: "bad",
              title: "وجه سفارش بازگشت",
              text: isDigiPay
                ? "وضعیت بازگشت اعتبار یا وجه را در دیجی‌پی و جزئیات سفارش پیگیری کنید."
                : "وضعیت بازگشت وجه را در کیف پول و سفارش‌های حساب بررسی کنید.",
            }
          : summary.status === "cancelled"
            ? {
                tone: "bad",
                title: "پرداخت لغو شد",
                text: isDigiPay
                  ? "پرداخت دیجی‌پی لغو شده است. پیش از تلاش دوباره، وضعیت اعتبار و سفارش خود را بررسی کنید."
                  : "پرداخت انجام نشد و مبلغی از حساب شما برداشت نشده است. می‌توانید دوباره از سبد خرید پرداخت کنید.",
              }
            : summary.status === "failed" || summary.status === "request_failed"
              ? {
                  tone: "bad",
                  title: "پرداخت ناموفق",
                  text: isDigiPay
                    ? "پرداخت دیجی‌پی تأیید نشد. اگر از اعتبار یا موجودی شما کسر شده، وضعیت را در دیجی‌پی و سفارش‌های هما بررسی کنید و با پشتیبانی تماس بگیرید."
                    : "تراکنش تأیید نشد. اگر مبلغی از حساب شما کم شده، طبق قوانین بانکی حداکثر ظرف ۷۲ ساعت برمی‌گردد؛ در غیر این صورت با پشتیبانی تماس بگیرید.",
                }
              : needsReview
                ? {
                    tone: "pending",
                    title: "پرداخت نیاز به بررسی دارد",
                    text: "تطبیق این پرداخت نیاز به بررسی پشتیبانی دارد. دوباره پرداخت نکنید و شناسهٔ سفارش را برای پیگیری نگه دارید.",
                  }
                : {
                    tone: "pending",
                    title: "در حال بررسی تراکنش",
                    text: isDigiPay
                      ? "پرداخت دیجی‌پی هنوز تأیید نشده است. برای جلوگیری از پرداخت تکراری، نتیجهٔ همین سفارش را دوباره بررسی کنید."
                      : isCheckout
                        ? "پرداخت هنوز تأیید نشده است. نتیجه را دوباره بررسی کنید یا از سبد خرید ادامه دهید."
                        : "نتیجهٔ تراکنش هنوز از بله دریافت نشده است. سفارش شما محفوظ است و به‌محض تأیید، ثبت می‌شود.",
                  };
  return (
    <Localized>
      <div className="shop-wrap payment-result">
        <section className={"payment-result-card " + view.tone} aria-live="polite" aria-busy={(!summary && !error) || checking}>
          <span className="payment-result-icon" aria-hidden="true">
            {view.tone === "ok" ? <CheckCircle size={42} /> : view.tone === "bad" ? <XCircle size={42} /> : <Clock size={42} />}
          </span>
          <span className="commerce-eyebrow">{isDigiPay ? "خرید با اعتبار دیجی‌پی" : isCheckout || !target ? "نتیجهٔ پرداخت سفارش" : "پرداخت با بله"}</span>
          <h1>{view.title}</h1>
          <p>{view.text}</p>
          {summary && (
            <dl>
              <div>
                <dt>مبلغ</dt>
                <dd><Money toman={summary.amount} /></dd>
              </div>
              {summary.orders.length > 0 && (
                <div>
                  <dt>شمارهٔ سفارش</dt>
                  <dd dir="ltr" translate="no">{summary.orders.join("، ")}</dd>
                </div>
              )}
              {summary.reference && (
                <div>
                  <dt>شناسهٔ تراکنش</dt>
                  <dd dir="ltr" translate="no">{summary.reference}</dd>
                </div>
              )}
            </dl>
          )}
          {confirmedPaid && summary.paidPurchaseVolume !== undefined && (
            <p className="payment-volume">حجم خرید پرداخت‌شده: <Money toman={summary.paidPurchaseVolume} /><br />خرید واجد شرایط طبق زمان‌بندی و قوانین باشگاه محاسبه می‌شود.</p>
          )}
          {confirmedPaid && <PurchaseActivationReceipt receipt={summary.activationReceipt} />}
          {error && <p role="alert">{error}</p>}
          <div className="payment-result-actions">
            {view.tone === "ok" && <a className="commerce-button" href="/account?tab=orders">مشاهدهٔ سفارش‌ها</a>}
            {view.tone === "pending" && target && (
              <button className="commerce-button" disabled={checking} onClick={recheck}>
                {checking ? "در حال بررسی…" : "بررسی دوباره"}
              </button>
            )}
            {(needsReview || (isDigiPay && view.tone === "bad")) && (
              <a className="commerce-button outline" href="/account?tab=tickets">پیگیری از پشتیبانی</a>
            )}
            {view.tone === "bad" && <a className="commerce-button" href="/cart">بازگشت به سبد خرید</a>}
            {view.tone === "pending" && isCheckout && <a className="commerce-button outline" href="/cart">ادامه پرداخت از سبد خرید</a>}
            {error && <a className="commerce-button outline" href="/account">ورود به حساب</a>}
            <a className="commerce-button outline" href="/shop">ادامهٔ خرید</a>
          </div>
        </section>
      </div>
    </Localized>
  );
}
