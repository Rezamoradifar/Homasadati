import { loadEnvConfig } from "@next/env";
import { digipayConfig, digipayEnabled } from "../src/platform/digipay";
import { digipayCategoryMap, digipayCheckoutEnabled } from "../src/platform/digipay-basket";

loadEnvConfig(process.cwd());
const required = ["APP_ORIGIN", "DIGIPAY_ENVIRONMENT", "DIGIPAY_USERNAME", "DIGIPAY_PASSWORD", "DIGIPAY_CLIENT_ID", "DIGIPAY_CLIENT_SECRET"];
const missing = required.filter(key => !process.env[key]?.trim());
let environment: string | null = null, callbackUrl: string | null = null;
try {
  const config = digipayConfig();
  environment = config.environment;
  callbackUrl = `${config.origin}/api/platform/payment/digipay/callback`;
} catch { /* report availability without printing configuration values */ }
const ready = digipayCheckoutEnabled();
console.log(JSON.stringify({
  enabled: process.env.DIGIPAY_ENABLED === "1",
  configured: digipayEnabled(),
  readyForCheckout: ready,
  environment,
  callbackUrl,
  missing,
  categoryMapValid: Object.keys(digipayCategoryMap()).length > 0,
  basketIdentifierMode: process.env.DIGIPAY_SELLER_ID?.trim() || process.env.DIGIPAY_SUPPLIER_ID?.trim() ? "explicit_or_mixed" : "official_single_merchant_defaults",
  productBrandFallbackConfigured: !!process.env.DIGIPAY_DEFAULT_BRAND?.trim(),
  merchantCreditActivation: "not_checked_by_preflight",
  liveAuthenticationTest: "not_checked_by_preflight",
  livePaymentTest: "not_checked_by_preflight",
}, null, 2));
if (process.argv.includes("--require-ready") && !ready) process.exitCode = 1;
