import { randomInt, randomUUID } from "node:crypto";
import { hash, ApiError, limit } from "../server/http";
import { one, run, now, atomic } from "./schema";
import { decrypt, encrypt } from "./security";
import { policySchema, Policy } from "./validation";
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
    throw new ApiError(502, "provider_unavailable");
  }
  if (!response.ok) throw new ApiError(502, "provider_rejected");
  return response.json();
}
export async function sendOtp(target: string, purpose: string) {
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
          subject: "کد تأیید همای سعادت | HOMA",
          text: `کد تأیید همای سعادت: ${code}\nاعتبار: ۵ دقیقه. این کد را در اختیار دیگران قرار ندهید.`,
        }),
      });
      if (!result.id) throw new ApiError(502, "provider_rejected");
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
        throw new ApiError(502, "provider_rejected");
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
        description: `Homay Saadat ${orderId}`,
        callback_url: `${origin}/api/platform/payment/callback`,
      }),
    },
  );
  if (r.data?.code !== 100 || typeof r.data?.authority !== "string")
    throw new ApiError(502, "provider_rejected");
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

let digipayToken: { value: string; expiresAt: number } | undefined;

function digipayConfig() {
  const clientId = setting("digipay_client_id");
  const clientSecret = setting("digipay_client_secret");
  const username = setting("digipay_username");
  const password = setting("digipay_password");
  const providerId = setting("digipay_provider_id");
  if (!clientId || !clientSecret || !username || !password || !providerId || !/^\\d+$/.test(providerId)) {
    throw new ApiError(503, "digipay_not_configured");
  }
  return { clientId, clientSecret, username, password, providerId };
}

async function digipayAccessToken() {
  const config = digipayConfig();
  if (digipayToken && digipayToken.expiresAt > Date.now() + 60000) return digipayToken.value;
  const response = await providerFetch("https://api.mydigipay.com/digipay/api/oauth/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      username: config.username,
      password: config.password,
      grant_type: "password",
    }).toString(),
  });
  if (typeof response.access_token !== "string" || !response.access_token) {
    throw new ApiError(502, "digipay_auth_failed");
  }
  const expiresIn = Number(response.expires_in) || 3600;
  digipayToken = {
    value: response.access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  };
  return digipayToken.value;
}

export async function digipayCreateTicket(
  referenceId: string,
  amount: number,
  cellNumber: string,
  callbackUrl: string,
) {
  const config = digipayConfig();
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1e12) {
    throw new ApiError(400, "invalid_input");
  }
  if (!/^https:\\/\\//.test(callbackUrl) || !/^09\\d{9}$/.test(cellNumber)) {
    throw new ApiError(400, "invalid_input");
  }
  const token = await digipayAccessToken();
  const response = await providerFetch("https://api.mydigipay.com/digipay/api/tickets/business?type=11", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Agent: "WEB",
      "Digipay-Version": "2022-02-02",
    },
    body: JSON.stringify({
      amount: amount * 10,
      cellNumber,
      providerId: Number(config.providerId),
      callbackUrl,
      additionalInfo: { preferredGateway: 2 },
    }),
  });
  const redirectUrl = response.redirectUrl || response.data?.redirectUrl;
  const ticket = response.ticket || response.data?.ticket;
  if (typeof redirectUrl !== "string" || !/^https:\\/\\//.test(redirectUrl) || typeof ticket !== "string" || !ticket) {
    throw new ApiError(502, "digipay_ticket_failed");
  }
  return { redirectUrl, ticket };
}

export async function digipayVerifyPayment(trackingCode: string, providerId: string) {
  const config = digipayConfig();
  if (providerId !== config.providerId || !trackingCode || trackingCode.length > 128) {
    throw new ApiError(409, "digipay_callback_mismatch");
  }
  const token = await digipayAccessToken();
  const response = await providerFetch(
    "https://api.mydigipay.com/digipay/api/purchases/verify?type=11",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Agent: "WEB",
        "Digipay-Version": "2022-02-02",
      },
      body: JSON.stringify({ trackingCode, providerId: Number(config.providerId) }),
    },
  );
  if (response.result?.status !== 0) throw new ApiError(409, "digipay_payment_unverified");
  return trackingCode;
}
