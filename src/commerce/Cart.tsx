"use client";

import { Money, UsdNote } from "./currency";
import {useSiteLocale} from "../i18n/SiteLocale";
import {catalogCopy} from "../i18n/catalog";
import Localized from "../i18n/Localized";
import { useEffect, useState, useRef } from "react";
import { api, amount, RecordData } from "../platform/client";
import { useBasket, writeBasket } from "./basket";
export default function Cart() {
  const {locale}=useSiteLocale();
  const { items, ready } = useBasket(),
    [quote, setQuote] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [me, setMe] = useState<RecordData | null>(null),
    [addresses, setAddresses] = useState<RecordData[]>([]),
    [address, setAddress] = useState(""),
    [method, setMethod] = useState("zarinpal"),
    [pending, setPending] = useState(""),
    [done, setDone] = useState(false),
    [revision, setRevision] = useState(0);
  const version = JSON.stringify(items),
    lock = useRef(false);
  useEffect(() => {
    api("me")
      .then((r) => {
        setMe(r.user);
        return api("addresses");
      })
      .then((r) => setAddresses(r.rows))
      .catch((e) => {
        if (e.message !== "برای ادامه وارد حساب شوید.") setError(e.message);
      });
    try {
      setPending(sessionStorage.getItem("homa-pending-checkout") || "");
    } catch {}
  }, []);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setQuote(null);
    if (!items.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api("cart/quote", "POST", { items })
      .then((r) => {
        if (live) setQuote(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [version, ready, revision]);
  const edit = (id: string, quantity: number) => {
    try {
      writeBasket(
        quantity
          ? items.map((x) => (x.productId === id ? { ...x, quantity } : x))
          : items.filter((x) => x.productId !== id),
      );
    } catch {
      setError("ذخیره سبد در مرورگر ممکن نشد.");
    }
  };
  const pay = async (id: string) => {
    const state = await api(`checkouts/${id}`);
    if (state.status === "paid") {
      setDone(true);
      setPending("");
      sessionStorage.removeItem("homa-pending-checkout");
      return;
    }
    const result = await api(`checkouts/${id}/payment`, "POST", {});
    window.location.assign(result.url);
  };
  const checkout = async () => {
    if (lock.current || !quote) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = {
        items,
        method,
        expectedTotal: quote.total,
        ...(quote.requiresAddress ? { addressId: address } : {}),
      };
      const signature = JSON.stringify(payload);
      let saved;
      try {
        saved = JSON.parse(
          sessionStorage.getItem("homa-checkout-key") || "null",
        );
      } catch {}
      const idempotencyKey =
        saved?.signature === signature ? saved.key : crypto.randomUUID();
      sessionStorage.setItem(
        "homa-checkout-key",
        JSON.stringify({ signature, key: idempotencyKey }),
      );
      const c = await api("checkouts", "POST", { ...payload, idempotencyKey });
      setPending(c.id);
      sessionStorage.setItem("homa-pending-checkout", c.id);
      sessionStorage.removeItem("homa-checkout-key");
      writeBasket([]);
      await pay(c.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Localized><div className="shop-wrap">
      <div className="shop-heading">
        <span className="commerce-eyebrow">یک سبد برای همهٔ خانوادهٔ همای</span>
        <h1>سبد خرید شما</h1>
        <p>تعداد، مشخصات و مبلغ را پیش از ثبت سفارش بررسی کنید.</p>
      </div>
      {error && (
        <div className="shop-error" role="alert">
          {error}
          <button
            className="commerce-button outline"
            onClick={() => setRevision((x) => x + 1)}
          >
            بررسی دوباره
          </button>
        </div>
      )}
      {done && (
        <p role="status" className="shop-notice">
          پرداخت ثبت شد. <a href="/account?tab=orders">مشاهده سفارش‌ها ←</a>
        </p>
      )}
      {pending && !done && (
        <section className="shop-notice">
          <p>
            یک سفارش ثبت‌شده برای ادامه پرداخت دارید. اقلام آن در بخش سفارش‌های
            حساب قابل مشاهده‌اند.
          </p>
          <button
            className="commerce-button"
            disabled={busy || !me}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await pay(pending);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            ادامه / بررسی پرداخت
          </button>
          <a href="/account?tab=orders"> پیگیری سفارش‌ها</a>
          <button
            className="cart-remove"
            onClick={() => {
              sessionStorage.removeItem("homa-pending-checkout");
              setPending("");
            }}
          >
            بستن این پیام
          </button>
        </section>
      )}
      {(!ready || loading) && <p role="status">در حال بررسی قیمت و موجودی…</p>}
      {ready && !items.length && !loading && (
        <div className="shop-empty">
          <p>سبد خرید خالی است.</p>
          <a href="/shop" className="commerce-button">
            انتخاب از فروشگاه
          </a>
        </div>
      )}
      {items.length > 0 && (
        <div className="cart-layout">
          <section aria-label="اقلام سبد">
            {items.map((item, i) => {
              const p = quote?.rows.find(
                  (r: RecordData) => r.id === item.productId,
                ),
                img = p ? JSON.parse(p.images)[0] : null;
              const title=p?catalogCopy({title:p.title,details:p.details},locale).title:undefined;
              return (
                <Localized key={item.productId}><article className="cart-row">
                  {img ? <img src={img} alt="" /> : <span>◇</span>}
                  <div>
                    <a href={`/shop/${item.productId}`}>
                      <strong>
                        {title || `مشاهده مشخصات کالای ${i + 1}`}
                      </strong>
                    </a>
                    <p>
                      {p
                        ? <Money toman={p.price}/>
                        : "قیمت نیازمند بررسی است"}
                    </p>
                    <button
                      className="cart-remove"
                      disabled={busy}
                      onClick={() => edit(item.productId, 0)}
                    >
                      حذف از سبد
                    </button>
                  </div>
                  <div>
                    <label>
                      تعداد{" "}
                      <input
                        aria-label={`تعداد ${title || i + 1}`}
                        disabled={busy}
                        type="number"
                        min="1"
                        max="100"
                        value={item.quantity}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n) && n >= 1 && n <= 100)
                            edit(item.productId, n);
                        }}
                      />
                    </label>
                    {p && <p><Money toman={p.lineTotal}/></p>}
                  </div>
                </article></Localized>
              );
            })}
            <a href="/shop">← ادامه خرید</a>
          </section>
          <aside className="cart-summary">
            <h2>جمع سفارش</h2>
            <strong>
              {quote ? <><Money toman={quote.total}/><UsdNote/></> : "در انتظار بررسی"}
            </strong>
            <p>
              هزینه جداگانه ارسال در این نسخه محاسبه نمی‌شود. مالیات یا هزینه‌ای
              پنهان در مرحله پرداخت اضافه نمی‌شود.
            </p>
            {me ? (
              <>
                <label>
                  روش پرداخت
                  <select
                    disabled={busy}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="zarinpal">درگاه بانکی</option>
                    <option value="wallet">کیف پول</option>
                  </select>
                </label>
                {quote?.requiresAddress && (
                  <label>
                    آدرس ارسال
                    <select
                      required
                      disabled={busy}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    >
                      <option value="">آدرس را انتخاب کنید</option>
                      {addresses.map((a) => (
                        <Localized key={a.id}><option translate="no" value={a.id}>
                          {a.label} — {a.city} — {a.address}
                        </option></Localized>
                      ))}
                    </select>
                    <a href="/account?tab=addresses">ثبت / ویرایش آدرس</a>
                  </label>
                )}
                <button
                  className="commerce-button"
                  disabled={
                    busy || !quote || (quote.requiresAddress && !address)
                  }
                  onClick={checkout}
                >
                  {busy ? "در حال ثبت…" : "ثبت سفارش و پرداخت"}
                </button>
              </>
            ) : (
              <>
                <p>
                  برای پرداخت و پیگیری سفارش وارد حساب شوید؛ سبد شما در همین
                  مرورگر باقی می‌ماند.
                </p>
                <a className="commerce-button" href="/account">
                  ورود / ثبت‌نام
                </a>
              </>
            )}
            <p>
              ثبت سفارش، قیمت و موجودی را دوباره کنترل می‌کند. سفارش بانکی
              پرداخت‌نشده حداکثر یک ساعت رزرو می‌ماند. وجه لغو مجاز به کیف پول
              بازمی‌گردد.
            </p>
          </aside>
        </div>
      )}
    </div></Localized>
  );
}
