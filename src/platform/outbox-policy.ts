export const outboxAttemptLimit =
  "(8 + COALESCE((SELECT extra_attempts FROM p_outbox_recovery WHERE job_id=p_outbox.id),0))";
