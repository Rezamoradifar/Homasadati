import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, hash } from "../server/http";
import { renderEmail, senderAddress } from "./email-template";
import { emailBrand, providerFetch, setting } from "./providers";
import { all, atomic, now, one, run } from "./schema";
import { audit, decrypt, encrypt } from "./security";

/** Email newsletter for the people who subscribe in the site footer. Every
 * message carries its reader's own one-click unsubscribe link; that token is
 * kept encrypted so later campaigns can include it, and anyone who has
 * unsubscribed is skipped at send time. */
export const campaignSchema = z
  .object({
    subject: z.string().trim().min(3, "موضوع خبرنامه را بنویسید").max(120),
    preheader: z.string().trim().max(160).default(""),
    body: z.string().trim().min(20, "متن خبرنامه کوتاه است").max(8000),
    buttonLabel: z.string().trim().max(40).default(""),
    buttonUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || v.startsWith("/") || v.startsWith("https://"), "نشانی دکمه باید با https:// یا / شروع شود")
      .default(""),
  })
  .strict()
  .refine((v) => !v.buttonLabel === !v.buttonUrl, "برای دکمه، هم متن و هم نشانی لازم است");

const WELCOME = "welcome";
const MAX_ATTEMPTS = 5;

function ensureWelcome() {
  run(
    `INSERT OR IGNORE INTO p_newsletter_campaigns(id,kind,subject,preheader,body,button_label,button_url,status,created_at)
     VALUES(?,?,?,?,?,?,?,'sending',?)`,
    WELCOME,
    "welcome",
    "به خبرنامهٔ هما نت خوش آمدید",
    "از این پس تازه‌ترین محصولات، سفرها و خبرهای باشگاه را زودتر از همه دریافت می‌کنید.",
    [
      "سپاس از اینکه به خبرنامهٔ هما نت پیوستید.",
      "از این پس معرفی محصولات تازهٔ صنایع‌دستی، چرم و زیبایی، سفرهای فرهنگی و خبرهای باشگاه مشتریان را در ایمیل خود دریافت می‌کنید. بیش از چند بار در ماه برایتان نمی‌نویسیم.",
      "اگر این درخواست از طرف شما نبوده، کافی است از پیوند لغو اشتراک پایین همین ایمیل استفاده کنید.",
    ].join("\n"),
    "دیدن فروشگاه",
    "/shop",
    now(),
  );
}

/** The subscriber's current unsubscribe token, creating one if none is kept. */
function tokenFor(subscriberId: string) {
  const kept = one("SELECT token_enc FROM p_newsletter_keys WHERE subscriber_id=?", subscriberId);
  if (kept) return decrypt(kept.token_enc);
  const token = randomBytes(32).toString("hex");
  run("UPDATE subscribers SET unsubscribe_hash=?,updated_at=? WHERE id=?", hash(token), now(), subscriberId);
  run(
    "INSERT OR REPLACE INTO p_newsletter_keys VALUES(?,?,?)",
    subscriberId,
    encrypt(token),
    now(),
  );
  return token;
}

/** Called when someone subscribes: keeps their token and queues the welcome. */
export function newsletterSignedUp(subscriberId: string, token: string) {
  atomic(() => {
    ensureWelcome();
    run("INSERT OR REPLACE INTO p_newsletter_keys VALUES(?,?,?)", subscriberId, encrypt(token), now());
    run(
      "INSERT OR IGNORE INTO p_newsletter_deliveries(campaign_id,subscriber_id,status) VALUES(?,?,'pending')",
      WELCOME,
      subscriberId,
    );
  });
}

export function newsletterOverview() {
  const counts = one(
    "SELECT SUM(status='pending') active, SUM(status='unsubscribed') unsubscribed FROM subscribers",
  )!;
  const campaigns = all(
    `SELECT c.id,c.kind,c.subject,c.status,c.created_at,c.sent_at,
       SUM(d.status='sent') sent, SUM(d.status='pending') queued, SUM(d.status='failed') failed, SUM(d.status='skipped') skipped
     FROM p_newsletter_campaigns c LEFT JOIN p_newsletter_deliveries d ON d.campaign_id=c.id
     GROUP BY c.id ORDER BY c.kind='welcome', c.created_at DESC LIMIT 50`,
  );
  return {
    active: counts.active || 0,
    unsubscribed: counts.unsubscribed || 0,
    configured: !!(setting("resend_key") && setting("email_from")),
    campaigns,
  };
}

export function createCampaign(actor: string, input: unknown) {
  const d = campaignSchema.parse(input);
  const id = randomUUID();
  run(
    `INSERT INTO p_newsletter_campaigns(id,kind,subject,preheader,body,button_label,button_url,status,created_by,created_at)
     VALUES(?, 'campaign',?,?,?,?,?,'draft',?,?)`,
    id,
    d.subject,
    d.preheader,
    d.body,
    d.buttonLabel,
    d.buttonUrl,
    actor,
    now(),
  );
  audit(actor, "newsletter.draft", id, null, { subject: d.subject });
  return { id };
}

/** Queues a draft for every active subscriber. Idempotent per subscriber. */
export function sendCampaign(actor: string, id: string) {
  return atomic(() => {
    const c = one("SELECT * FROM p_newsletter_campaigns WHERE id=? AND kind='campaign'", id);
    if (!c) throw new ApiError(404, "not_found");
    if (c.status !== "draft") throw new ApiError(409, "invalid_state");
    const queued = run(
      `INSERT OR IGNORE INTO p_newsletter_deliveries(campaign_id,subscriber_id,status)
       SELECT ?,id,'pending' FROM subscribers WHERE status='pending'`,
      id,
    ).changes;
    if (!queued) throw new ApiError(409, "no_subscribers");
    run("UPDATE p_newsletter_campaigns SET status='sending',sent_at=? WHERE id=?", now(), id);
    audit(actor, "newsletter.send", id, { status: "draft" }, { status: "sending", recipients: queued });
    return { queued };
  });
}

async function render(c: Record<string, any>, token: string | null) {
  const brand = await emailBrand("fa");
  const origin = brand.origin.replace(/\/$/, "");
  const unsubscribe = token ? `${origin}/unsubscribe?token=${token}` : origin + "/unsubscribe";
  const oneClick = token ? `${origin}/api/unsubscribe/one-click?token=${token}` : "";
  const mail = renderEmail(
    {
      subject: c.subject,
      preheader: c.preheader || String(c.body).slice(0, 120),
      heading: c.subject,
      paragraphs: String(c.body).split(/\n+/).filter(Boolean),
      button: c.button_label ? { label: c.button_label, url: c.button_url.startsWith("/") ? origin + c.button_url : c.button_url } : undefined,
      note: `این ایمیل را چون در خبرنامهٔ ${brand.name} عضو شده‌اید دریافت کرده‌اید.`,
      unsubscribe: { label: "لغو اشتراک خبرنامه", url: unsubscribe },
    },
    brand,
  );
  return { mail, unsubscribe: oneClick, brand };
}

async function deliver(to: string, c: Record<string, any>, token: string | null, idempotency: string) {
  const key = setting("resend_key"),
    from = setting("email_from");
  if (!key || !from) throw new ApiError(503, "email_not_configured");
  const { mail, unsubscribe, brand } = await render(c, token);
  await providerFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotency },
    body: JSON.stringify({
      from: senderAddress(brand.name, from),
      to: [to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      // Mail apps show their own unsubscribe button from these headers.
      headers: token
        ? { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
        : undefined,
    }),
  });
}

/** A preview copy to the staff member's own address, before sending to all. */
export async function sendTest(actor: string, id: string) {
  const c = one("SELECT * FROM p_newsletter_campaigns WHERE id=?", id);
  const staff = one("SELECT email FROM p_users WHERE id=?", actor);
  if (!c) throw new ApiError(404, "not_found");
  if (!staff?.email) throw new ApiError(409, "email_required");
  await deliver(staff.email, { ...c, subject: "[نسخهٔ آزمایشی] " + c.subject }, null, "newsletter-test:" + id + ":" + Date.now());
  return { ok: true, to: staff.email };
}

/** Worker step: sends a batch of queued newsletter emails. */
export async function processNewsletter(limit = 40) {
  const jobs = all(
    `SELECT d.campaign_id,d.subscriber_id,d.attempts,s.email,s.status subscriber_status
     FROM p_newsletter_deliveries d LEFT JOIN subscribers s ON s.id=d.subscriber_id
     WHERE d.status='pending' AND d.next_attempt<=? ORDER BY d.next_attempt LIMIT ?`,
    Date.now(),
    limit,
  );
  for (const j of jobs) {
    const where = [j.campaign_id, j.subscriber_id];
    if (!j.email || j.subscriber_status !== "pending") {
      run("UPDATE p_newsletter_deliveries SET status='skipped' WHERE campaign_id=? AND subscriber_id=?", ...where);
      continue;
    }
    try {
      const c = one("SELECT * FROM p_newsletter_campaigns WHERE id=?", j.campaign_id)!;
      await deliver(j.email, c, tokenFor(j.subscriber_id), `newsletter:${j.campaign_id}:${j.subscriber_id}`);
      run(
        "UPDATE p_newsletter_deliveries SET status='sent',sent_at=?,last_error=NULL WHERE campaign_id=? AND subscriber_id=?",
        now(),
        ...where,
      );
    } catch (e) {
      const attempts = j.attempts + 1;
      run(
        "UPDATE p_newsletter_deliveries SET status=?,attempts=?,last_error=?,next_attempt=? WHERE campaign_id=? AND subscriber_id=?",
        attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts,
        e instanceof ApiError ? e.code : "delivery_failed",
        Date.now() + Math.min(86400000, 60000 * 2 ** attempts),
        ...where,
      );
    }
  }
  run(
    `UPDATE p_newsletter_campaigns SET status='sent' WHERE kind='campaign' AND status='sending'
     AND NOT EXISTS (SELECT 1 FROM p_newsletter_deliveries d WHERE d.campaign_id=p_newsletter_campaigns.id AND d.status='pending')`,
  );
  return jobs.length;
}
