"use client";
import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import Localized from "../i18n/Localized";
import { api, date } from "./client";
import { DataState, Form, useData } from "./Widgets";

const fa = (v: number) => Number(v || 0).toLocaleString("fa-IR");

/** QR of the invitation link, drawn as one SVG path from the module grid. */
function QrCode({ value }: { value: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    return { size: n + 4, path: d };
  }, [value]);
  return (
    <svg className="referral-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="کد QR لینک دعوت" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#293241" />
    </svg>
  );
}

/** The member's referral code: invitation link with copy, share and QR,
 * activation state, results so far and a form to pick a personal code. */
export function ReferralCard({ refresh }: { refresh: number }) {
  const [version, setVersion] = useState(0),
    [notice, setNotice] = useState("");
  const s = useData("referral", refresh + version);
  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(done);
    } catch {
      setNotice("کپی خودکار ممکن نشد؛ متن را انتخاب و کپی کنید.");
    }
  }
  return (
    <Localized>
      <div className="portal-card referral-card">
        <h2>کد معرف و لینک دعوت</h2>
        <DataState state={s}>
          {(d) => {
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const link = origin + "/register?ref=" + d.code;
            const message = `با کد معرف ${d.code} به باشگاه مشتریان هما نت بپیوندید: ${link}`;
            const rate = d.directMembers ? Math.round((d.directBuyers / d.directMembers) * 100) : 0;
            return (
              <>
                <div className="referral-hero">
                  <div className="referral-hero-code">
                    <span>کد معرف شما</span>
                    <strong dir="ltr" translate="no">
                      {d.code}
                    </strong>
                    <span className={"referral-state " + (d.active ? "on" : "off")}>
                      {d.active ? "فعال؛ آمادهٔ دعوت" : "غیرفعال"}
                    </span>
                    <div className="referral-actions">
                      <button className="portal-button" onClick={() => copy(link, "لینک دعوت کپی شد.")}>
                        کپی لینک دعوت
                      </button>
                      <button className="portal-button secondary" onClick={() => copy(d.code, "کد معرف کپی شد.")}>
                        کپی کد
                      </button>
                      {typeof navigator !== "undefined" && "share" in navigator && (
                        <button
                          className="portal-button secondary"
                          onClick={() => navigator.share({ title: "دعوت به هما نت", text: message, url: link }).catch(() => {})}
                        >
                          اشتراک‌گذاری
                        </button>
                      )}
                    </div>
                    <div className="referral-apps">
                      <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                        واتس‌اپ
                      </a>
                      <a
                        href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("با کد معرف " + d.code + " به باشگاه مشتریان هما نت بپیوندید")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        تلگرام
                      </a>
                      <a href={`sms:?body=${encodeURIComponent(message)}`}>پیامک</a>
                    </div>
                    <p role="status" className="referral-notice">
                      {notice}
                    </p>
                  </div>
                  {link && <QrCode value={link} />}
                </div>
                <div className="portal-code" dir="ltr" translate="no">
                  {link}
                </div>
                {!d.active && d.requiresPurchase && (
                  <p className="portal-notice">
                    کد معرف شما پس از اولین خرید پرداخت‌شده فعال می‌شود و از آن پس افراد می‌توانند با آن عضو شوند.
                  </p>
                )}
                <dl className="referral-stats">
                  <div>
                    <dt>معرفی مستقیم</dt>
                    <dd>{fa(d.directMembers)}</dd>
                  </div>
                  <div>
                    <dt>معرفی‌های دارای خرید</dt>
                    <dd>{fa(d.directBuyers)}</dd>
                  </div>
                  <div>
                    <dt>نرخ تبدیل به خرید</dt>
                    <dd>٪{fa(rate)}</dd>
                  </div>
                  <div>
                    <dt>عضو جدید در ۳۰ روز اخیر</dt>
                    <dd>{fa(d.recentMembers)}</dd>
                  </div>
                </dl>
                {d.latest?.length > 0 && (
                  <>
                    <h3>آخرین دعوت‌شدگان</h3>
                    <ul className="referral-latest">
                      {d.latest.map((m: { name: string; joined: string; bought: boolean }, i: number) => (
                        <li key={i}>
                          <span className="referral-avatar" aria-hidden="true">
                            {m.name.slice(0, 1)}
                          </span>
                          <strong>{m.name}</strong>
                          <small>{new Date(m.joined).toLocaleDateString("fa-IR-u-ca-persian", { day: "numeric", month: "long" })}</small>
                          <em className={m.bought ? "on" : ""}>{m.bought ? "خرید کرده" : "هنوز خریدی ندارد"}</em>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <h3>انتخاب کد معرف اختصاصی</h3>
                {d.canChange ? (
                  <Form
                    fields={[
                      {
                        name: "code",
                        label: "کد دلخواه",
                        hint: "۴ تا ۴۰ نویسه؛ حروف کوچک انگلیسی، عدد و خط تیره، مثل sara-shop. لینک‌های قبلی همچنان کار می‌کنند.",
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
