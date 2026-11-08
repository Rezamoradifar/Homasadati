"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CreditCard,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  Wallet,
} from "lucide-react";
import { direction } from "../i18n/core";
import { useSiteLocale } from "../i18n/SiteLocale";
import guideCopy from "./digipay-guide-copy.json";
import DigiPayBanner from "./DigiPayBanner";

const CREDIT_GUIDE = "https://www.mydigipay.com/bnpl/c-bnpl/";
const PURCHASE_LOAN_GUIDE = "https://www.mydigipay.com/credit/c-credit/";
const flowIcons = [Wallet, ShoppingBag, PackageCheck];
const volumeIcons = [ShieldCheck, UserRound, CreditCard];

export default function DigiPayGuide() {
  const { locale } = useSiteLocale();
  const copy = guideCopy[locale];
  const Arrow = locale === "en" ? ArrowRight : ArrowLeft;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);

  return (
    <main id="commerce-main" className="digipay-guide" dir={direction(locale)} lang={locale}>
      <header className="digipay-guide-hero">
        <div className="digipay-guide-hero-copy">
          <p className="digipay-guide-eyebrow"><CreditCard size={18} aria-hidden="true" />{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="digipay-guide-lead">{copy.description}</p>
          <div className="digipay-guide-actions">
            <a className="digipay-guide-button digipay-guide-button-primary" href={CREDIT_GUIDE} target="_blank" rel="noopener noreferrer">
              {copy.primaryLabel}<ArrowUpRight size={19} aria-hidden="true" />
            </a>
            <a className="digipay-guide-button digipay-guide-button-secondary" href="/shop">
              {copy.secondaryLabel}<Arrow size={19} aria-hidden="true" />
            </a>
          </div>
          <p className="digipay-guide-hero-note"><ShieldCheck size={19} aria-hidden="true" />{copy.heroNote}</p>
        </div>
        <aside className="digipay-guide-flow" aria-label={copy.heroFlowLabel}>
          <div className="digipay-guide-flow-brand" aria-hidden="true"><CreditCard size={24} /><span>DigiPay <span>×</span> Homanet</span></div>
          <ol>
            {copy.heroFlow.map((item, index) => {
              const Icon = flowIcons[index];
              return <li key={item.title}>
                <span className="digipay-guide-flow-icon"><Icon size={24} aria-hidden="true" /></span>
                <div><strong>{item.title}</strong><p>{item.body}</p></div>
                <span className="digipay-guide-flow-number" aria-hidden="true">{number(index + 1)}</span>
              </li>;
            })}
          </ol>
        </aside>
      </header>

      <DigiPayBanner variant="guide" />

      <nav className="digipay-guide-nav" aria-label={copy.quickNavLabel}>
        {copy.quickNav.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}
      </nav>

      <section id="start" className="digipay-guide-section" aria-labelledby="digipay-start-title">
        <div className="digipay-guide-section-heading"><h2 id="digipay-start-title">{copy.startTitle}</h2><p>{copy.startIntro}</p></div>
        <div className="digipay-guide-paths">
          <article className="digipay-guide-path">
            <span className="digipay-guide-path-badge"><Wallet size={17} aria-hidden="true" />{copy.newCreditBadge}</span>
            <h3>{copy.newCreditTitle}</h3><p>{copy.newCreditBody}</p>
            <ol className="digipay-guide-checklist">
              {copy.newCreditSteps.map((item, index) => <li key={item}><span aria-hidden="true">{number(index + 1)}</span>{item}</li>)}
            </ol>
            <div className="digipay-guide-path-actions">
              <a className="digipay-guide-button digipay-guide-button-primary" href={CREDIT_GUIDE} target="_blank" rel="noopener noreferrer">{copy.newCreditAction}<ArrowUpRight size={18} aria-hidden="true" /></a>
              <a className="digipay-guide-text-link" href={PURCHASE_LOAN_GUIDE} target="_blank" rel="noopener noreferrer">{copy.bankLoanAction}<ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
          </article>
          <article className="digipay-guide-path digipay-guide-path-ready">
            <span className="digipay-guide-path-badge"><ShoppingBag size={17} aria-hidden="true" />{copy.hasCreditBadge}</span>
            <h3>{copy.hasCreditTitle}</h3><p>{copy.hasCreditBody}</p>
            <ul className="digipay-guide-checklist">
              {copy.hasCreditItems.map(item => <li key={item}><span aria-hidden="true"><Check size={16} /></span>{item}</li>)}
            </ul>
            <div className="digipay-guide-path-actions">
              <a className="digipay-guide-button digipay-guide-button-primary" href="/shop">{copy.hasCreditAction}<Arrow size={18} aria-hidden="true" /></a>
              <a className="digipay-guide-text-link" href="/account?tab=profile">{copy.profileAction}<Arrow size={16} aria-hidden="true" /></a>
            </div>
          </article>
        </div>
      </section>

      <section id="purchase" className="digipay-guide-section" aria-labelledby="digipay-purchase-title">
        <div className="digipay-guide-section-heading"><h2 id="digipay-purchase-title">{copy.purchaseTitle}</h2><p>{copy.purchaseIntro}</p></div>
        <ol className="digipay-guide-purchase-steps">
          {copy.purchaseSteps.map((item, index) => <li key={item.title}><span className="digipay-guide-step-number" aria-hidden="true">{number(index + 1)}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></li>)}
        </ol>
        <a className="digipay-guide-text-link" href="/cart">{copy.cartAction}<Arrow size={18} aria-hidden="true" /></a>
      </section>

      <section id="volume" className="digipay-guide-section digipay-guide-volume" aria-labelledby="digipay-volume-title">
        <div className="digipay-guide-section-heading"><h2 id="digipay-volume-title">{copy.volumeTitle}</h2><p className="digipay-guide-volume-lead">{copy.volumeLead}</p></div>
        <div className="digipay-guide-volume-grid">
          {copy.volumeItems.map((item, index) => {
            const Icon = volumeIcons[index];
            return <article key={item.title}><Icon size={25} aria-hidden="true" /><h3>{item.title}</h3><p>{item.body}</p></article>;
          })}
        </div>
        <a className="digipay-guide-text-link" href="/account?tab=orders">{copy.trackingAction}<Arrow size={18} aria-hidden="true" /></a>
      </section>

      <section id="faq" className="digipay-guide-section digipay-guide-faq" aria-labelledby="digipay-faq-title">
        <div className="digipay-guide-section-heading"><h2 id="digipay-faq-title">{copy.faqTitle}</h2></div>
        <div>{copy.faqs.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
      </section>

      <section className="digipay-guide-support" aria-labelledby="digipay-support-title">
        <div><h2 id="digipay-support-title">{copy.supportTitle}</h2><p>{copy.supportBody}</p></div>
        <div className="digipay-guide-actions">
          <a className="digipay-guide-button digipay-guide-button-primary" href="/cart">{copy.cartAction}<Arrow size={18} aria-hidden="true" /></a>
          <a className="digipay-guide-button digipay-guide-button-secondary" href="/account?tab=tickets">{copy.supportAction}</a>
        </div>
      </section>
      <p className="digipay-guide-source">{copy.sourceCaption} <a href={CREDIT_GUIDE} target="_blank" rel="noopener noreferrer">{copy.officialGuideLabel}<ArrowUpRight size={15} aria-hidden="true" /></a></p>
    </main>
  );
}
