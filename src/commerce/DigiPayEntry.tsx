"use client";

import { ArrowLeft, ArrowRight, CreditCard } from "@phosphor-icons/react";
import { useSiteLocale } from "../i18n/SiteLocale";
import guideCopy from "./digipay-guide-copy.json";
import "./digipay-entry.css";

type DigiPayEntryProps = {
  variant?: "banner" | "compact" | "link" | "refund-note";
  className?: string;
  locale?: string;
};

/** The guide is always reachable; available payment methods remain server controlled. */
export default function DigiPayEntry({
  variant = "compact",
  className = "",
  locale: localeOverride,
}: DigiPayEntryProps) {
  const { locale: siteLocale } = useSiteLocale();
  const locale = localeOverride === "en" || localeOverride === "ar" || localeOverride === "fa"
    ? localeOverride
    : siteLocale;
  const copy = guideCopy[locale];
  const Arrow = locale === "en" ? ArrowRight : ArrowLeft;

  if (variant === "link") {
    return <a href="/digipay" className={`digipay-entry-link ${className}`}>{copy.navLabel}</a>;
  }

  if (variant === "refund-note") {
    return <p className={`digipay-refund-note ${className}`}>
      {copy.helpRefundNote}{" "}<a href="/digipay">{copy.entryAction}</a>
    </p>;
  }

  return <aside className={`digipay-entry digipay-entry--${variant} ${className}`}
    aria-label={copy.entryTitle} dir={locale === "en" ? "ltr" : "rtl"}>
    <CreditCard className="digipay-entry-icon" size={27} weight="duotone" aria-hidden="true" />
    <div className="digipay-entry-copy">
      <strong>{copy.entryTitle}</strong>
      <p>{copy.entryDescription}</p>
    </div>
    <a className="digipay-entry-action" href="/digipay">
      {copy.entryAction}<Arrow size={18} aria-hidden="true" />
    </a>
  </aside>;
}
