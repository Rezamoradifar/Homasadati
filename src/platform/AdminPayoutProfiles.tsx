"use client";
import { useState } from "react";
import Localized from "../i18n/Localized";
import { api, date, RecordData } from "./client";
import { DataState, Form, Modal, useData } from "./Widgets";

const statusText: Record<string, string> = {
  pending: "در انتظار بررسی",
  verified: "تأییدشده",
  rejected: "ردشده",
};

/** Finance staff check each member's national code, card and IBAN (for
 * example through the bank's name inquiry) before withdrawals are allowed. */
export function AdminPayoutProfiles({ refresh, onChange }: { refresh: number; onChange: () => void }) {
  const [status, setStatus] = useState("pending"),
    [selected, setSelected] = useState<RecordData | null>(null);
  const s = useData("admin/payout-profiles?status=" + status, refresh);
  return (
    <Localized>
      <div className="portal-card">
        <h2>اطلاعات بانکی اعضا</h2>
        <p>
          پیش از تأیید، مطابقت نام صاحب حساب، کد ملی، شماره کارت و شبا را از
          طریق استعلام بانکی بررسی کنید. برداشت فقط به شبای تأییدشده واریز می‌شود.
        </p>
        <label className="payout-filter">
          وضعیت
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">در انتظار بررسی</option>
            <option value="verified">تأییدشده</option>
            <option value="rejected">ردشده</option>
            <option value="">همه</option>
          </select>
        </label>
        <DataState state={s}>
          {(d) =>
            d.rows.length ? (
              <div className="portal-table-wrap">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>عضو</th>
                      <th>صاحب حساب</th>
                      <th>کد ملی</th>
                      <th>شماره کارت</th>
                      <th>شبا</th>
                      <th>وضعیت</th>
                      <th>تاریخ</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r: RecordData) => (
                      <tr key={r.user_id}>
                        <td>
                          {r.name}
                          <br />
                          <small dir="ltr">{r.email || r.phone}</small>
                        </td>
                        <td>{r.holderName}</td>
                        <td dir="ltr">{r.nationalId}</td>
                        <td dir="ltr">{r.cardNumber}</td>
                        <td dir="ltr">{r.iban}</td>
                        <td>{statusText[r.status]}</td>
                        <td>{date(r.updated_at)}</td>
                        <td>
                          {r.status === "pending" && (
                            <button className="portal-button" onClick={() => setSelected(r)}>
                              بررسی
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="portal-empty">موردی برای نمایش نیست.</p>
            )
          }
        </DataState>
        {selected && (
          <Modal title="بررسی اطلاعات بانکی" onClose={() => setSelected(null)}>
            <p>
              {selected.holderName} · کد ملی <span dir="ltr">{selected.nationalId}</span> · شبا{" "}
              <span dir="ltr">{selected.iban}</span>
            </p>
            <Form
              fields={[
                {
                  name: "status",
                  label: "نتیجهٔ بررسی",
                  type: "select",
                  options: [
                    ["verified", "تأیید؛ اطلاعات با هم مطابقت دارد"],
                    ["rejected", "رد؛ نیاز به اصلاح"],
                  ],
                },
                { name: "reason", label: "توضیح برای عضو (برای رد الزامی)", required: false },
              ]}
              submit="ثبت نتیجه"
              onSubmit={async (v) => {
                await api("admin/payout-profiles", "PATCH", { ...v, userId: selected.user_id });
                setSelected(null);
                onChange();
              }}
            />
          </Modal>
        )}
      </div>
    </Localized>
  );
}
