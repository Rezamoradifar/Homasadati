import { randomUUID } from "node:crypto";
import { ApiError } from "../server/http";
import { deliverDigiPayPurchase, refundDigiPayPurchase, inquireDigiPayRefund, type DigiPayPurchaseType } from "./digipay";
import { assertDigiPayEnvironment, digipayErrorCode } from "./digipay-payments";
import { digipayRefundHeldOrderIdsSql } from "./digipay-financial-holds";
import { refundOrder } from "./finance";
import { digipayVatFromOrder } from "./checkout-vat";
import { all, atomic, now, one, run } from "./schema";
import { audit } from "./security";

/** Refunds have their own durable providerId. A timeout must be reconciled
 * using that same identifier; it must never generate a second refund request. */
export async function refundDigiPayOrder(orderId: string, actor: string, isAdmin = false, reason = "درخواست برگشت از دیجی‌پی") {
  let created = false;
  const refund = atomic(() => {
    const o = one("SELECT * FROM p_orders WHERE id=?", orderId);
    if (!o || (!isAdmin && o.user_id !== actor)) throw new ApiError(404, "not_found");
    if (o.payment_method !== "digipay") throw new ApiError(409, "invalid_state");
    if (["refunded", "cancelled"].includes(o.status) || !o.paid_at) return { order: refundOrder(orderId, actor, isAdmin, reason) };
    // Only an authenticated terminal failure permits an explicit new request.
    // Keep failed attempts for audit; pending/ambiguous requests reuse their ID.
    const existing = one("SELECT * FROM p_digipay_refunds WHERE order_id=? AND status!='failed' ORDER BY created_at DESC LIMIT 1", orderId);
    if (existing) return existing;
    if (!isAdmin && (["shipped", "delivered"].includes(o.status) || !o.cancel_until || now() > o.cancel_until))
      throw new ApiError(409, "cancellation_expired");
    const p = one("SELECT p.* FROM p_digipay_payments p JOIN p_checkout_items i ON i.checkout_id=p.checkout_id WHERE i.order_id=? AND p.status='paid'", orderId);
    if (!p || !p.tracking_code || !p.verified_at) throw new ApiError(409, "digipay_verification_pending");
    assertDigiPayEnvironment(p);
    if (one("SELECT payment_id FROM p_digipay_deliveries WHERE payment_id=? AND status='sending'", p.id))
      throw new ApiError(409, "digipay_refund_pending");
    const reserved = one("SELECT COALESCE(SUM(amount_rial),0) total FROM p_digipay_refunds WHERE payment_id=? AND status!='failed'", p.id)!.total;
    const amountRial = (o.amount + digipayVatFromOrder(o)) * 10;
    if (!Number.isSafeInteger(amountRial) || amountRial <= 0 || reserved + amountRial > p.amount_rial)
      throw new ApiError(409, "invalid_state");
    const id = randomUUID(), at = now();
    run("INSERT INTO p_digipay_refunds(id,payment_id,order_id,actor_id,reason,amount_rial,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'requesting',?,?)",
      id, p.id, orderId, actor, reason.slice(0, 2000), amountRial, at, at);
    audit(actor, "payment.digipay.refund_requested", orderId, null, { refund: id, amountRial }, reason);
    created = true;
    return one("SELECT * FROM p_digipay_refunds WHERE id=?", id)!;
  });
  if (refund.order) return refund.order;
  if (created) {
    const p = one("SELECT * FROM p_digipay_payments WHERE id=?", refund.payment_id)!;
    try {
      const accepted = await refundDigiPayPurchase({ providerId: refund.id, saleTrackingCode: p.tracking_code,
        amountRial: refund.amount_rial, type: p.payment_type as DigiPayPurchaseType });
      if (accepted.providerId !== refund.id || accepted.amountRial !== refund.amount_rial || accepted.type !== p.payment_type)
        throw new ApiError(409, "payment_unverified");
      run("UPDATE p_digipay_refunds SET tracking_code=?,status='pending',updated_at=? WHERE id=? AND status='requesting'", accepted.trackingCode, now(), refund.id);
    } catch (error) {
      run("UPDATE p_digipay_refunds SET status='pending',last_error=?,updated_at=? WHERE id=? AND status='requesting'", digipayErrorCode(error), now(), refund.id);
    }
  }
  await reconcileDigiPayRefund(refund.id);
  const done = one("SELECT completed_at,status FROM p_digipay_refunds WHERE id=?", refund.id)!;
  if (done.completed_at) return one("SELECT * FROM p_orders WHERE id=?", orderId)!;
  throw new ApiError(409, done.status === "failed" ? "digipay_refund_failed" : "digipay_refund_pending");
}

function finalizeRefund(id: string) {
  return atomic(() => {
    const r = one("SELECT * FROM p_digipay_refunds WHERE id=?", id)!;
    if (r.status !== "succeeded" || r.completed_at) return;
    // Cancellation permission/time were checked when the request was recorded.
    // It may finish later; authenticated success must still reverse that sale.
    refundOrder(r.order_id, r.actor_id, true, r.reason);
    run("UPDATE p_digipay_refunds SET completed_at=?,updated_at=?,last_error=NULL WHERE id=?", now(), now(), id);
  });
}

export async function reconcileDigiPayRefund(id: string) {
  const r = one("SELECT * FROM p_digipay_refunds WHERE id=?", id);
  if (!r || r.completed_at || ["failed", "review"].includes(r.status)) return;
  if (r.status === "succeeded") {
    try { finalizeRefund(id); }
    catch (error) { run("UPDATE p_digipay_refunds SET last_error=?,updated_at=? WHERE id=?", digipayErrorCode(error), now(), id); }
    return;
  }
  // A newly-created request may still be in flight in a different process.
  if (r.status === "requesting" && Date.now() - Date.parse(r.created_at) < 90_000) return;
  const claim = randomUUID(), at = now(), stale = new Date(Date.now() - 90_000).toISOString();
  if (!run("UPDATE p_digipay_refunds SET claim=?,claimed_at=?,attempts=attempts+1 WHERE id=? AND status IN ('requesting','pending') AND (claim IS NULL OR claimed_at<?)", claim, at, id, stale).changes) return;
  try {
    const p = one("SELECT * FROM p_digipay_payments WHERE id=?", r.payment_id)!;
    assertDigiPayEnvironment(p);
    const result = await inquireDigiPayRefund({ providerId: r.id, trackingCode: r.tracking_code || undefined, type: p.payment_type as DigiPayPurchaseType });
    if (result.providerId !== r.id || (r.tracking_code && result.trackingCode !== r.tracking_code))
      throw new ApiError(409, "payment_unverified");
    run("UPDATE p_digipay_refunds SET status=?,tracking_code=COALESCE(tracking_code,?),claim=NULL,claimed_at=NULL,last_error=NULL,updated_at=? WHERE id=? AND claim=?",
      result.outcome, result.trackingCode || null, now(), id, claim);
    if (result.outcome === "succeeded") finalizeRefund(id);
  } catch (error) {
    run("UPDATE p_digipay_refunds SET claim=NULL,claimed_at=NULL,last_error=?,updated_at=? WHERE id=? AND claim=?", digipayErrorCode(error), now(), id, claim);
    // A confirmed external refund remains durable even if local reversal failed.
    if (one("SELECT status FROM p_digipay_refunds WHERE id=?", id)?.status === "succeeded")
      run("UPDATE p_digipay_refunds SET last_error=?,updated_at=? WHERE id=?", digipayErrorCode(error), now(), id);
  }
}

export function assertNoPendingDigiPayRefund(orderId: string) {
  if (one(`SELECT id FROM p_orders WHERE id=? AND id IN (${digipayRefundHeldOrderIdsSql})`, orderId))
    throw new ApiError(409, "digipay_refund_pending");
}

/** Called after staff records actual delivery. Creating a payment never calls
 * this. A multi-line checkout is delivered only after every remaining line. */
export async function queueDigiPayDelivery(orderId: string) {
  const p = one("SELECT p.* FROM p_digipay_payments p JOIN p_checkout_items i ON i.checkout_id=p.checkout_id WHERE i.order_id=? AND p.status='paid'", orderId);
  if (!p || ![5, 13].includes(p.payment_type)) return;
  const orders = all("SELECT o.* FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=?", p.checkout_id);
  if (orders.some(o => !["delivered", "refunded"].includes(o.status))) return;
  if (one(`SELECT id FROM p_digipay_refunds WHERE payment_id=? AND order_id IN (${digipayRefundHeldOrderIdsSql})`, p.id)) return;
  const products = [...new Set(orders.filter(o => o.status === "delivered").map(o => JSON.parse(o.policy).orderTerms.digipayItem.productCode as string))];
  if (!products.length) return;
  const at = now(), payload = { trackingCode: p.tracking_code, type: p.payment_type as 5 | 13,
    deliveryDate: Date.now(), invoiceNumber: p.checkout_id, products };
  run("INSERT OR IGNORE INTO p_digipay_deliveries(payment_id,status,payload,created_at,updated_at) VALUES(?,'pending',?,?,?)", p.id, JSON.stringify(payload), at, at);
  await sendDigiPayDelivery(p.id);
}

export async function sendDigiPayDelivery(paymentId: string) {
  const d = one("SELECT * FROM p_digipay_deliveries WHERE payment_id=?", paymentId);
  if (!d || !["pending", "sending"].includes(d.status)) return;
  const stale = new Date(Date.now() - 90_000).toISOString(), claim = randomUUID();
  if (!run("UPDATE p_digipay_deliveries SET status='sending',claim=?,claimed_at=?,attempts=attempts+1 WHERE payment_id=? AND (status='pending' OR (status='sending' AND claimed_at<?))", claim, now(), paymentId, stale).changes) return;
  try {
    const p = one("SELECT * FROM p_digipay_payments WHERE id=?", paymentId)!;
    assertDigiPayEnvironment(p);
    const orders = all("SELECT o.status FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=?", p.checkout_id);
    if (orders.some(o => !["delivered", "refunded"].includes(o.status)) ||
      one(`SELECT id FROM p_digipay_refunds WHERE payment_id=? AND order_id IN (${digipayRefundHeldOrderIdsSql})`, p.id))
      throw new ApiError(409, "digipay_refund_pending");
    // A refund after queueing changes the provider's delivered product list.
    const remaining = all("SELECT o.policy FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=? AND o.status='delivered'", p.checkout_id);
    const products = [...new Set(remaining.map(o => JSON.parse(o.policy).orderTerms.digipayItem.productCode as string))];
    if (!products.length) {
      run("UPDATE p_digipay_deliveries SET status='not_required',claim=NULL,claimed_at=NULL,updated_at=? WHERE payment_id=? AND claim=?", now(), paymentId, claim);
      return;
    }
    const payload = { ...JSON.parse(d.payload), products };
    run("UPDATE p_digipay_deliveries SET payload=? WHERE payment_id=? AND claim=?", JSON.stringify(payload), paymentId, claim);
    await deliverDigiPayPurchase(payload);
    run("UPDATE p_digipay_deliveries SET status='delivered',claim=NULL,claimed_at=NULL,last_error=NULL,updated_at=?,delivered_at=? WHERE payment_id=? AND claim=?", now(), now(), paymentId, claim);
  } catch (error) {
    run("UPDATE p_digipay_deliveries SET status=CASE WHEN attempts>=20 THEN 'review' ELSE 'pending' END,claim=NULL,claimed_at=NULL,last_error=?,updated_at=? WHERE payment_id=? AND claim=?", digipayErrorCode(error), now(), paymentId, claim);
  }
}

export async function processDigiPayFollowups(max = 5) {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  for (const r of all("SELECT id FROM p_digipay_refunds WHERE completed_at IS NULL AND status IN ('requesting','pending','succeeded') AND updated_at<? ORDER BY updated_at LIMIT ?", cutoff, max))
    await reconcileDigiPayRefund(r.id);
  // Also covers delivery completed before a partial refund finished.
  for (const o of all(`SELECT o.id FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id
    JOIN p_digipay_payments p ON p.checkout_id=i.checkout_id LEFT JOIN p_digipay_deliveries d ON d.payment_id=p.id
    WHERE o.status='delivered' AND p.status='paid' AND p.payment_type IN (5,13) AND d.payment_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM p_checkout_items ci JOIN p_orders other ON other.id=ci.order_id
        WHERE ci.checkout_id=p.checkout_id AND other.status NOT IN ('delivered','refunded'))
      AND NOT EXISTS(SELECT 1 FROM p_digipay_refunds r WHERE r.payment_id=p.id AND r.order_id IN (${digipayRefundHeldOrderIdsSql}))
    GROUP BY p.id ORDER BY p.created_at LIMIT ?`, max))
    await queueDigiPayDelivery(o.id);
  for (const d of all("SELECT payment_id FROM p_digipay_deliveries WHERE status IN ('pending','sending') AND updated_at<? ORDER BY updated_at LIMIT ?", cutoff, max))
    await sendDigiPayDelivery(d.payment_id);
}
