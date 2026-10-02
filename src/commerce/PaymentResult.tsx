"use client";
import { useEffect, useState } from "react";
import Localized from "../i18n/Localized";
import { api, type RecordData } from "../platform/client";
import { Money } from "./currency";

type Resolution =
  "order" | "wallet_credit" | "review" | "pending" | "failed" | "cancelled";
type Summary = {
  status: string;
  amount: number;
  reference: string | null;
  orders: string[];
  checkoutPaid: boolean;
  resolution: Resolution;
  botUrl?: string;
};
const resolutions: Resolution[] = [
  "order",
  "wallet_credit",
  "review",
  "pending",
  "failed",
  "cancelled",
];

function summaryFromResponse(value: RecordData): Summary {
  if (
    typeof value.status !== "string" ||
    !Number.isSafeInteger(value.amount) ||
    value.amount < 0 ||
    !Array.isArray(value.orders) ||
    !value.orders.every((order: unknown) => typeof order === "string")
  ) {
    throw new Error("نتیجهٔ پرداخت قابل تأیید نیست. دوباره بررسی کنید.");
  }
  return {
    status: value.status,
    amount: value.amount,
    reference: typeof value.reference === "string" ? value.reference : null,
    orders: value.orders,
    checkoutPaid: value.checkoutPaid === true,
    resolution: resolutions.includes(value.resolution)
      ? value.resolution
      : "pending",
    botUrl: typeof value.botUrl === "string" ? value.botUrl : undefined,
  };
}

function resolvedState(summary: Summary): Resolution {
  if (
    (summary.resolution === "order" &&
      (summary.status !== "paid" || !summary.checkoutPaid)) ||
    (summary.resolution === "wallet_credit" && summary.status !== "paid")
  )
    return "review";
  return summary.resolution;
}

function paymentBotLink(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "ble.ir" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !/^\/Homanets_bot\/?$/i.test(url.pathname) ||
      !/^pay_[A-Za-z0-9_-]+$/.test(url.searchParams.get("start") || "")
    )
      return "";
    return url.href;
  } catch {
    return "";
  }
}

/** Payment and order outcomes come only from the authenticated server summary. */
export default function PaymentResult() {
  const [pid, setPid] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pid") || "";
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      setPid("");
      setError(
        id
          ? "شناسهٔ پرداخت در نشانی معتبر نیست."
          : "شناسهٔ پرداخت در نشانی نیست.",
      );
      return;
    }
    setPid(id);
  }, []);

  useEffect(() => {
    if (!pid) return;
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (!active) return;
      setChecking(true);
      setError("");
      try {
        // Only the server contacts Bale. Manual checks supersede a scheduled poll.
        const response =
          attempts === 0 && revision === 0
            ? await api(`payments/bale/${pid}`)
            : await api(`payments/bale/${pid}/verify`, "POST", {});
        if (!active) return;
        const next = summaryFromResponse(response);
        setSummary(next);
        attempts += 1;
        if (resolvedState(next) === "pending" && attempts < 6) {
          timer = setTimeout(load, attempts === 1 ? 1500 : 5000);
        }
      } catch (cause) {
        if (!active) return;
        const failure = cause as Error & { code?: string };
        if (
          ["unauthorized", "forbidden", "not_found"].includes(
            failure.code || "",
          )
        ) {
          setSummary(null);
        }
        setError(failure.message || "بررسی پرداخت ممکن نشد.");
      } finally {
        if (active) setChecking(false);
      }
    };
    void load();
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [pid, revision]);

  const recheck = () => {
    if (!pid || checking) return;
    setChecking(true);
    setRevision((value) => value + 1);
  };
  const resolution = summary ? resolvedState(summary) : "pending";
  const invalid = pid === "";
  const botUrl =
    resolution === "pending" ? paymentBotLink(summary?.botUrl) : "";
  const view = invalid
    ? {
        tone: "bad",
        title: "نشانی پرداخت معتبر نیست",
        text: "برای مشاهدهٔ نتیجه، از پیوند پرداخت همان سفارش یا بخش سفارش‌های حساب خود استفاده کنید.",
      }
    : error && !summary
      ? {
          tone: "bad",
          title: "بررسی پرداخت ممکن نشد",
          text: "وضعیت پرداخت هنوز مشخص نیست. با حساب خریدار وارد شوید و دوباره بررسی کنید یا از پشتیبانی کمک بگیرید.",
        }
      : !summary
        ? {
            tone: "pending",
            title: "در حال بررسی تراکنش",
            text: "در حال دریافت وضعیت تأییدشدهٔ پرداخت هستیم.",
          }
        : resolution === "order"
          ? {
              tone: "ok",
              title: "پرداخت موفق",
              text: "پرداخت شما تأیید شد و سفارش ثبت شد.",
            }
          : resolution === "wallet_credit"
            ? {
                tone: "ok",
                title: "مبلغ به کیف پول سایت اضافه شد",
                text: "پرداخت پس از بسته‌شدن سفارش تأیید شد و مبلغ آن به کیف پول شما در سایت برگشت. این پرداخت سفارش را دوباره فعال نمی‌کند.",
              }
            : resolution === "review"
              ? {
                  tone: "bad",
                  title: "پرداخت نیاز به بررسی دارد",
                  text: "وضعیت این پرداخت نیاز به بررسی پشتیبانی دارد. اگر مبلغ دوبار کسر شده یا رسید با سفارش مطابقت ندارد، شناسهٔ تراکنش را برای پشتیبانی بفرستید و دوباره پرداخت نکنید.",
                }
              : resolution === "cancelled"
                ? {
                    tone: "bad",
                    title: "پرداخت لغو شد",
                    text: "این تلاش برای پرداخت لغو شده است. اگر مبلغی کسر شده یا رسید پرداخت دارید، پیش از تلاش دوباره از پشتیبانی پیگیری کنید.",
                  }
                : resolution === "failed"
                  ? {
                      tone: "bad",
                      title: "پرداخت تأیید نشد",
                      text: "این پرداخت تأیید نشده است. اگر مبلغی کسر شده یا رسید پرداخت دارید، با پشتیبانی تماس بگیرید و پیش از پرداخت دوباره وضعیت را مشخص کنید.",
                    }
                  : {
                      tone: "pending",
                      title: "در انتظار تأیید پرداخت",
                      text: "منتظر دریافت و تأیید نتیجهٔ پرداخت هستیم. اگر پرداخت را انجام داده‌اید، دوباره پرداخت نکنید و وضعیت را بررسی کنید.",
                    };

  return (
    <Localized>
      <div className="shop-wrap payment-result">
        <section
          className={"payment-result-card " + view.tone}
          aria-live="polite"
          aria-busy={pid === null || checking}
        >
          <span className="payment-result-icon" aria-hidden="true">
            {view.tone === "ok" ? "✓" : view.tone === "bad" ? "!" : "…"}
          </span>
          <span className="commerce-eyebrow">پرداخت با بله</span>
          <h1>{view.title}</h1>
          <p>{view.text}</p>
          {summary && (
            <dl>
              <div>
                <dt>مبلغ</dt>
                <dd>
                  <Money toman={summary.amount} />
                </dd>
              </div>
              {summary.orders.length > 0 && (
                <div>
                  <dt>
                    {resolution === "order"
                      ? "شمارهٔ سفارش"
                      : "سفارش‌های مرتبط با این پرداخت"}
                  </dt>
                  <dd dir="ltr" translate="no">
                    {summary.orders.join("، ")}
                  </dd>
                </div>
              )}
              {summary.reference && (
                <div>
                  <dt>شناسهٔ تراکنش</dt>
                  <dd dir="ltr" translate="no">
                    {summary.reference}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {botUrl && (
            <p>
              ربات Homanets_bot را در بله باز کنید. اگر «شروع / Start» نمایش
              داده شد، آن را بزنید، صورتحساب را پرداخت کنید و از پیوند نتیجه به
              سایت برگردید.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="payment-result-actions">
            {resolution === "order" && summary && (
              <a className="commerce-button" href="/account?tab=orders">
                مشاهدهٔ سفارش‌ها
              </a>
            )}
            {resolution === "wallet_credit" && summary && (
              <a className="commerce-button" href="/account?tab=wallet">
                مشاهدهٔ کیف پول
              </a>
            )}
            {botUrl && (
              <a
                className="commerce-button"
                href={botUrl}
                rel="noopener noreferrer"
              >
                ادامهٔ پرداخت در بله
              </a>
            )}
            {pid && resolution === "pending" && (
              <button
                className="commerce-button"
                disabled={checking}
                onClick={recheck}
              >
                {checking ? "در حال بررسی…" : "بررسی دوباره"}
              </button>
            )}
            {(resolution === "failed" || resolution === "cancelled") &&
              summary && (
                <a className="commerce-button outline" href="/cart">
                  بازگشت به سبد خرید
                </a>
              )}
            {invalid && (
              <a className="commerce-button" href="/account?tab=orders">
                مشاهدهٔ سفارش‌ها
              </a>
            )}
            {error && !summary && !invalid && (
              <a className="commerce-button outline" href="/account">
                ورود به حساب خریدار
              </a>
            )}
            {(resolution === "review" ||
              resolution === "failed" ||
              resolution === "cancelled" ||
              error) && (
              <a
                className="commerce-button outline"
                href="/account?tab=tickets"
              >
                پیگیری از پشتیبانی
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
