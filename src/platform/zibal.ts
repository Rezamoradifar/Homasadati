import { ApiError } from "../server/http";
import { setting, providerFetch } from "./providers";
export function paymentUrl(authority: string, method: string = "zarinpal") {
  if (method === "zibal") {
    const trackId = authority.replace(/^zibal:/, "");
    if (
      !/^[1-9]\d{0,15}$/.test(trackId) ||
      !Number.isSafeInteger(Number(trackId))
    )
      throw new ApiError(409, "payment_unverified");
    return "https://gateway.zibal.ir/start/" + trackId;
  }
  if (method !== "zarinpal") throw new ApiError(409, "invalid_state");
  return "https://www.zarinpal.com/pg/StartPay/" + authority;
}
function paymentRials(amount: number) {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(amount * 10)
  )
    throw new ApiError(400, "invalid_input");
  return amount * 10;
}
export async function zibalRequest(orderId: string, amount: number) {
 const method = "zibal";
  const rials = paymentRials(amount);
  if (method === "zibal") {
    const merchant = setting("zibal_merchant"),
      origin = process.env.APP_ORIGIN;
    if (
      !merchant ||
      (process.env.NODE_ENV === "production" && merchant === "zibal") ||
      !origin ||
      !origin.startsWith("https://")
    )
      throw new ApiError(503, "payment_not_configured");
    const r = await providerFetch("https://gateway.zibal.ir/v1/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant,
        amount: rials,
        orderId,
        description: `Homay Saadat ${orderId}`,
        callbackUrl: `${origin}/api/platform/payment/callback?gateway=zibal`,
      }),
    });
    const trackId = String(r.trackId ?? "");
    if (
      r.result !== 100 ||
      !/^[1-9]\d{0,15}$/.test(trackId) ||
      !Number.isSafeInteger(Number(trackId))
    )
      throw new ApiError(502, "provider_rejected");
    return "zibal:" + trackId;
  }

 throw new ApiError(409,"invalid_state");
}
export async function zibalVerify(authority: string, amount: number) {
 const method = "zibal";
  const rials = paymentRials(amount);
  if (method === "zibal") {
    const merchant = setting("zibal_merchant");
    if (
      !merchant ||
      (process.env.NODE_ENV === "production" && merchant === "zibal")
    )
      throw new ApiError(503, "payment_not_configured");
    paymentUrl(authority, method);
    const trackId = Number(authority.replace(/^zibal:/, ""));
    let r = await providerFetch("https://gateway.zibal.ir/v1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant, trackId }),
    });
    // A previously verified payment may omit its amount; reconcile server-side.
    if (r.result === 201)
      r = await providerFetch("https://gateway.zibal.ir/v1/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant, trackId }),
      });
    if (r.result !== 100 || r.status !== 1 || r.amount !== rials)
      throw new ApiError(409, "payment_unverified");
    // Track IDs are unique; namespace the ledger reference across providers.
    return "zibal:" + trackId;
  }

 throw new ApiError(409,"invalid_state");
}
