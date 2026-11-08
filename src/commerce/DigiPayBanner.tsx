"use client";

import { useId } from "react";
import { ArrowUpRight, CreditCard, ShoppingBag } from "lucide-react";
import { useSiteLocale } from "../i18n/SiteLocale";
import copy from "./digipay-banner-copy.json";
import "./digipay-banner.css";

export default function DigiPayBanner({ variant }: { variant: "home" | "shop" | "guide" }) {
  const { locale } = useSiteLocale();
  const headingId = useId();
  const text = copy[locale];
  if (variant === "guide") return <aside className="digipay-art-banner digipay-art-banner--guide" dir={locale === "en" ? "ltr" : "rtl"} aria-labelledby={headingId}>
    <div className="digipay-credit-card">
      <div className="digipay-credit-card-content">
        <div className="digipay-credit-card-brand"><span className="digipay-credit-card-icon"><CreditCard size={22} aria-hidden="true" /></span><span>DIGIPAY <span aria-hidden="true">×</span> HOMANET</span></div>
        <h2 id={headingId}>{text.cardTitle}</h2>
        <p className="digipay-credit-card-description">{text.cardDescription}</p>
        <div className="digipay-credit-card-actions">
          <a className="digipay-credit-card-button digipay-credit-card-button--primary" href="/shop"><ShoppingBag size={18} aria-hidden="true" />{text.guideAction}</a>
          <a className="digipay-credit-card-button digipay-credit-card-button--secondary" href="https://www.mydigipay.com/bnpl/c-bnpl/" target="_blank" rel="noopener noreferrer">{text.creditAction}<ArrowUpRight size={17} aria-hidden="true" /></a>
        </div>
        <p className="digipay-credit-card-condition">{text.condition}</p>
      </div>
    </div>
  </aside>;
  return <aside className={`digipay-art-banner digipay-art-banner--${variant}`} dir={locale === "en" ? "ltr" : "rtl"} aria-label={text.cardTitle}>
    <a href="/digipay" className="digipay-art-banner-image" aria-label={text.shop}>
      <img src={variant === "home" ? "/assets/digipay-homanet.webp" : "/assets/digipay-installments.webp"} width="1672" height="941" alt="" loading="lazy" decoding="async" />
    </a>
    <div className="digipay-art-banner-caption">
      <p>{text.condition}</p>
      <a href="/digipay">{text.shopAction} <span aria-hidden="true">{locale === "en" ? "→" : "←"}</span></a>
    </div>
  </aside>;
}
