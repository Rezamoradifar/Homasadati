import { ApiError } from "../server/http";
import { setting } from "./providers";

// Only these two named development modes permit an unconfigured widget.
// Production and unset NODE_ENV fail closed; provider errors never bypass validation.
function configured() {
  const siteKey =
    process.env.TURNSTILE_SITE_KEY || setting("turnstile_site_key");
  const secret =
    process.env.TURNSTILE_SECRET_KEY || setting("turnstile_secret_key");
  const testKey =
    process.env.NODE_ENV === "production" &&
    [siteKey, secret].some((v) => v && /^[123]x0{10}/.test(v));
  return {
    siteKey,
    secret,
    testKey,
    required:
      !!(siteKey || secret) ||
      !["development", "test"].includes(process.env.NODE_ENV || ""),
  };
}
export function captchaConfig() {
  const c = configured();
  return {
    siteKey: c.siteKey || "",
    required: c.required,
    ready:
      !c.required ||
      (!!(c.siteKey && c.secret && process.env.APP_ORIGIN) && !c.testKey),
  };
}
export async function verifyCaptcha(token: unknown, action: string) {
  const c = configured();
  if (!c.required) return;
  if (!c.siteKey || !c.secret || !process.env.APP_ORIGIN || c.testKey)
    throw new ApiError(503, "captcha_not_configured");
  if (typeof token !== "string" || !token || token.length > 2048)
    throw new ApiError(400, "captcha_required");
  let result;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: c.secret, response: token }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      },
    );
    if (!response.ok) throw new Error("provider");
    result = await response.json();
  } catch {
    throw new ApiError(502, "captcha_unavailable");
  }
  const age = Date.now() - Date.parse(result.challenge_ts);
  if (
    result.success !== true ||
    result.action !== action ||
    result.hostname !== new URL(process.env.APP_ORIGIN).hostname ||
    !Number.isFinite(age) ||
    age < -30000 ||
    age > 300000
  )
    throw new ApiError(400, "captcha_invalid");
}
