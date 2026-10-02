import { createHash } from "node:crypto";

/** Secrets stay on the server. The provider host is fixed in bale-api.ts. */
export function baleConfig() {
  const botToken = (process.env.BALEPAY_BOT_TOKEN || "").trim();
  const providerToken = (process.env.BALEPAY_PROVIDER_TOKEN || "").trim();
  const botUsername = (process.env.BALEPAY_BOT_USERNAME || "Homanets_bot").replace(/^@/, "").trim();
  const webhookSecret = (process.env.BALEPAY_WEBHOOK_SECRET || "").trim();
  const origin = (process.env.APP_ORIGIN || "").trim().replace(/\/$/, "");
  const digest = (...values: string[]) => createHash("sha256").update(JSON.stringify(values)).digest("hex");
  // Changing credentials cannot silently move an existing attempt to another wallet.
  const accountFingerprint = digest("bale-wallet-v1", botToken, providerToken, botUsername.toLowerCase());
  return {
    enabled: process.env.BALEPAY_ENABLED === "1",
    botToken,
    providerToken,
    botUsername,
    webhookSecret,
    origin,
    accountFingerprint,
    // Deliberately excludes enabled: registration is performed while payments are off.
    configFingerprint: digest(accountFingerprint, origin, webhookSecret),
  };
}

export type BaleConfig = ReturnType<typeof baleConfig>;

export function baleConfigValid(config = baleConfig(), requireEnabled = false) {
  if (requireEnabled && !config.enabled) return false;
  if (!/^[A-Za-z0-9_]{5,64}$/.test(config.botUsername)) return false;
  if (!config.botToken || config.botToken.length > 512 || /[\s/?#]/.test(config.botToken)) return false;
  if (!config.providerToken || config.providerToken.length > 512 || /\s/.test(config.providerToken)) return false;
  // Test wallet receipts must never settle real Homanet orders or earn commissions.
  if (/^WALLET-TEST-/i.test(config.providerToken)) return false;
  if (!/^[a-f0-9]{64}$/.test(config.webhookSecret)) return false;
  try {
    const origin = new URL(config.origin);
    return origin.protocol === "https:" && !origin.username && !origin.password &&
      !origin.search && !origin.hash && origin.pathname === "/" && origin.origin === config.origin;
  } catch {
    return false;
  }
}

/** Never log this URL: the last path segment authenticates Bale's webhook. */
export function baleWebhookUrl(config = baleConfig()) {
  return `${config.origin}/api/platform/payment/bale/webhook/${config.webhookSecret}`;
}
