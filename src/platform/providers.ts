import { randomInt, randomUUID } from "node:crypto";
import { hash, ApiError, limit } from "../server/http";
import { one, run, now, atomic } from "./schema";
import { decrypt, encrypt } from "./security";
import { policySchema, Policy } from "./validation";
import { loadDictionary, translateText, type SiteLocale } from "../i18n/core";
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
      const result = await providerFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": id,
        },
        body: JSON.stringify({
          from,
          to: [target],
          subject: translateText("کد تأیید هما نت | HOMA", locale, dictionary),
          text: translateText(`کد تأیید هما نت: ${code}\nاعتبار: ۵ دقیقه. این کد را در اختیار دیگران قرار ندهید.`, locale, dictionary),
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
export async function paymentRequest(orderId: string, amount: number) {
  const merchant = setting("zarinpal_merchant");
  const origin = process.env.APP_ORIGIN;
  if (!merchant || !origin || !origin.startsWith("https://"))
    throw new ApiError(503, "payment_not_configured");
  const r = await providerFetch(
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
  if (r.data?.code !== 100 || typeof r.data?.authority !== "string")
    throw new ApiError(503, "provider_rejected");
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
  if (![100, 101].includes(r.data?.code) || !r.data?.ref_id)
    throw new ApiError(409, "payment_unverified");
  return String(r.data.ref_id);
}
