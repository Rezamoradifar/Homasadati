"use client";
import Registration from "./Registration";
import { useState } from "react";
import { api, RecordData } from "./client";
import { Form, Field, Notice } from "./Widgets";
export default function AuthPanel({
  onLogin,
  admin = false,
}: {
  onLogin: (u: RecordData) => void;
  admin?: boolean;
}) {
  const [mode, setMode] = useState("login"),
    [otp, setOtp] = useState(false),
    [challenge, setChallenge] = useState(""),
    [target, setTarget] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const needsCode = mode !== "login" || otp;
  const fields: Field[] = [
    {
      name: "target",
      label: "ایمیل یا شماره موبایل",
      hint: "موبایل با پیش‌شماره کشور؛ مانند ‎+98912…",
    },
    ...(mode === "register"
      ? [
          { name: "name", label: "نام و نام خانوادگی" },
          { name: "referral", label: "کد معرف (اختیاری)", required: false },
        ]
      : []),
    ...(!otp || mode !== "login"
      ? [
          {
            name: "password",
            label: mode === "reset" ? "رمز جدید" : "رمز عبور",
            type: "password",
            hint: "حداقل ۱۲ نویسه",
          },
        ]
      : []),
    ...(needsCode ? [{ name: "code", label: "کد تأیید شش‌رقمی", max: 6 }] : []),
    ...(mode !== "register"
      ? [
          {
            name: "totp",
            label: "کد دومرحله‌ای (اگر فعال است)",
            required: false,
            max: 6,
          },
        ]
      : []),
  ];
  if(mode==="register")return <Registration onLogin={onLogin} onBack={()=>setMode("login")}/>;
  return (
    <div className="portal-card portal-auth">
      <p style={{ color: "#8d764e" }}>
        همای سعادت / {admin ? "مدیریت مجموعه" : "باشگاه همراهان"}
      </p>
      <h1>
        {mode === "register"
          ? "عضویت در همای سعادت"
          : mode === "reset"
            ? "بازیابی دسترسی"
            : admin
              ? "ورود مدیران"
              : "خوش آمدید"}
      </h1>
      <p>سفارش‌ها، همراهان و امور مالی خود را یک‌جا مدیریت کنید.</p>
      <div className="portal-tabs" role="tablist" aria-label="روش دسترسی">
        {[
          ["login", "ورود"],
          ...(!admin ? [["register", "ثبت‌نام"]] : []),
          ["reset", "بازیابی رمز"],
        ].map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={mode === k}
            onClick={() => {
              setMode(k);
              setChallenge("");
              setNotice("");
              setError("");
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {mode === "login" && (
        <label className="portal-row" style={{ marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={otp}
            onChange={(e) => setOtp(e.target.checked)}
          />{" "}
          ورود با کد یک‌بارمصرف
        </label>
      )}
      {needsCode && (
        <div className="portal-card">
          <label>
            گیرندهٔ کد
            <input
              style={{
                width: "100%",
                padding: 12,
                border: "1px solid #b6c4b7",
                marginBlock: 10,
              }}
              aria-label="گیرندهٔ کد"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              dir="ltr"
            />
          </label>
          <button
            className="portal-button"
            disabled={busy || !target}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await api("auth/otp", "POST", {
                  target,
                  purpose: mode,
                });
                setChallenge(r.challenge);
                setNotice(
                  "کد ارسال شد و پنج دقیقه اعتبار دارد. همان گیرنده را در فرم وارد کنید.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "در حال ارسال…" : "ارسال کد"}
          </button>
        </div>
      )}
      <Notice error={error} success={notice} />
      <Form
        key={mode + String(otp) + challenge}
        fields={fields}
        initial={{
          target,
          referral:
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("ref") || ""
              : "",
        }}
        submit={mode === "reset" ? "تغییر رمز" : "ادامه"}
        onSubmit={async (d) => {
          const payload: RecordData = {
            ...d,
            ...(needsCode ? { challenge } : {}),
            ...(!d.totp ? { totp: undefined } : {}),
          };
          if (mode === "login" && otp) delete payload.password;
          const r = await api("auth/" + mode, "POST", payload);
          if (mode === "reset") {
            setMode("login");
            setNotice("رمز تغییر کرد. دوباره وارد شوید.");
          } else onLogin(r.user);
        }}
      />
      <p className="portal-notice">
        کد تأیید و رمز عبور را در اختیار دیگران قرار ندهید.
      </p>
    </div>
  );
}
