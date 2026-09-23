"use client";
import { useState } from "react";
import Localized from "../i18n/Localized";
import { api, date } from "./client";
import { DataState, Form, useData } from "./Widgets";

/** The member's referral code: link, activation state, direct referrals and
 * a form to pick a personal code. */
export function ReferralCard({ refresh }: { refresh: number }) {
  const [version, setVersion] = useState(0),
    [copy, setCopy] = useState("");
  const s = useData("referral", refresh + version);
  return (
    <Localized>
      <div className="portal-card referral-card">
        <h2>کد معرف و لینک دعوت</h2>
        <DataState state={s}>
          {(d) => {
            const link = typeof window !== "undefined" ? window.location.origin + "/account?ref=" + d.code : "";
            return (
              <>
                <div className="referral-code-row">
                  <div>
                    <span>کد معرف شما</span>
                    <strong dir="ltr">{d.code}</strong>
                  </div>
                  <span className={"referral-state " + (d.active ? "on" : "off")}>
                    {d.active ? "فعال" : "غیرفعال"}
                  </span>
                </div>
                {!d.active && d.requiresPurchase && (
                  <p className="portal-notice">
                    کد معرف شما پس از اولین خرید پرداخت‌شده فعال می‌شود و از آن پس افراد می‌توانند با آن عضو
                    شوند.
                  </p>
                )}
                <div className="portal-code" dir="ltr">
                  {link}
                </div>
                <div className="auth-actions">
                  <button
                    className="portal-button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        setCopy("لینک کپی شد.");
                      } catch {
                        setCopy("کپی خودکار ممکن نشد؛ لینک را انتخاب و کپی کنید.");
                      }
                    }}
                  >
                    کپی لینک دعوت
                  </button>
                </div>
                <p role="status">{copy}</p>
                <dl className="referral-stats">
                  <div>
                    <dt>معرفی مستقیم</dt>
                    <dd>{Number(d.directMembers).toLocaleString("fa-IR")}</dd>
                  </div>
                  <div>
                    <dt>معرفی‌های دارای خرید</dt>
                    <dd>{Number(d.directBuyers).toLocaleString("fa-IR")}</dd>
                  </div>
                </dl>
                <h3>انتخاب کد معرف اختصاصی</h3>
                {d.canChange ? (
                  <Form
                    fields={[
                      {
                        name: "code",
                        label: "کد دلخواه",
                        hint: "۴ تا ۴۰ نویسه؛ حروف کوچک انگلیسی، عدد و خط تیره. لینک‌های قبلی همچنان کار می‌کنند.",
                        max: 40,
                      },
                    ]}
                    submit="ثبت کد معرف"
                    onSubmit={async (v) => {
                      await api("referral", "POST", { code: String(v.code).trim().toLowerCase() });
                      setVersion((n) => n + 1);
                    }}
                  />
                ) : (
                  <p className="portal-notice">
                    کد معرف را هر ۳۰ روز یک بار می‌توانید تغییر دهید؛ تغییر بعدی از {date(d.nextChange)}.
                  </p>
                )}
              </>
            );
          }}
        </DataState>
      </div>
    </Localized>
  );
}
