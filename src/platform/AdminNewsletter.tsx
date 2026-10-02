"use client";
import { useState } from "react";
import Localized from "../i18n/Localized";
import { api, date } from "./client";
import { DataState, Notice, useData } from "./Widgets";

const statusText: Record<string, string> = { draft: "پیش‌نویس", sending: "در حال ارسال", sent: "ارسال‌شده" };
const fa = (v: number | null | undefined) => (v || 0).toLocaleString("fa-IR");

/** Compose a newsletter, send a test copy to yourself, then send to everyone
 * subscribed in the site footer. Sending runs in the background worker. */
export function AdminNewsletter({ refresh, onChange }: { refresh: number; onChange: () => void }) {
  const s = useData("admin/newsletter", refresh);
  const [form, setForm] = useState({ subject: "", preheader: "", body: "", buttonLabel: "", buttonUrl: "" });
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState("");
  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
  });
  async function act(label: string, body: object, success: string) {
    setBusy(label);
    setNotice({});
    try {
      const r = await api("admin/newsletter", "POST", body);
      setNotice({ success: typeof success === "string" ? success.replace("{n}", fa(r.queued)).replace("{to}", r.to || "") : "" });
      onChange();
      return r;
    } catch (e) {
      setNotice({ error: e instanceof Error ? e.message : "انجام نشد" });
    } finally {
      setBusy("");
    }
  }
  return (
    <Localized>
      <div className="portal-card newsletter-admin">
        <h2>خبرنامهٔ ایمیلی</h2>
        <p>
          برای کسانی که در پایین صفحهٔ سایت عضو خبرنامه شده‌اند. هر ایمیل پیوند لغو اشتراک با یک کلیک دارد و
          کسی که لغو کرده باشد دیگر ایمیلی دریافت نمی‌کند. ارسال در پس‌زمینه و به‌تدریج انجام می‌شود.
        </p>
        <DataState state={s}>
          {(d) => (
            <>
              <div className="portal-stats">
                <div className="portal-stat">
                  <span>مشترکان فعال</span>
                  <strong>{fa(d.active)}</strong>
                </div>
                <div className="portal-stat">
                  <span>لغو اشتراک</span>
                  <strong>{fa(d.unsubscribed)}</strong>
                </div>
              </div>
              {!d.configured && (
                <Notice error="ارسال ایمیل هنوز تنظیم نشده است؛ کلید Resend و ایمیل فرستنده را در تنظیمات سیستم وارد کنید." />
              )}
              <h3>نوشتن خبرنامهٔ تازه</h3>
              <div className="newsletter-form portal-form">
                <label>
                  موضوع
                  <input maxLength={120} {...field("subject")} />
                </label>
                <label>
                  پیش‌متن (خطی که کنار موضوع در صندوق ایمیل دیده می‌شود)
                  <input maxLength={160} {...field("preheader")} />
                </label>
                <label className="full">
                  متن خبرنامه (هر بند در یک خط)
                  <textarea rows={8} maxLength={8000} {...field("body")} />
                </label>
                <label>
                  متن دکمه (اختیاری)
                  <input maxLength={40} {...field("buttonLabel")} />
                </label>
                <label>
                  نشانی دکمه، مثل ‎/shop
                  <input maxLength={500} dir="ltr" {...field("buttonUrl")} />
                </label>
              </div>
              <button
                className="portal-button"
                disabled={!!busy}
                onClick={async () => {
                  const r = await act("create", { action: "create", campaign: form }, "پیش‌نویس ذخیره شد؛ از فهرست زیر نسخهٔ آزمایشی بفرستید.");
                  if (r) setForm({ subject: "", preheader: "", body: "", buttonLabel: "", buttonUrl: "" });
                }}
              >
                ذخیرهٔ پیش‌نویس
              </button>
              <Notice {...notice} />
              <h3>خبرنامه‌ها</h3>
              <div className="portal-table-wrap">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>موضوع</th>
                      <th>وضعیت</th>
                      <th>ارسال‌شده</th>
                      <th>در صف</th>
                      <th>ناموفق</th>
                      <th>تاریخ</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.campaigns.map((c: Record<string, any>) => (
                      <tr key={c.id}>
                        <td>{c.kind === "welcome" ? "ایمیل خوش‌آمد خبرنامه (خودکار)" : c.subject}</td>
                        <td>{c.kind === "welcome" ? "فعال" : statusText[c.status]}</td>
                        <td>{fa(c.sent)}</td>
                        <td>{fa(c.queued)}</td>
                        <td>{fa(c.failed)}</td>
                        <td>{date(c.sent_at || c.created_at)}</td>
                        <td className="newsletter-actions">
                          <button
                            className="portal-button secondary"
                            disabled={!!busy}
                            onClick={() => act("test" + c.id, { action: "test", id: c.id }, "نسخهٔ آزمایشی به {to} فرستاده شد.")}
                          >
                            ارسال آزمایشی به من
                          </button>
                          {c.status === "draft" && (
                            <button
                              className="portal-button"
                              disabled={!!busy || !d.active}
                              onClick={() => {
                                if (window.confirm(`این خبرنامه برای ${fa(d.active)} مشترک فرستاده شود؟`))
                                  act("send" + c.id, { action: "send", id: c.id }, "{n} ایمیل در صف ارسال قرار گرفت.");
                              }}
                            >
                              ارسال برای همه
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DataState>
      </div>
    </Localized>
  );
}
