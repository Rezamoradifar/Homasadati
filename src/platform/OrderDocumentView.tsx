"use client";

import { useSiteLocale } from "../i18n/SiteLocale";
import type { OrderDocumentData } from "./order-document-types";
import documentCopy from "./order-document-copy.json";
import "./order-document.css";

function Value({ value, missing, ltr = false }: { value: string | number | null | undefined; missing: string; ltr?: boolean }) {
  const present = value !== null && value !== undefined && String(value).trim() !== "";
  return <bdi translate="no" dir={ltr ? "ltr" : "auto"}>{present ? String(value) : missing}</bdi>;
}

export default function OrderDocumentView({ document, variant = "detail" }: {
  document: OrderDocumentData;
  variant?: "detail" | "print";
}) {
  const { locale } = useSiteLocale();
  const copy = documentCopy[locale];
  const { order, customer, shipping } = document;
  const numbers = locale === "en" ? "en-US" : locale === "ar" ? "ar" : "fa-IR";
  const money = (toman: number) => Number.isFinite(toman)
    ? Math.round(toman * 10).toLocaleString(numbers) + " " + copy.rial
    : copy.missing;
  const date = (value: string | null) => {
    if (!value || !Number.isFinite(new Date(value).getTime())) return copy.missing;
    return new Intl.DateTimeFormat(numbers, {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran",
    }).format(new Date(value));
  };
  const status = (copy.statuses as Record<string, string>)[order.status] || order.status;
  const method = (copy.methods as Record<string, string>)[order.paymentMethod] || order.paymentMethod;
  const vertical = (copy.verticals as Record<string, string>)[order.vertical] || order.vertical;
  const warning = order.status === "refunded" ? copy.refundedNote
    : order.status === "cancelled" ? copy.cancelledNote
      : !order.paidAt ? copy.unpaidNote : "";

  return <article className={`order-document order-document--${variant}`} dir={locale === "en" ? "ltr" : "rtl"} lang={locale}>
    <header className="order-document-heading">
      <span>{copy.brand}</span>
      <h2>{copy.title}</h2>
      <p>{copy.description}</p>
    </header>
    {warning && <p className="order-document-warning">{warning}</p>}
    <dl className="order-document-meta">
      <div><dt>{copy.orderId}</dt><dd><Value value={order.id} missing={copy.missing} ltr /></dd></div>
      <div><dt>{copy.createdAt}</dt><dd><Value value={date(order.createdAt)} missing={copy.missing} /></dd></div>
      <div><dt>{copy.status}</dt><dd><Value value={status} missing={copy.missing} /></dd></div>
      <div><dt>{copy.paymentState}</dt><dd>{order.paidAt ? copy.paid : copy.unpaid}</dd></div>
      <div><dt>{copy.paymentMethod}</dt><dd><Value value={method} missing={copy.missing} /></dd></div>
      <div><dt>{copy.paymentRef}</dt><dd><Value value={order.paymentRef} missing={copy.missing} ltr /></dd></div>
      <div><dt>{copy.paidAt}</dt><dd><Value value={date(order.paidAt)} missing={copy.missing} /></dd></div>
    </dl>
    <section className="order-document-section">
      <h3>{copy.customer}</h3>
      <p className="order-document-source">{customer.source === "current_profile" ? copy.currentProfile : copy.snapshot}</p>
      <dl className="order-document-meta">
        <div><dt>{copy.name}</dt><dd><Value value={customer.name} missing={copy.missing} /></dd></div>
        <div><dt>{copy.phone}</dt><dd><Value value={customer.phone} missing={copy.missing} ltr /></dd></div>
      </dl>
    </section>
    <section className="order-document-section">
      <h3>{copy.shipping}</h3>
      {shipping ? <dl className="order-document-meta">
        <div><dt>{copy.addressLabel}</dt><dd><Value value={shipping.label} missing={copy.missing} /></dd></div>
        <div><dt>{copy.country}</dt><dd><Value value={shipping.country} missing={copy.missing} /></dd></div>
        <div><dt>{copy.city}</dt><dd><Value value={shipping.city} missing={copy.missing} /></dd></div>
        <div><dt>{copy.postalCode}</dt><dd><Value value={shipping.postalCode} missing={copy.missing} ltr /></dd></div>
        <div className="order-document-address"><dt>{copy.address}</dt><dd><Value value={shipping.address} missing={copy.missing} /></dd></div>
      </dl> : <p className="order-document-missing">{copy.missingShipping}</p>}
    </section>
    <section className="order-document-section">
      <table className="order-document-items">
        <thead><tr><th scope="col">{copy.product}</th><th scope="col">{copy.quantity}</th><th scope="col">{copy.unitPrice}</th><th scope="col">{copy.amount}</th></tr></thead>
        <tbody><tr>
          <td><strong><Value value={order.title} missing={copy.missing} /></strong><small>{copy.type}: <Value value={vertical} missing={copy.missing} /></small></td>
          <td><Value value={Number.isFinite(order.quantity) ? order.quantity.toLocaleString(numbers) : null} missing={copy.missing} /></td>
          <td><Value value={money(order.unitPrice)} missing={copy.missing} /></td>
          <td><Value value={money(order.amount)} missing={copy.missing} /></td>
        </tr></tbody>
      </table>
      {order.paymentMethod === "digipay" && <dl className="order-document-meta">
        <div><dt>{copy.vatAmount}</dt><dd>{money(order.vatToman ?? 0)}</dd></div>
        <div><dt>{copy.payableAmount}</dt><dd>{money(order.payableToman ?? order.amount)}</dd></div>
      </dl>}
    </section>
  </article>;
}
