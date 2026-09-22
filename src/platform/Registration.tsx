"use client";

import {LanguagePicker} from '../i18n/SiteLocale';
import GoogleAccess from "./GoogleAccess";
import ThemeToggle from '../commerce/ThemeToggle';
import Localized from "../i18n/Localized";
import { useEffect, useRef, useState, FormEvent } from "react";
import {
  Check,
  Mail,
  ShieldCheck,
  UserRound,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react";
import { api, RecordData } from "./client";
import {
  TERMS_VERSION,
  registrationSchema,
  memberDetailsSchema,
  registrationEmail,
  registrationContact,
  referralCode,
} from "./registration-model";
import { password } from "./validation";
import { Notice } from "./Widgets";
import { useCaptcha } from "./Captcha";
import { RecoveryCodes } from "./RecoveryCodes";
const interests = [
  ["tourism", "گردشگری"],
  ["craft", "صنایع‌دستی"],
  ["beauty", "زیبایی"],
  ["ai", "هوش مصنوعی"],
  ["leather", "چرم"],
];
export default function Registration({
  onLogin,
  onBack,
}: {
  onLogin: (u: RecordData) => void;
  onBack: () => void;
}) {
  const [form, setForm] = useState({
    target: "",
    password: "",
    confirm: "",
    firstName: "",
    lastName: "",
    country: "",
    city: "",
    occupation: "",
    language: "fa",
    referral: "",
    code: "",
    totp: "",
    interests: [] as string[],
    termsAccepted: false,
    privacyAccepted: false,
    adultConfirmed: false,
    marketingConsent: false,
  });
  const [method,setMethod]=useState<"email"|"sms">("email"),[smsReady,setSmsReady]=useState(false);
  useEffect(()=>{api("auth/config").then(c=>setSmsReady(!!c.smsRegistration)).catch(()=>{});},[]);
  const [step, setStep] = useState(0),
    [invitationMode, setInvitationMode] = useState<
      "with-code" | "without-code"
    >("without-code");
  const [challenge, setChallenge] = useState(""),
    [enrollment, setEnrollment] = useState<RecordData | null>(null),
    [result, setResult] = useState<RecordData | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [cooldown, setCooldown] = useState(0),
    [showPassword, setShowPassword] = useState(false),
    [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const sendCaptcha = useCaptcha("otp"),
    verifyCaptcha = useCaptcha("verify_email"),
    registerCaptcha = useCaptcha("register");
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      setForm((f) => ({ ...f, referral: ref }));
      setInvitationMode("with-code");
    }
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    if (step) heading.current?.focus();
  }, [step]);
  const set = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  const fail = (e: unknown) =>
    setError(
      (e as Error).name === "ZodError"
        ? "اطلاعات الزامی و قالب فیلدها را بررسی کنید."
        : (e as Error).message,
    );
  const details = () => ({
    firstName: form.firstName,
    lastName: form.lastName,
    country: form.country,
    city: form.city,
    occupation: form.occupation,
    language: form.language,
    interests: form.interests,
  });
  const field = (
    key:
      | "firstName"
      | "lastName"
      | "country"
      | "city"
      | "occupation"
      | "password"
      | "confirm",
    label: string,
    autoComplete = "off",
    required = true,
  ) => (
    <Localized><label>
      {label}
      <input
        name={key}
        type={
          (key === "password" || key === "confirm") && !showPassword
            ? "password"
            : "text"
        }
        required={required}
        autoComplete={autoComplete}
        value={form[key]}
        maxLength={key === "password" || key === "confirm" ? 128 : 120}
        minLength={key === "password" || key === "confirm" ? 12 : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
    </label></Localized>
  );
  async function sendCode() {
    if (busy || cooldown || !sendCaptcha.ready) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const target = (method === "email" ? registrationEmail : registrationContact).parse(form.target);
      const r = await api("auth/otp", "POST", {
        target,
        purpose: "register",
        captchaToken: sendCaptcha.token,
      });
      set("target", target);
      setChallenge(r.challenge);
      set("code", "");
      setCooldown(r.retryAfter || 60);
      setNotice(
        method === "email" ? "کد شش‌رقمی به ایمیل شما ارسال شد؛ ۵ دقیقه اعتبار دارد. پوشه هرزنامه را هم بررسی کنید." : "کد شش‌رقمی پیامک شد؛ ۵ دقیقه اعتبار دارد.",
      );
    } catch (e) {
      fail(e);
    } finally {
      sendCaptcha.reset();
      setBusy(false);
    }
  }
  async function verifyEmail(e: FormEvent) {
    e.preventDefault();
    if (busy || !verifyCaptcha.ready) return;
    setBusy(true);
    setError("");
    try {
      const r = await api(method === "email" ? "auth/verify-email" : "auth/verify-contact", "POST", {
        target: form.target,
        challenge,
        code: form.code,
        captchaToken: verifyCaptcha.token,
      });
      setEnrollment(r);
      setStep(1);
      setNotice(
        "راه تماس تأیید شد. برای تکمیل ثبت‌نام ۱۵ دقیقه فرصت دارید.",
      );
    } catch (e) {
      fail(e);
    } finally {
      verifyCaptcha.reset();
      setBusy(false);
    }
  }
  async function completeDetails(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      memberDetailsSchema.parse(details());
      password.parse(form.password);
      if (form.password !== form.confirm)
        throw new Error("تکرار رمز عبور یکسان نیست.");
      if (invitationMode === "with-code") {
        referralCode.parse(form.referral);
        setBusy(true);
        const r = await api("referrals/check", "POST", { code: form.referral });
        if (!r.valid)
          throw new Error(
            "کد دعوت معتبر یا فعال نیست؛ آن را اصلاح کنید یا ثبت‌نام بدون کد را انتخاب کنید.",
          );
      }
      if (!form.termsAccepted || !form.privacyAccepted || !form.adultConfirmed)
        throw new Error("پذیرش قوانین، حریم خصوصی و تأیید سن لازم است.");
      setStep(2);
      setNotice("");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !registerCaptcha.ready || !enrollment) return;
    setBusy(true);
    setError("");
    try {
      const payload = registrationSchema.parse({
        target: form.target,
        password: form.password,
        verificationToken: enrollment.verificationToken,
        totp: form.totp,
        captchaToken: registerCaptcha.token,
        invitationMode,
        referral: invitationMode === "with-code" ? form.referral : "",
        details: details(),
        termsAccepted: form.termsAccepted,
        privacyAccepted: form.privacyAccepted,
        adultConfirmed: form.adultConfirmed,
        termsVersion: TERMS_VERSION,
        marketingConsent: form.marketingConsent,
      });
      const r = await api("auth/register", "POST", payload);
      setResult(r);
      setEnrollment(null);
      set("password", "");
      set("confirm", "");
      set("totp", "");
      setNotice("");
    } catch (e) {
      fail(e);
    } finally {
      registerCaptcha.reset();
      setBusy(false);
    }
  }
  function restart() {
    setStep(0);
    setEnrollment(null);
    setChallenge("");
    set("code", "");
    set("totp", "");
    setError("");
    setNotice("");
  }
  return (
    <Localized><div className="registration-shell" dir="rtl">
      <aside className="registration-story">
        <a href="/" aria-label="صفحه اصلی هما نت">
          <img src="/assets/brand-mark.png" alt="همای" />
        </a>
        <p className="auth-eyebrow">HOMA · MEMBERS CLUB</p>
        <h2>
          همراهی شما،
          <br />{" "}
          آغاز یک داستان.
        </h2>
        <p>یک حساب برای تجربه‌های سفر، هنر و مجموعه‌های همای.</p>
        <div className="registration-story-foot">
          <ShieldCheck size={28} />
          <div>
            <strong>دسترسی با تأیید دومرحله‌ای</strong>
            <p>راه تماس تأییدشده، رمز شخصی و رمزساز</p>
          </div>
        </div>
      </aside>
      <div className="portal-card registration">
        <div className="registration-preferences"><LanguagePicker/><ThemeToggle/></div><div className="auth-topline">
          <span>باشگاه مشتریان هما نت</span>
          <button type="button" onClick={onBack} disabled={busy}>
            حساب دارید؟ ورود <ArrowLeft size={15} />
          </button>
        </div>
        {result ? (
          <RecoveryCodes
            codes={result.recoveryCodes}
            onContinue={() => onLogin(result.user)}
          />
        ) : (
          <>
            <ol className="registration-steps" aria-label="مراحل ثبت‌نام">
              {[
                [method === "sms" ? "تأیید موبایل" : "تأیید ایمیل", Mail],
                ["مشخصات عضویت", UserRound],
                ["امنیت حساب", ShieldCheck],
              ].map(([label, Icon], i) => {
                const StepIcon = Icon as typeof Mail;
                return (
                  <Localized key={i}><li
                    aria-current={step === i ? "step" : undefined}
                    className={i < step ? "complete" : ""}
                  >
                    <span>
                      {i < step ? <Check size={17} /> : <StepIcon size={17} />}
                    </span>
                    <small>{label as string}</small>
                  </li></Localized>
                );
              })}
            </ol>
            <h1 ref={heading} tabIndex={-1}>
              {
                [
                  method === "sms" ? "عضویت با پیامک" : "عضویت با ایمیل",
                  "عضویت به انتخاب شما",
                  "حساب شما، با حفاظت بیشتر",
                ][step]
              }
            </h1>
            <p>
              {
                [
                  "راه تماس خود را تأیید کنید و عضویت را در سه مرحله تکمیل کنید.",
                  "با کد دعوت یا بدون آن، به جمع همراهان همای بپیوندید.",
                  "رمزساز را متصل کنید تا فقط با رمز عبور نتوان وارد حسابتان شد.",
                ][step]
              }
            </p>
            <Notice error={error} success={notice} />
            {step === 0 && (
              <>
                <GoogleAccess intent="register" onComplete={r=>{setMethod("email");set("target",r.target);setEnrollment(r);setStep(1);setNotice("راه تماس تأیید شد. برای تکمیل ثبت‌نام ۱۵ دقیقه فرصت دارید.");}}/>
                <div className="registration-methods" role="group" aria-label="روش تأیید عضویت"><button type="button" aria-pressed={method==="email"} disabled={busy||!!challenge} onClick={()=>{setMethod("email");set("target","");}}>ایمیل</button><button type="button" aria-pressed={method==="sms"} disabled={busy||!!challenge||!smsReady} onClick={()=>{setMethod("sms");set("target","");}}>پیامک</button></div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendCode();
                  }}
                >
                  <label>
                    {method === "sms" ? "شماره موبایل با پیش‌شماره کشور" : "ایمیل"}
                    <input
                      name={method === "sms" ? "phone" : "email"}
                      type={method === "sms" ? "tel" : "email"}
                      dir="ltr"
                      autoComplete={method === "sms" ? "tel" : "email"}
                      placeholder={method === "sms" ? "+989121234567" : "name@example.com"}
                      required
                      maxLength={254}
                      value={form.target}
                      disabled={!!challenge || busy}
                      onChange={(e) => set("target", e.target.value)}
                    />
                  </label>
                  {sendCaptcha.element}
                  <button
                    className="portal-button"
                    disabled={busy || !sendCaptcha.ready || cooldown > 0}
                  >
                    {cooldown > 0
                      ? `ارسال مجدد تا ${cooldown.toLocaleString("fa-IR")} ثانیه`
                      : challenge
                        ? "ارسال دوباره کد"
                        : method === "sms" ? "دریافت کد پیامک" : "دریافت کد تأیید ایمیل"}
                  </button>
                </form>
                {challenge && (
                  <form onSubmit={verifyEmail} className="email-code-form">
                    <label>
                      {method === "sms" ? "کد تأیید پیامک" : "کد تأیید ایمیل"}
                      <input
                        className="otp-input"
                        name="emailCode"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        dir="ltr"
                        maxLength={6}
                        required
                        value={form.code}
                        onChange={(e) =>
                          set("code", e.target.value.replace(/[^0-9]/g, ""))
                        }
                      />
                    </label>
                    {verifyCaptcha.element}
                    <div className="auth-actions">
                      <button
                        className="portal-button"
                        disabled={
                          busy || !verifyCaptcha.ready || form.code.length !== 6
                        }
                      >
                        {method === "sms" ? "تأیید موبایل و ادامه" : "تأیید ایمیل و ادامه"}
                      </button>
                      <button
                        type="button"
                        onClick={restart}
                        className="portal-button secondary"
                        disabled={busy}
                      >
                        {method === "sms" ? "ویرایش موبایل" : "ویرایش ایمیل"}
                      </button>
                    </div>
                  </form>
                )}
                <p className="auth-fineprint">
                  تأیید ایمیل، موبایل یا گوگل فقط دسترسی به آن حساب را بررسی می‌کند و جایگزین احراز هویت رسمی نیست.
                </p>
              </>
            )}
            {step === 1 && (
              <form onSubmit={completeDetails}>
                <div className="verified-email">
                  <Check size={16} />
                  <bdi>{form.target}</bdi>
                  <span>تأیید شد</span>
                </div>
                <fieldset disabled={busy}>
                  <legend>روش عضویت</legend>
                  <div className="invitation-options">
                    {[
                      [
                        "without-code",
                        "بدون کد دعوت",
                        "مستقیماً عضو باشگاه شوید.",
                      ],
                      [
                        "with-code",
                        "با کد دعوت",
                        "دعوت همراه خود را ثبت کنید.",
                      ],
                    ].map(([value, label, hint]) => (
                      <Localized key={value}><label
                        className={invitationMode === value ? "selected" : ""}
                      >
                        <input
                          type="radio"
                          name="invitationMode"
                          value={value}
                          checked={invitationMode === value}
                          onChange={() =>
                            setInvitationMode(value as typeof invitationMode)
                          }
                        />
                        <span>
                          <strong>{label}</strong>
                          <small>{hint}</small>
                        </span>
                      </label></Localized>
                    ))}
                  </div>
                  {invitationMode === "with-code" && (
                    <label>
                      کد دعوت
                      <input
                        name="referral"
                        dir="ltr"
                        required
                        maxLength={40}
                        autoComplete="off"
                        value={form.referral}
                        onChange={(e) => set("referral", e.target.value)}
                      />
                      <small>اعتبار کد پیش از ادامه بررسی می‌شود.</small>
                    </label>
                  )}
                </fieldset>
                <fieldset disabled={busy}>
                  <legend>مشخصات شما</legend>
                  <div className="registration-grid">
                    {field("firstName", "نام", "given-name")}
                    {field("lastName", "نام خانوادگی", "family-name")}
                    {field("country", "کشور محل سکونت", "country-name")}
                    {field("city", "شهر محل سکونت", "address-level2")}
                    {field(
                      "occupation",
                      "زمینه فعالیت (اختیاری)",
                      "organization-title",
                      false,
                    )}
                    <label>
                      زبان ترجیحی
                      <select
                        name="language"
                        value={form.language}
                        onChange={(e) => set("language", e.target.value)}
                      >
                        <option value="fa">فارسی</option>
                        <option value="en">English</option>
                        <option value="ar">العربية</option>
                      </select>
                    </label>
                  </div>
                </fieldset>
                <fieldset disabled={busy}>
                  <legend>رمز عبور</legend>
                  <div className="registration-grid">
                    {field(
                      "password",
                      "رمز عبور؛ حداقل ۱۲ نویسه",
                      "new-password",
                    )}
                    {field("confirm", "تکرار رمز عبور", "new-password")}
                  </div>
                  <button
                    type="button"
                    className="auth-text-button"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}{" "}
                    {showPassword ? "پنهان‌کردن رمز" : "نمایش رمز"}
                  </button>
                  <p>
                    یک عبارت طولانی و یکتا انتخاب کنید؛ فاصله، حروف فارسی و
                    نمادها مجازند.
                  </p>
                </fieldset>
                <fieldset disabled={busy}>
                  <legend>علاقه‌مندی‌ها (اختیاری)</legend>
                  <div className="interest-options">
                    {interests.map(([k, l]) => (
                      <Localized key={k}><label>
                        <input
                          type="checkbox"
                          checked={form.interests.includes(k)}
                          onChange={(e) =>
                            set(
                              "interests",
                              e.target.checked
                                ? [...form.interests, k]
                                : form.interests.filter((x) => x !== k),
                            )
                          }
                        />
                        {l}
                      </label></Localized>
                    ))}
                  </div>
                </fieldset>
                <div className="registration-checks">
                  <label>
                    <input
                      required
                      type="checkbox"
                      checked={form.termsAccepted}
                      onChange={(e) => set("termsAccepted", e.target.checked)}
                    />
                    <span>
                      <a href="/legal/terms" target="_blank" rel="noreferrer">
                        قوانین عضویت و خرید
                      </a>{" "}
                      را می‌پذیرم.
                    </span>
                  </label>
                  <label>
                    <input
                      required
                      type="checkbox"
                      checked={form.privacyAccepted}
                      onChange={(e) => set("privacyAccepted", e.target.checked)}
                    />
                    <span>
                      <a href="/legal/privacy" target="_blank" rel="noreferrer">
                        سیاست حریم خصوصی
                      </a>{" "}
                      را می‌پذیرم.
                    </span>
                  </label>
                  <label>
                    <input
                      required
                      type="checkbox"
                      checked={form.adultConfirmed}
                      onChange={(e) => set("adultConfirmed", e.target.checked)}
                    />
                    حداقل ۱۸ سال دارم و اطلاعات من صحیح است.
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={form.marketingConsent}
                      onChange={(e) =>
                        set("marketingConsent", e.target.checked)
                      }
                    />
                    پیشنهادها و خبرهای همای را دریافت می‌کنم (اختیاری).
                  </label>
                </div>
                <div className="auth-actions">
                  <button className="portal-button" disabled={busy}>
                    ادامه و فعال‌سازی دومرحله‌ای
                  </button>
                  <button
                    type="button"
                    className="portal-button secondary"
                    disabled={busy}
                    onClick={restart}
                  >
                    تغییر روش تأیید
                  </button>
                </div>
              </form>
            )}
            {step === 2 && enrollment && (
              <form onSubmit={submit}>
                <div className="authenticator-setup">
                  <ShieldCheck size={32} />
                  <h2>اتصال برنامه رمزساز</h2>
                  <ol>
                    <li>
                      در برنامه‌ای مانند Google Authenticator یا Microsoft
                      Authenticator، افزودن حساب با «کلید راه‌اندازی» را انتخاب
                      کنید.
                    </li>
                    <li>
                      کلید زیر را وارد کنید؛ نوع حساب «مبتنی بر زمان» است.
                    </li>
                    <li>کد شش‌رقمی برنامه را برای تأیید وارد کنید.</li>
                  </ol>
                  <code className="auth-secret" dir="ltr">
                    {enrollment.secret}
                  </code>
                  <div className="auth-actions">
                    <button
                      className="portal-button secondary"
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            enrollment.secret,
                          );
                          setCopied(true);
                        } catch {
                          setError(
                            "کپی خودکار ممکن نشد؛ کلید را دستی کپی کنید.",
                          );
                        }
                      }}
                    >
                      {copied ? "کلید کپی شد" : "کپی کلید"}
                    </button>
                    <a
                      href={enrollment.uri}
                      className="portal-button secondary"
                    >
                      باز کردن برنامه رمزساز
                    </a>
                  </div>
                  <p>این کلید خصوصی است؛ فقط در برنامه رمزساز خود وارد کنید.</p>
                </div>
                <label>
                  کد شش‌رقمی رمزساز
                  <input
                    name="totp"
                    className="otp-input"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    dir="ltr"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={form.totp}
                    onChange={(e) =>
                      set("totp", e.target.value.replace(/[^0-9]/g, ""))
                    }
                  />
                </label>
                {registerCaptcha.element}
                <div className="auth-actions">
                  <button
                    className="portal-button"
                    disabled={
                      busy || !registerCaptcha.ready || form.totp.length !== 6
                    }
                  >
                    {busy ? "در حال ایجاد حساب…" : "تأیید و ساخت حساب امن"}
                  </button>
                  <button
                    type="button"
                    className="portal-button secondary"
                    disabled={busy}
                    onClick={() => {
                      setStep(1);
                      setError("");
                    }}
                  >
                    ویرایش مشخصات
                  </button>
                </div>
                <button
                  type="button"
                  className="auth-text-button"
                  disabled={busy}
                  onClick={restart}
                >
                  مهلت تمام شده؟ شروع دوباره تأیید
                </button>
              </form>
            )}
          </>
        )}
        <div className="auth-footer">
          <ShieldCheck size={15} />
          <span>تأیید راه تماس · رمزساز · حفاظت از اطلاعات</span>
        </div>
      </div>
    </div></Localized>
  );
}
