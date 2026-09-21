"use client";

import GoogleAccess from "./GoogleAccess";
import Localized from "../i18n/Localized";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api, RecordData } from "./client";
import { Form, Notice, useData, DataState, Field } from "./Widgets";
import { RecoveryCodes } from "./RecoveryCodes";
export default function SecurityPanel({ onReauth }: { onReauth: () => void }) {
  const status = useData("security", 0),
    [setup, setSetup] = useState<RecordData | null>(null),
    [codes, setCodes] = useState<string[]>([]),
    [action, setAction] = useState(""),
    [recovery, setRecovery] = useState(false),
    [copied, setCopied] = useState(false);
  if (codes.length)
    return (
      <Localized><div className="portal-card">
        <RecoveryCodes codes={codes} onContinue={onReauth} />
      </div></Localized>
    );
  return (
    <Localized><div className="portal-card security-panel">
      <h2>
        <ShieldCheck size={24} /> امنیت حساب
      </h2>
      <DataState state={status}>
        {(d) => (
          <Localized><>
            {!d.googleLinked?<GoogleAccess intent="link" onComplete={onReauth}/>:<p>حساب گوگل متصل است.</p>}
            <p className={"security-status " + (d.twoFactor ? "enabled" : "")}>
              {d.twoFactor
                ? "ورود دومرحله‌ای فعال است"
                : "ورود دومرحله‌ای هنوز فعال نیست"}
              {d.twoFactor && (
                <span>
                  {" "}
                  · {Number(d.recoveryRemaining).toLocaleString("fa-IR")} کد
                  بازیابی باقی مانده
                </span>
              )}
            </p>
            <p>
              برای تغییر تنظیمات امنیتی، رمز فعلی و در صورت فعال‌بودن رمزساز،
              عامل دوم لازم است. پس از تأیید، همه دستگاه‌ها از حساب خارج
              می‌شوند.
            </p>
            <div className="auth-actions">
              {[
                ...(d.googleLinked?[["google-unlink","قطع اتصال گوگل"]]:[]),
                ["password", "تغییر رمز عبور"],
                ["revoke", "خروج از همه دستگاه‌ها"],
                [
                  "totp-setup",
                  d.twoFactor ? "اتصال رمزساز جدید" : "فعال‌سازی دومرحله‌ای",
                ],
                ...(d.twoFactor
                  ? [
                      ["recovery-regenerate", "کدهای بازیابی جدید"],
                      ["totp-disable", "غیرفعال‌سازی دومرحله‌ای"],
                    ]
                  : []),
              ].map(([key, label]) => (
                <Localized key={key}><button
                  className={
                    "portal-button " + (action === key ? "" : "secondary")
                  }
                  onClick={() => {
                    setAction(key);
                    setSetup(null);
                    setRecovery(false);
                  }}
                >
                  {label}
                </button></Localized>
              ))}
            </div>
            {action && (
              <>
                <h3>{setup ? "تأیید اتصال رمزساز" : "تأیید تغییر امنیتی"}</h3>
                {action === "totp-disable" && (
                  <Notice error="با غیرفعال‌سازی، حفاظت رمزساز از ورود به حساب برداشته می‌شود." />
                )}
                {setup && (
                  <div className="authenticator-setup">
                    <p>
                      این کلید را در برنامه رمزساز به‌عنوان حساب «مبتنی بر زمان»
                      اضافه کنید و کد شش‌رقمی آن را وارد کنید. کلید ۱۰ دقیقه
                      برای فعال‌سازی معتبر است.
                    </p>
                    <code className="auth-secret" dir="ltr">
                      {setup.secret}
                    </code>
                    <div className="auth-actions">
                      <button
                        className="portal-button secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(setup.secret);
                            setCopied(true);
                          } catch {
                            setCopied(false);
                          }
                        }}
                      >
                        {copied ? "کپی شد" : "کپی کلید"}
                      </button>
                      <a href={setup.uri} className="portal-button secondary">
                        باز کردن برنامه رمزساز
                      </a>
                    </div>
                  </div>
                )}
                {!setup && d.twoFactor && (
                  <label className="auth-check">
                    <input
                      type="checkbox"
                      checked={recovery}
                      onChange={(e) => setRecovery(e.target.checked)}
                    />
                    استفاده از کد بازیابی به‌جای رمزساز
                  </label>
                )}
                <Form
                  key={action + String(!!setup) + String(recovery)}
                  submit={setup ? "تأیید و فعال‌سازی" : "تأیید و ادامه"}
                  fields={
                    [
                      {
                        name: "currentPassword",
                        label: "رمز عبور فعلی",
                        type: "password",
                      },
                      ...(action === "password"
                        ? [
                            {
                              name: "newPassword",
                              label: "رمز جدید؛ حداقل ۱۲ نویسه",
                              type: "password",
                              min: 12,
                              max: 128,
                            },
                          ]
                        : []),
                      ...(setup || d.twoFactor
                        ? [
                            {
                              name:
                                !setup && recovery ? "recoveryCode" : "code",
                              label:
                                !setup && recovery
                                  ? "کد بازیابی یک‌بارمصرف"
                                  : setup
                                    ? "کد رمزساز جدید"
                                    : "کد رمزساز فعلی",
                              max: !setup && recovery ? 24 : 6,
                            },
                          ]
                        : []),
                    ] as Field[]
                  }
                  onSubmit={async (values) => {
                    const r = await api("security", "POST", {
                      ...values,
                      action: setup ? "totp-enable" : action,
                    });
                    if (r.secret) {
                      setSetup(r);
                      setCopied(false);
                    } else if (r.recoveryCodes) {
                      setSetup(null);
                      setCodes(r.recoveryCodes);
                    } else if (r.reauthenticate) onReauth();
                  }}
                />
              </>
            )}
          </></Localized>
        )}
      </DataState>
    </div></Localized>
  );
}
