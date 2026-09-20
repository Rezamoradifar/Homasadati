import { atomic, all, one, run, now } from "./schema";
import { mature, refundOrder } from "./finance";
import { providerFetch, setting } from "./providers";
import { ApiError } from "../server/http";
export async function maintenance() {
  atomic(() => {
    mature();
    run("DELETE FROM p_sessions WHERE expires<?", Date.now());
    run("DELETE FROM p_otp WHERE expires<?", Date.now() - 86400000);
    run(
      "UPDATE p_orders SET checkout_claim=NULL WHERE status='pending' AND expires_at<?",
      now(),
    );
    for (const order of all(
      "SELECT * FROM p_orders WHERE status='pending' AND checkout_claim IS NULL AND expires_at<?",
      now(),
    ))
      refundOrder(order.id, order.user_id, false, "انقضای سفارش پرداخت‌نشده");
  });
  // Leased delivery: an interrupted worker can retry without losing the queue item.
  const jobs = all(
    "SELECT id FROM p_outbox WHERE status IN ('pending','retry','sending') AND next_attempt<=? AND attempts<8 ORDER BY created_at LIMIT 20",
    Date.now(),
  );
  for (const item of jobs) {
    const job = atomic(() => {
      const r = one(
        "SELECT * FROM p_outbox WHERE id=? AND next_attempt<=?",
        item.id,
        Date.now(),
      );
      if (!r) return;
      run(
        "UPDATE p_outbox SET status='sending',attempts=attempts+1,next_attempt=? WHERE id=?",
        Date.now() + 120000,
        r.id,
      );
      return r;
    });
    if (!job) continue;
    try {
      const user = one("SELECT * FROM p_users WHERE id=?", job.user_id);
      if (!user || !JSON.parse(user.preferences)[job.channel]) {
        run("UPDATE p_outbox SET status='cancelled' WHERE id=?", job.id);
        continue;
      }
      if (job.channel === "email") {
        const key = setting("resend_key"),
          from = setting("email_from");
        if (!key || !from) throw new ApiError(503, "email_not_configured");
        const response = await providerFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "Idempotency-Key": job.id,
          },
          body: JSON.stringify({
            from,
            to: [job.target],
            subject: job.subject,
            text: job.body,
          }),
        });
        if (!response.id) throw new ApiError(502, "provider_rejected");
      } else {
        const key = setting("kavenegar_key"),
          sender = setting("sms_sender");
        if (!key || !sender) throw new ApiError(503, "sms_not_configured");
        const response = await providerFetch(
          `https://api.kavenegar.com/v1/${encodeURIComponent(key)}/sms/send.json`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              receptor: job.target.replace(/^\+/, "00"),
              sender,
              message: job.subject + "\n" + job.body,
            }).toString(),
          },
        );
        if (response.return?.status !== 200)
          throw new ApiError(502, "provider_rejected");
      }
      run(
        "UPDATE p_outbox SET status='sent',last_error=NULL WHERE id=?",
        job.id,
      );
    } catch (e) {
      run(
        "UPDATE p_outbox SET status='retry',last_error=?,next_attempt=? WHERE id=?",
        e instanceof ApiError ? e.code : "delivery_failed",
        Date.now() + Math.min(86400000, 60000 * 2 ** job.attempts),
        job.id,
      );
    }
  }
}
