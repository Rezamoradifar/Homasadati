import { all, atomic, one, run, now, type Row } from "./schema";
import { audit } from "./security";
import { ApiError } from "../server/http";
import { outboxErrors, outboxRetrySchema } from "./outbox-model";

// Each owner-approved recovery grants exactly one additional attempt. The
// attempt counter is never reset: it is also the worker's fencing token.

function eligible(job: Row) {
  const prefs = JSON.parse(job.preferences || "{}");
  return (
    ["email", "sms"].includes(job.channel) &&
    (job.channel === "email" ? job.email : job.phone) === job.target &&
    prefs[job.channel] === true
  );
}
function recoverable(job: Row) {
  return (
    (job.status === "retry" ||
      (job.status === "sending" && job.next_attempt <= Date.now())) &&
    job.attempts >= 8 + job.extra_attempts &&
    job.extra_attempts < 3 &&
    eligible(job)
  );
}
function maskedTarget(job: Row) {
  if (job.channel === "email") return job.target.slice(0, 1) + "***@***";
  return "***" + job.target.slice(-4);
}
const select = `SELECT p_outbox.*, u.email, u.phone, u.preferences,
 COALESCE(r.extra_attempts,0) extra_attempts FROM p_outbox
 JOIN p_users u ON u.id=p_outbox.user_id
 LEFT JOIN p_outbox_recovery r ON r.job_id=p_outbox.id`;

export function outboxFailures(page: number) {
  const rows = all(
    select +
      " WHERE p_outbox.status IN ('retry','sending','cancelled') ORDER BY p_outbox.created_at DESC,p_outbox.id LIMIT 21 OFFSET ?",
    (page - 1) * 20,
  );
  return {
    hasMore: rows.length > 20,
    rows: rows.slice(0, 20).map((job) => ({
      id: job.id,
      channel: job.channel,
      target: maskedTarget(job),
      status: job.status,
      attempts: job.attempts,
      extraAttempts: job.extra_attempts,
      createdAt: job.created_at,
      nextAttempt: job.next_attempt,
      error:
        job.last_error && Object.hasOwn(outboxErrors, job.last_error)
          ? job.last_error
          : "delivery_failed",
      canRetry: recoverable(job),
    })),
  };
}

export function retryOutbox(actorId: string, input: unknown) {
  const data = outboxRetrySchema.parse(input);
  return atomic(() => {
    const job = one(select + " WHERE p_outbox.id=?", data.id);
    if (!job) throw new ApiError(404, "not_found");
    if (job.attempts !== data.attempts || !recoverable(job))
      throw new ApiError(409, "outbox_retry_unavailable");
    run(
      "INSERT INTO p_outbox_recovery(job_id,extra_attempts,updated_at) VALUES(?,1,?) ON CONFLICT(job_id) DO UPDATE SET extra_attempts=extra_attempts+1,updated_at=excluded.updated_at",
      job.id,
      now(),
    );
    run("UPDATE p_outbox SET status='retry',next_attempt=0 WHERE id=?", job.id);
    audit(
      actorId,
      "outbox.retry",
      job.id,
      {
        status: job.status,
        attempts: job.attempts,
        extraAttempts: job.extra_attempts,
      },
      {
        status: "retry",
        attempts: job.attempts,
        extraAttempts: job.extra_attempts + 1,
        checkedDelivery: true,
      },
      data.reason,
    );
    return { ok: true };
  });
}
