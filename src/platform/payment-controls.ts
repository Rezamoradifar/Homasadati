import { one, run, now } from "./schema";
import { assertAccess } from "./access";
import { ApiError } from "../server/http";
export function paymentActor(
  actor: string,
  resource: string,
  beneficiary?: string,
) {
  const user = one("SELECT * FROM p_users WHERE id=? AND blocked=0", actor);
  if (!user) throw new ApiError(403, "forbidden");
  assertAccess(user, resource, true);
  if (actor === beneficiary) throw new ApiError(403, "self_payment_review");
  return user;
}
export function approveWithdrawal(
  id: string,
  actor: string,
  beneficiary: string,
) {
  paymentActor(actor, "withdrawals", beneficiary);
  const old = one(
    "SELECT * FROM p_withdrawal_reviews WHERE withdrawal_id=?",
    id,
  );
  if (old?.second_actor) throw new ApiError(409, "invalid_state");
  run(
    "INSERT INTO p_withdrawal_reviews(withdrawal_id,first_actor,approved_at) VALUES(?,?,?) ON CONFLICT(withdrawal_id) DO UPDATE SET first_actor=excluded.first_actor,approved_at=excluded.approved_at",
    id,
    actor,
    now(),
  );
}
export function confirmWithdrawal(
  id: string,
  actor: string,
  beneficiary: string,
) {
  paymentActor(actor, "withdrawals", beneficiary);
  const review = one(
    "SELECT * FROM p_withdrawal_reviews WHERE withdrawal_id=?",
    id,
  );
  if (!review) throw new ApiError(409, "first_approval_required");
  if (review.first_actor === actor)
    throw new ApiError(403, "second_approver_required");
  paymentActor(review.first_actor, "withdrawals", beneficiary);
  run(
    "UPDATE p_withdrawal_reviews SET second_actor=?,paid_at=? WHERE withdrawal_id=?",
    actor,
    now(),
    id,
  );
}
