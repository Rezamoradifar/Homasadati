import { outboxAttemptLimit } from "./outbox-policy";
import { atomic, all, one, run, type Row } from "./schema";
import { brandName, emailBrand, providerFetch, setting } from "./providers";
import { renderEmail, senderAddress } from "./email-template";
import { ApiError } from "../server/http";
import { isWelcomeJob, welcomeEmail, welcomeSms } from "./welcome";
import { messagePresentation, notificationSms } from "./message-presentation";
import { smsReceptor } from "./sms-receptor";

/** Complete only the attempt we own. A late response must not overwrite a
 * newer worker's result after this attempt's lease has expired. */
function finish(
  job: Row,
  status: string,
  error: string | null = null,
  nextAttempt = 0,
) {
  run(
    "UPDATE p_outbox SET status=?,last_error=?,next_attempt=? WHERE id=? AND status='sending' AND attempts=?",
    status,
    error,
    nextAttempt,
    job.id,
    job.attempts,
  );
}

function currentRecipient(job: Row) {
  if (
    !one(
      "SELECT id FROM p_outbox WHERE id=? AND status='sending' AND attempts=? AND next_attempt>?",
      job.id,
      job.attempts,
      Date.now(),
    )
  )
    return false;
  if (job.channel !== "email" && job.channel !== "sms") {
    finish(job, "cancelled", "unsupported_channel");
    return false;
  }
  const user = one(
    "SELECT email,phone,preferences FROM p_users WHERE id=?",
    job.user_id,
  );
  if (
    !user ||
    (job.channel === "email" ? user.email : user.phone) !== job.target
  ) {
    finish(job, "cancelled", "recipient_changed");
    return false;
  }
  if (!JSON.parse(user.preferences)[job.channel]) {
    finish(job, "cancelled", "notifications_disabled");
    return false;
  }
  return true;
}

export async function processOutbox() {
  // Leased delivery: an interrupted worker can retry without losing the queue item.
  const jobs = all(
    `SELECT id FROM p_outbox WHERE status IN ('pending','retry','sending') AND next_attempt<=? AND attempts<${outboxAttemptLimit} ORDER BY created_at,rowid LIMIT 20`,
    Date.now(),
  );
  for (const item of jobs) {
    const job = atomic<Row | undefined>(() => {
      const r = one(
        `SELECT * FROM p_outbox WHERE id=? AND status IN ('pending','retry','sending') AND next_attempt<=? AND attempts<${outboxAttemptLimit}`,
        item.id,
        Date.now(),
      );
      if (!r) return;
      run(
        "UPDATE p_outbox SET status='sending',attempts=attempts+1,next_attempt=? WHERE id=?",
        Date.now() + 120000,
        r.id,
      );
      return { ...r, attempts: r.attempts + 1 };
    });
    if (!job) continue;
    try {
      if (!currentRecipient(job)) continue;
      if (job.channel === "email") {
        const key = setting("resend_key"),
          from = setting("email_from");
        if (!key || !from) throw new ApiError(503, "email_not_configured");
        const payload = await outboxEmail(from, job);
        // Rendering loads the locale asynchronously; recheck contact and consent
        // immediately before submitting to the provider.
        if (!currentRecipient(job)) continue;
        const response = await providerFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "Idempotency-Key": job.id,
          },
          body: JSON.stringify(payload),
        });
        if (!response.id) throw new ApiError(503, "provider_rejected");
      } else {
        const key = setting("kavenegar_key"),
          sender = setting("sms_sender");
        if (!key) throw new ApiError(503, "sms_not_configured");
        const response = await providerFetch(
          `https://api.kavenegar.com/v1/${encodeURIComponent(key)}/sms/send.json`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              receptor: smsReceptor(job.target),
              // Kavenegar uses the account's defaultsender when omitted.
              ...(sender ? { sender } : {}),
              message: isWelcomeJob(job.body)
                ? welcomeSms(
                    job.body,
                    brandName(),
                    process.env.APP_ORIGIN || "https://homanets.com",
                  )
                : notificationSms(
                    job.subject,
                    job.body,
                    brandName(),
                    process.env.APP_ORIGIN || "https://homanets.com",
                  ),
            }).toString(),
          },
        );
        if (response.return?.status !== 200)
          throw new ApiError(503, "provider_rejected");
      }
      finish(job, "sent");
    } catch (e) {
      finish(
        job,
        "retry",
        e instanceof ApiError ? e.code : "delivery_failed",
        Date.now() + Math.min(86400000, 60000 * 2 ** (job.attempts - 1)),
      );
    }
  }
}

/** Branded HTML for account notifications queued in p_outbox. */
async function outboxEmail(from: string, job: Row) {
  const brand = await emailBrand("fa");
  if (isWelcomeJob(job.body)) {
    const mail = welcomeEmail(job.body, brand);
    return {
      from: senderAddress(brand.name, from),
      to: [job.target],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    };
  }
  const copy = messagePresentation(job.subject, job.body);
  const mail = renderEmail(
    {
      subject: job.subject + " | " + brand.name,
      preheader: copy.text.slice(0, 120),
      heading: job.subject,
      paragraphs: ["سلام،", ...copy.text.split(/\n+/).filter(Boolean)],
      button: {
        label: copy.action,
        url: brand.origin.replace(/\/$/, "") + "/account?tab=" + copy.tab,
      },
      note: "این پیام دربارهٔ حساب شما در هما نت است. تنظیم اعلان‌های ایمیلی از بخش پروفایل حساب کاربری امکان‌پذیر است.",
    },
    brand,
  );
  return {
    from: senderAddress(brand.name, from),
    to: [job.target],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  };
}
