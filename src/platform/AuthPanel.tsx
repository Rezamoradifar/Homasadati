"use client";

import Localized from "../i18n/Localized";
import GoogleAccess from "./GoogleAccess";
import Registration from "./Registration";
import { useState, FormEvent, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { api, RecordData } from "./client";
import { Notice } from "./Widgets";
import { useCaptcha } from "./Captcha";
export default function AuthPanel({
  onLogin,
  admin = false,
}: {
  onLogin: (u: RecordData) => void;
  admin?: boolean;
}) {
  const [mode, setMode] = useState("login"),
    [otp, setOtp] = useState(!admin),
    [recovery, setRecovery] = useState(false),
    [challenge, setChallenge] = useState("");
  const [target, setTarget] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [totp, setTotp] = useState(""),
    [recoveryCode, setRecoveryCode] = useState(""),
    [byIdentity, setByIdentity] = useState(false),
    [nationalId, setNationalId] = useState(""),
    [mobile, setMobile] = useState("");
  const identity = mode === "reset" && byIdentity;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [cooldown, setCooldown] = useState(0);
  const sendCaptcha = useCaptcha("otp"),
    submitCaptcha = useCaptcha(mode === "reset" ? "reset" : admin && !otp ? "admin-password-login" : "login");
  const needsCode = mode === "reset" || otp;
  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  function changeMode(next: string) {
    setMode(next);
    setChallenge("");
    setCode("");
    setPassword("");
    setTotp("");
    setRecoveryCode("");
    setError("");
    setNotice("");
    submitCaptcha.reset();
  }
  async function send() {
    if (busy || cooldown || !sendCaptcha.ready) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("auth/otp", "POST", {
        ...(identity ? { nationalId, mobile } : { target }),
        purpose: mode,
        captchaToken: sendCaptcha.token,
      });
      setChallenge(r.challenge);
      setCode("");
      setCooldown(r.retryAfter || 60);
      setNotice(
        identity
          ? "اگر کد ملی و موبایل با یک حساب مطابقت داشته باشد، کد به ایمیل ثبت‌شدهٔ آن حساب ارسال شد؛ ۵ دقیقه اعتبار دارد."
          : "کد به راه تماس واردشده ارسال شد؛ ۵ دقیقه اعتبار دارد.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      sendCaptcha.reset();
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || (!needsCode && !submitCaptcha.ready)) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...(identity ? { nationalId, mobile } : { target }),
        ...(admin && mode === "login" && !otp ? { adminPasswordLogin: true } : {}),
        ...(!otp || mode === "reset" ? { password } : {}),
        ...(needsCode ? { challenge, code } : {}),
        ...(!recovery && totp ? { totp } : {}),
        ...(recovery && recoveryCode ? { recoveryCode } : {}),
        ...(needsCode ? {} : { captchaToken: submitCaptcha.token }),
      };
      const r = await api("auth/" + mode, "POST", payload);
      if (mode === "reset") {
        changeMode("login");
        setNotice("رمز تغییر کرد و نشست‌های قبلی بسته شدند. دوباره وارد شوید.");
      } else onLogin(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      submitCaptcha.reset();
    }
  }
  if (mode === "register")
    return (
      <Localized><Registration onLogin={onLogin} onBack={() => changeMode("login")} /></Localized>
    );
  return (
    <Localized><div className="portal-card portal-auth auth-login" dir="rtl">
      <p className="auth-eyebrow">
        HOMA · {admin ? "ADMIN ACCESS" : "MEMBERS CLUB"}
      </p>
      <h1>
        {mode === "reset"
          ? "بازیابی دسترسی"
          : admin
            ? "ورود مدیران"
            : "خوش آمدید"}
      </h1>
      <p>با حساب خود وارد دنیای همراهان همای شوید.</p>
      <div className="portal-tabs" role="tablist" aria-label="روش دسترسی">
        {[
          ["login", "ورود"],
          ...(!admin ? [["register", "ثبت‌نام"]] : []),
          ["reset", "بازیابی رمز"],
        ].map(([key, label]) => (
          <Localized key={key}><button
            role="tab"
            aria-selected={mode === key}
            disabled={busy}
            onClick={() => changeMode(key)}
          >
            {label}
          </button></Localized>
        ))}
      </div>
      {mode === "login" && <GoogleAccess intent="login" onComplete={r=>onLogin(r.user)}/>}
      <Notice error={error} success={notice} />
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {mode === "reset" && (
            <label className="auth-check">
              <input
                type="checkbox"
                checked={byIdentity}
                onChange={(e) => {
                  setByIdentity(e.target.checked);
                  setChallenge("");
                  setCode("");
                }}
              />
              ایمیل را به خاطر ندارم؛ بازیابی با کد ملی و شماره موبایل
            </label>
          )}
          {identity && (
            <>
              <label>
                کد ملی
                <input
                  name="nationalId"
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={12}
                  required
                  value={nationalId}
                  onChange={(e) => {
                    setNationalId(e.target.value);
                    setChallenge("");
                  }}
                />
              </label>
              <label>
                شماره موبایل ثبت‌شده در حساب
                <input
                  name="mobile"
                  type="tel"
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={16}
                  required
                  value={mobile}
                  placeholder="09121234567"
                  onChange={(e) => {
                    setMobile(e.target.value);
                    setChallenge("");
                  }}
                />
              </label>
            </>
          )}
{!identity && (
          <label>
            ایمیل یا شماره موبایل
            <input
              name="target"
              dir="ltr"
              autoComplete="username"
              maxLength={254}
              required={!identity}
              value={target}
              placeholder="name@example.com"
              onChange={(e) => {
                setTarget(e.target.value);
                setChallenge("");
                setCode("");
              }}
            />
            <small>
              برای حساب‌های قدیمی با موبایل، پیش‌شماره کشور را وارد کنید.
            </small>
          </label>
          )}
          {mode === "login" && (
            <label className="auth-check">
              <input
                type="checkbox"
                checked={!otp}
                onChange={(e) => {
                  setOtp(!e.target.checked);
                  setChallenge("");
                  setCode("");
                }}
              />
              ورود با رمز عبور
            </label>
          )}
          {(!otp || mode === "reset") && (
            <label>
              {mode === "reset" ? "رمز عبور جدید؛ حداقل ۱۲ نویسه" : "رمز عبور"}
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "reset" ? "new-password" : "current-password"
                }
                minLength={mode === "reset" ? 12 : 1}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {needsCode && (
            <div className="email-code-form">
              {sendCaptcha.element}
              <button
                type="button"
                className="portal-button secondary"
                disabled={(identity ? !nationalId || !mobile : !target) || busy || cooldown > 0 || !sendCaptcha.ready}
                onClick={send}
              >
                {cooldown
                  ? `ارسال مجدد تا ${cooldown.toLocaleString("fa-IR")} ثانیه`
                  : challenge
                    ? "ارسال دوباره کد"
                    : "ارسال کد تأیید"}
              </button>
              <label>
                کد تأیید ایمیل / پیامک
                <input
                  className="otp-input"
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  dir="ltr"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/[^0-9]/g, ""))
                  }
                />
              </label>
            </div>
          )}
          <details className="login-second-factor" open={!!totp || recovery || !!error || undefined}>
            <summary>
              <ShieldCheck size={18} /> رمزساز را فعال کرده‌اید؟
            </summary>
            <p>اگر تأیید دومرحله‌ای حساب شما فعال است، کد آن را وارد کنید.</p>
            {recovery ? (
              <label>
                کد بازیابی یک‌بارمصرف
                <input
                  name="recoveryCode"
                  dir="ltr"
                  autoComplete="off"
                  maxLength={24}
                  required
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                />
              </label>
            ) : (
              <label>
                کد برنامه رمزساز
                <input
                  name="totp"
                  className="otp-input"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  dir="ltr"
                  maxLength={6}
                  value={totp}
                  onChange={(e) =>
                    setTotp(e.target.value.replace(/[^0-9]/g, ""))
                  }
                />
              </label>
            )}
            <button
              type="button"
              className="auth-text-button"
              onClick={() => setRecovery((v) => !v)}
            >
              {recovery
                ? "استفاده از برنامه رمزساز"
                : "به رمزساز دسترسی ندارم؛ استفاده از کد بازیابی"}
            </button>
          </details>
          {!needsCode && submitCaptcha.element}
          <button
            className="portal-button"
            disabled={busy || (!needsCode && !submitCaptcha.ready) || (needsCode && !challenge)}
          >
            {busy
              ? "در حال بررسی…"
              : mode === "reset"
                ? "تغییر رمز عبور"
                : "ورود به حساب"}
          </button>
        </fieldset>
      </form>
      <p className="auth-fineprint">
        رمز عبور و کدهای تأیید را در اختیار دیگران قرار ندهید.
      </p>
    </div></Localized>
  );
}
