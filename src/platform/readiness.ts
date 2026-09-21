import { all, one, run, now } from "./schema";
import { setting } from "./providers";
import { captchaConfig } from "./captcha";
import { googleClientId } from "./google-auth";
export function recordServiceFailure(area: string, code: string) {
  try {
    run(
      "INSERT INTO p_service_events(area,code,created_at) VALUES(?,?,?)",
      area,
      code,
      now(),
    );
    run(
      "DELETE FROM p_service_events WHERE id NOT IN (SELECT id FROM p_service_events ORDER BY id DESC LIMIT 200)",
    );
  } catch {}
}
export function serviceReadiness() {
  const present = (keys: string[]) => {
    try {
      return keys.every((k) => !!setting(k));
    } catch {
      return false;
    }
  };
  const timestamp = (key: string) => {
    try {
      return setting(key) || null;
    } catch {
      return null;
    }
  };
  const worker = timestamp("worker_last_success"),
    backup = timestamp("backup_last_success"),
    offsite = timestamp("offsite_last_success"),
    binary = timestamp("binary_cycle_last_success");
  const recent = (value: string | null, ms: number) =>
    !!value &&
    Number.isFinite(Date.parse(value)) &&
    Date.now() - Date.parse(value) >= 0 &&
    Date.now() - Date.parse(value) < ms;
  let captcha = false,
    google = false;
  try {
    captcha = captchaConfig().ready;
    google = !!googleClientId();
  } catch {}
  return {
    services: [
      { name: "ایمیل", configured: present(["resend_key", "email_from"]) },
      { name: "پیامک", configured: present(["kavenegar_key", "sms_template"]) },
      { name: "گوگل", configured: google },
      { name: "کپچا", configured: captcha },
      { name: "درگاه پرداخت", configured: present(["zarinpal_merchant"]) },
    ],
    worker: { lastSuccess: worker, healthy: recent(worker, 120000) },
    backup: { lastSuccess: backup, healthy: recent(backup, 36 * 3600000) },
    offsite: { lastSuccess: offsite, healthy: recent(offsite, 36 * 3600000) },
    binaryCycle: { lastSuccess: binary },
    monitoring: {
      configured: !!process.env.ALERT_WEBHOOK_URL,
      lastAlert: timestamp("monitor_last_alert"),
    },
    openTickets: one(
      "SELECT COUNT(*) n FROM p_tickets WHERE status='waiting_support'",
    )!.n,
    pendingMerchantReviews: one(
      "SELECT COUNT(*) n FROM p_merchant_payment_reviews WHERE status='pending'",
    )!.n,
    pendingOrders: one(
      "SELECT COUNT(*) n FROM p_orders WHERE paid_at IS NOT NULL AND status IN ('processing','shipped')",
    )!.n,
    unpublished: one("SELECT COUNT(*) n FROM p_products WHERE published=0")!.n,
    missingTranslations: one(
      "SELECT COUNT(*) n FROM p_products p LEFT JOIN p_product_details d ON d.product_id=p.id WHERE p.published=1 AND (COALESCE(json_extract(d.details,'$.titleEn'),'')='' OR COALESCE(json_extract(d.details,'$.titleAr'),'')='' OR COALESCE(json_extract(d.details,'$.descriptionEn'),'')='' OR COALESCE(json_extract(d.details,'$.descriptionAr'),'')='')",
    )!.n,
    failedNotifications: one(
      "SELECT COUNT(*) n FROM p_outbox WHERE status IN ('pending','retry','sending') AND attempts>=8",
    )!.n,
    events: all(
      "SELECT area,code,created_at FROM p_service_events ORDER BY id DESC LIMIT 20",
    ),
  };
}
