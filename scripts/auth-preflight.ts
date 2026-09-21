import { loadEnvConfig } from "@next/env";
import { captchaConfig } from "../src/platform/captcha";
import { setting } from "../src/platform/providers";
import { platformDb } from "../src/platform/schema";
loadEnvConfig(process.cwd());
const issues: string[] = [];
if (process.env.NODE_ENV !== "production")
  issues.push("Run with NODE_ENV=production.");
if (!process.env.APP_ORIGIN?.startsWith("https://"))
  issues.push("Set APP_ORIGIN to the exact production HTTPS origin.");
if (!/^[a-f\d]{64}$/i.test(process.env.PLATFORM_MASTER_KEY || ""))
  issues.push("Restore the existing PLATFORM_MASTER_KEY (64 hex characters).");
try {
  if (!captchaConfig().ready)
    issues.push(
      "Configure real Turnstile site and secret keys before starting production.",
    );
  if (!setting("resend_key") || !setting("email_from"))
    issues.push(
      "Configure Resend and a verified sender in administration settings.",
    );
} catch {
  issues.push(
    "Encrypted configuration cannot be read. Check the master key and database path.",
  );
}
if (process.env.TRUST_PROXY !== "1")
  issues.push(
    "Configure a trusted reverse proxy that overwrites X-Forwarded-For, then set TRUST_PROXY=1.",
  );
if (issues.length) {
  for (const issue of issues) console.error("NOT READY: " + issue);
  process.exitCode = 1;
} else
  console.log(
    "Authentication configuration present. Verify the allowed Turnstile hostname and real email delivery on HTTPS before rollout.",
  );
platformDb().close();
