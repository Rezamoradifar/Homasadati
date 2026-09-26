"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSiteLocale } from "../i18n/SiteLocale";

/** Prices are stored in toman and paid in rial. USD is a display-only
 * conversion that is offered only while the server has a fresh rate. */
export type Currency = "IRR" | "USD";
export type UsdRate = { rialPerUsd: number; updatedAt: string; source: "auto" | "manual" } | null;
const STORAGE_KEY = "homay-currency";

const CurrencyContext = createContext<{
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  usd: UsdRate;
}>({ currency: "IRR", setCurrency: () => {}, usd: null });

export function CurrencyProvider({ usd, children }: { usd: UsdRate; children: ReactNode }) {
  const [currency, setState] = useState<Currency>("IRR");
  useEffect(() => {
    try {
      if (usd && localStorage.getItem(STORAGE_KEY) === "USD") setState("USD");
    } catch {}
  }, [usd]);
  const setCurrency = (next: Currency) => {
    const value = next === "USD" && usd ? "USD" : "IRR";
    setState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {}
  };
  return (
    <CurrencyContext.Provider value={{ currency: usd ? currency : "IRR", setCurrency, usd }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);

export function useMoney() {
  const { currency, usd } = useCurrency();
  const { locale } = useSiteLocale();
  const numbers = locale === "en" ? "en-US" : "fa-IR";
  const rialLabel = locale === "en" ? "IRR" : locale === "ar" ? "ريال" : "ریال";
  return (rial: number) => {
    if (currency === "USD" && usd) {
      const dollars = rial / usd.rialPerUsd;
      return "≈ $" + dollars.toLocaleString("en-US", { maximumFractionDigits: dollars < 100 ? 2 : 0 });
    }
    return Math.round(rial).toLocaleString(numbers) + " " + rialLabel;
  };
}

/** Renders an amount given in rial (or toman) in the visitor's currency. */
export function Money({ rial, toman }: { rial?: number; toman?: number }) {
  const format = useMoney();
  const value = rial ?? (toman ?? 0) * 10;
  return <bdi>{format(value)}</bdi>;
}

/** Shown next to converted prices: the rate date and that payment stays in rial. */
export function UsdNote() {
  const { currency, usd } = useCurrency();
  const { locale } = useSiteLocale();
  if (currency !== "USD" || !usd) return null;
  const date = new Date(usd.updatedAt).toLocaleDateString(locale === "en" ? "en-US" : "fa-IR");
  const text =
    locale === "en"
      ? `Approximate USD prices at ${usd.rialPerUsd.toLocaleString("en-US")} IRR per dollar (updated ${date}). Payment is made in rial.`
      : locale === "ar"
        ? `أسعار تقريبية بالدولار على أساس ${usd.rialPerUsd.toLocaleString("ar")} ريال للدولار (تحديث ${date}). يتم الدفع بالريال.`
        : `قیمت‌های دلاری تقریبی و بر پایهٔ نرخ ${usd.rialPerUsd.toLocaleString("fa-IR")} ریال برای هر دلار است (به‌روزرسانی ${date}). پرداخت به ریال انجام می‌شود.`;
  return <p className="usd-note">{text}</p>;
}
