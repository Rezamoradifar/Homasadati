import { randomInt, randomUUID } from "node:crypto";
import { hash, ApiError, limit } from "../server/http";
import { one, run, now, atomic } from "./schema";
import { decrypt, encrypt } from "./security";
import { policySchema, Policy } from "./validation";
import { loadDictionary, translateText, type SiteLocale } from "../i18n/core";
import { renderEmail, senderAddress, type EmailBrand } from "./email-template";
export function setting(key: string) {
  const r = one("SELECT * FROM p_settings WHERE key=?", key);
  return r ? (r.secret ? decrypt(r.value) : r.value) : undefined;
}
export function saveSetting(key: string, value: string, secret = false) {
  run(
    "INSERT INTO p_settings VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,secret=excluded.secret,updated_at=excluded.updated_at",
    key,
    secret ? encrypt(value) : value,
    Number(secret),
    now(),
  );
}
export function policy(): Policy {
  const raw = setting("commission_policy");
  if (!raw) throw new ApiError(503, "policy_not_configured");
  return policySchema.parse(JSON.parse(raw));
}
export async function providerFetch(url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new ApiError(503, "provider_unavailable");
  }
  if (!response.ok) throw new ApiError(503, "provider_rejected");
  return response.json();
}
const otpCopy: Record<string, { subject: string; heading: string; intro: string }> = {
  register: {
    subject: "کد تأیید عضویت در هما نت",
    heading: "به خانوادهٔ هما نت خوش آمدید",
    intro: "برای تکمیل عضویت در باشگاه مشتریان هما نت، کد زیر را در صفحهٔ ثبت‌نام وارد کنید.",
  },
  login: {
    subject: "کد ورود به حساب هما نت",
    heading: "کد ورود به حساب شما",
    intro: "برای ورود به حساب کاربری خود در هما نت، کد زیر را وارد کنید.",
  },
  reset: {
    subject: "کد بازیابی رمز عبور هما نت",
    heading: "بازیابی رمز عبور",
    intro: "درخواستی برای تغییر رمز عبور حساب شما ثبت شده است. برای ادامه، کد زیر را وارد کنید.",
  },
  contact: {
    subject: "کد تأیید راه تماس جدید",
    heading: "تأیید راه تماس",
    intro: "برای ثبت این ایمیل به‌عنوان راه تماس حساب هما نت، کد زیر را وارد کنید.",
  },
};
export const brandName = (locale: SiteLocale = "fa") =>
  setting("site_name") || (locale === "fa" ? "هما نت" : "Homanet");
/** Brand details shared by every email the platform sends. */
export async function emailBrand(locale: SiteLocale = "fa"): Promise<EmailBrand> {
  const dictionary = await loadDictionary(locale);
  const t = (text: string) => translateText(text, locale, dictionary);
  return {
    name: brandName(locale),
    origin: process.env.APP_ORIGIN || "https://homanets.com",
    supportEmail: setting("site_email") || undefined,
    direction: locale === "en" ? "ltr" : "rtl",
    footer: [
      t("هما نت · باشگاه مشتریان"),
      t("این ایمیل به‌صورت خودکار ارسال شده است؛ لطفاً به آن پاسخ ندهید."),
    ],
  };
}
export async function sendOtp(target: string, purpose: string, locale: SiteLocale = "fa") {
  limit("otp-target:" + hash(target), 3, 300);
  limit("otp-cooldown:" + hash(target), 1, 60);
  const code = randomInt(100000, 1000000).toString(),
    id = randomUUID();
  // No OTP is returned or logged. Only a one-way hash is persisted.
  atomic(() => {
    run(
      "UPDATE p_otp SET used=1 WHERE target=? AND purpose=? AND used=0",
      target,
      purpose,
    );
    run(
      "INSERT INTO p_otp VALUES(?,?,?,?,?,0,0,?)",
      id,
      target,
      purpose,
      hash(id + ":" + code),
      Date.now() + 300000,
      now(),
    );
  });
  try {
    if (target.includes("@")) {
      const key = setting("resend_key"),
        from = setting("email_from");
      if (!key || !from) throw new ApiError(503, "email_not_configured");
      const dictionary = await loadDictionary(locale);
      const t = (text: string) => translateText(text, locale, dictionary);
      const copy = otpCopy[purpose] || otpCopy.login;
      const mail = renderEmail(
        {
          subject: t(copy.subject),
          preheader: t("کد شش‌رقمی شما آماده است؛ تا ۵ دقیقه معتبر است."),
          heading: t(copy.heading),
          paragraphs: [t("سلام،"), t(copy.intro)],
          code,
          note: t(
            "این کد فقط ۵ دقیقه معتبر است. کارکنان هما نت هرگز این کد را از شما نمی‌خواهند؛ آن را در اختیار هیچ‌کس قرار ندهید. اگر این درخواست از طرف شما نبوده، این ایمیل را نادیده بگیرید؛ حساب شما امن است.",
          ),
        },
        await emailBrand(locale),
      );
      const result = await providerFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": id,
        },
        body: JSON.stringify({
          from: senderAddress(brandName(locale), from),
          to: [target],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      if (!result.id) throw new ApiError(503, "provider_rejected");
    } else {
      const key = setting("kavenegar_key"),
        template = setting("sms_template");
      if (!key || !template) throw new ApiError(503, "sms_not_configured");
      const result = await providerFetch(
        `https://api.kavenegar.com/v1/${encodeURIComponent(key)}/verify/lookup.json`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            receptor: target.replace(/^\+/, "00"),
            token: code,
            template,
          }).toString(),
        },
      );
      if (result.return?.status !== 200)
        throw new ApiError(503, "provider_rejected");
    }
  } catch (e) {
    run("UPDATE p_otp SET used=1 WHERE id=?", id);
    throw e;
  }
  return { challenge: id, expiresIn: 300, retryAfter: 60 };
}
/** Every gateway call is written to p_gateway_transactions: requests,
 * verified payments (bank reference, masked card, fee), failures and
 * cancellations, so finance can reconcile against the gateway report. */
function logGateway(fields: Record<string, unknown> & { id?: string; authority?: string }) {
  const at = now();
  if (fields.authority && one("SELECT id FROM p_gateway_transactions WHERE authority=?", fields.authority)) {
    const keys = Object.keys(fields).filter((k) => k !== "authority" && k !== "id");
    run(
      `UPDATE p_gateway_transactions SET ${keys.map((k) => k + "=?").join(",")},updated_at=? WHERE authority=?`,
      ...keys.map((k) => fields[k] as never),
      at,
      fields.authority,
    );
    return;
  }
  const row = { id: randomUUID(), gateway: "zarinpal", ...fields, created_at: at, updated_at: at };
  const keys = Object.keys(row);
  run(
    `INSERT INTO p_gateway_transactions(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
    ...keys.map((k) => (row as Record<string, unknown>)[k] as never),
  );
}
export function logGatewayCancel(authority: string, code: string) {
  if (one("SELECT status FROM p_gateway_transactions WHERE authority=?", authority)?.status === "requested")
    logGateway({ authority, status: "cancelled", code });
}
export async function paymentRequest(
  orderId: string,
  amount: number,
  ref: { kind: "order" | "checkout"; userId: string } = { kind: "order", userId: "" },
) {
  const merchant = setting("zarinpal_merchant");
  const origin = process.env.APP_ORIGIN;
  if (!merchant || !origin || !origin.startsWith("https://"))
    throw new ApiError(503, "payment_not_configured");
  const base = { ref_kind: ref.kind, ref_id: orderId, user_id: ref.userId || null, amount };
  let r;
  try {
    r = await providerFetch(
      "https://payment.zarinpal.com/pg/v4/payment/request.json",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: merchant,
          amount: amount * 10,
          description: `Homanet ${orderId}`,
          callback_url: `${origin}/api/platform/payment/callback`,
        }),
      },
    );
  } catch (e) {
    logGateway({ ...base, status: "request_failed", code: e instanceof ApiError ? e.code : "error" });
    throw e;
  }
  if (r.data?.code !== 100 || typeof r.data?.authority !== "string") {
    logGateway({ ...base, status: "request_failed", code: String(r.data?.code ?? r.errors?.code ?? "invalid") });
    throw new ApiError(503, "provider_rejected");
  }
  logGateway({ ...base, authority: r.data.authority, status: "requested", code: "100" });
  return r.data.authority as string;
}
export async function verifyPayment(authority: string, amount: number) {
  const merchant = setting("zarinpal_merchant");
  if (!merchant) throw new ApiError(503, "payment_not_configured");
  const r = await providerFetch(
    "https://payment.zarinpal.com/pg/v4/payment/verify.json",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: merchant,
        amount: amount * 10,
        authority,
      }),
    },
  );
  if (![100, 101].includes(r.data?.code) || !r.data?.ref_id) {
    logGateway({ authority, status: "failed", code: String(r.data?.code ?? r.errors?.code ?? "invalid") });
    throw new ApiError(409, "payment_unverified");
  }
  logGateway({
    authority,
    status: "paid",
    bank_reference: String(r.data.ref_id),
    card_pan: typeof r.data.card_pan === "string" ? r.data.card_pan.slice(0, 19) : null,
    fee: Number.isFinite(Number(r.data.fee)) ? Math.round(Number(r.data.fee) / 10) : null,
    code: String(r.data.code),
  });
  return String(r.data.ref_id);
}
