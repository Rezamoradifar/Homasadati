"use client";

import { useEffect, useId, useState } from "react";
import { useSiteLocale } from "../i18n/SiteLocale";
import { api } from "./client";
import creditCopy from "./digipay-credit-copy.json";
import "./digipay-credit.css";

const DIGIPAY_APP = "https://app.mydigipay.com/";
const DIGIPAY_CREDIT = "https://www.mydigipay.com/bnpl/c-bnpl/";
const DIGIPAY_LOAN = "https://www.mydigipay.com/credit/c-credit/";
type PaymentAvailability = "loading" | "available" | "unavailable" | "error";

export default function DigiPayCreditPanel({ ordersHref = "/account?tab=orders" }: { ordersHref?: string } = {}) {
  const { locale } = useSiteLocale();
  const copy = creditCopy[locale];
  const uid = useId();
  const [availability, setAvailability] = useState<PaymentAvailability>("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setAvailability("loading");
    api("payment/methods").then(methods => {
      if (current) setAvailability(methods.digipay === true ? "available" : "unavailable");
    }).catch(() => { if (current) setAvailability("error"); });
    return () => { current = false; };
  }, [attempt]);

  const localLinks = [
    ["/digipay", copy.guide],
    ["/shop", copy.shop],
    ["/cart", copy.cart],
    [ordersHref, copy.orders],
  ];

  return <section className="digipay-credit-panel" dir={locale === "en" ? "ltr" : "rtl"} lang={locale} aria-labelledby={`${uid}-title`}>
    <header className="digipay-credit-heading">
      <p className="digipay-credit-eyebrow">{copy.eyebrow}</p>
      <h2 id={`${uid}-title`}>{copy.title}</h2>
      <p>{copy.description}</p>
    </header>

    <div className="digipay-credit-overview">
      <article className="digipay-credit-account" aria-labelledby={`${uid}-account`}>
        <span className="digipay-credit-brand" aria-hidden="true">DigiPay</span>
        <h3 id={`${uid}-account`}>{copy.accountTitle}</h3>
        <p>{copy.accountDescription}</p>
        <div className="digipay-credit-actions">
          <a className="digipay-credit-button digipay-credit-button--primary" href={DIGIPAY_APP} target="_blank" rel="noopener noreferrer">{copy.openApp}<span aria-hidden="true">↗</span></a>
          <a className="digipay-credit-button" href={DIGIPAY_CREDIT} target="_blank" rel="noopener noreferrer">{copy.requestCredit}<span aria-hidden="true">↗</span></a>
          <a className="digipay-credit-text-link" href={DIGIPAY_LOAN} target="_blank" rel="noopener noreferrer">{copy.purchaseLoan}<span aria-hidden="true">↗</span></a>
        </div>
        <p className="digipay-credit-balance-note">{copy.balanceNote}</p>
        <p className="digipay-credit-external-note">{copy.externalNote}</p>
      </article>

      <aside className="digipay-credit-availability" aria-labelledby={`${uid}-status`}>
        <h3 id={`${uid}-status`}>{copy.statusTitle}</h3>
        <div className={`digipay-credit-status digipay-credit-status--${availability}`} role={availability === "error" ? "alert" : "status"} aria-live="polite" aria-atomic="true">
          <span className="digipay-credit-status-dot" aria-hidden="true" />
          <p>{copy.status[availability]}</p>
        </div>
        <p>{copy.statusDescription}</p>
        {availability === "error" && <button className="digipay-credit-button" type="button" onClick={() => { setAvailability("loading"); setAttempt(value => value + 1); }}>{copy.retry}</button>}
      </aside>
    </div>

    <section className="digipay-credit-steps" aria-labelledby={`${uid}-steps`}>
      <h3 id={`${uid}-steps`}>{copy.stepsTitle}</h3>
      <ol>{copy.steps.map((step, index) => <li key={step.title}>
        <span className="digipay-credit-step-number" aria-hidden="true">{(index + 1).toLocaleString(locale)}</span>
        <div><h4>{step.title}</h4><p>{step.body}</p></div>
      </li>)}</ol>
    </section>

    <div className="digipay-credit-explain">
      <section aria-labelledby={`${uid}-renewal`}>
        <h3 id={`${uid}-renewal`}>{copy.renewalTitle}</h3>
        <p>{copy.renewalDescription}</p>
        <p className="digipay-credit-renewal-note">{copy.renewalAction}</p>
      </section>
      <section aria-labelledby={`${uid}-wallet`}>
        <h3 id={`${uid}-wallet`}>{copy.walletTitle}</h3>
        <p>{copy.walletDescription}</p>
      </section>
    </div>

    <nav className="digipay-credit-links" aria-label={copy.linksTitle}>
      {localLinks.map(([href, label]) => <a className="digipay-credit-button" key={href} href={href}>{label}</a>)}
    </nav>

    <section className="digipay-credit-faq" aria-labelledby={`${uid}-faq`}>
      <h3 id={`${uid}-faq`}>{copy.faqTitle}</h3>
      {copy.faqs.map(faq => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
    </section>
  </section>;
}
