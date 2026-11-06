"use client";
import { useState } from "react";
import Localized from "../i18n/Localized";
import { api } from "./client";
import { Form, Listing, Notice, type Field } from "./Widgets";

const fields: Field[] = [
  { name: "id", label: "شناسهٔ پرداخت هما", max: 36 },
  { name: "trackingCode", label: "شمارهٔ پیگیری دیجی‌پی", max: 160 },
  { name: "type", label: "روش ثبت‌شده در دیجی‌پی", type: "select", options: [
    ["5", "وام / کیف پول اقساطی"], ["13", "اعتبار خرید کوتاه‌مدت"],
    ["0", "درگاه بانکی"], ["11", "کیف پول نقدی دیجی‌پی"], ["24", "کارت اعتباری"],
  ] },
  { name: "reason", label: "دلیل و مرجع پیگیری", max: 200, full: true },
];

export default function DigiPayOperations({ refresh, onChange }: { refresh: number; onChange: () => void }) {
  const [outcome, setOutcome] = useState("");
  return <Localized><section className="portal-card">
    <h2>پیگیری پرداخت‌های دیجی‌پی</h2>
    <p>برای پرداخت نامشخص، شمارهٔ پیگیری و روش پرداخت را از پنل پذیرندگی دیجی‌پی بگیرید. ثبت سفارش فقط پس از تأیید دوبارهٔ دیجی‌پی انجام می‌شود.</p>
    <Listing endpoint="admin/digipay-payments" refresh={refresh}
      filters={{ statuses: ["creating", "pending", "verified", "paid", "review", "request_failed"] }}
      columns={[
        ["id", "شناسهٔ پرداخت هما"], ["name", "کاربر"], ["amount", "مبلغ", "money"],
        ["status", "وضعیت", "status"], ["tracking_code", "شمارهٔ پیگیری دیجی‌پی"],
        ["unresolved_refunds", "برگشت‌های در انتظار", "number"], ["delivery_status", "گزارش تحویل", "status"],
        ["last_error", "نتیجهٔ آخرین پیگیری"], ["created_at", "تاریخ", "date"],
      ]} />
    <h3>استعلام با شمارهٔ پیگیری</h3>
    <Form fields={fields} initial={{ type: "5" }} submit="استعلام از دیجی‌پی" onSubmit={async data => {
      setOutcome("");
      const result = await api("admin/digipay-payments", "POST", { ...data, type: Number(data.type) });
      setOutcome(result.outcome);
      onChange();
    }} />
    {outcome === "paid" && <Notice success="دیجی‌پی پرداخت را تأیید کرد و ثبت سفارش تکمیل شد." />}
    {outcome && outcome !== "paid" && <Notice error="نتیجه هنوز قطعی نیست؛ سفارش را از پنل پذیرندگی و سوابق هما پیگیری کنید." />}
  </section></Localized>;
}
