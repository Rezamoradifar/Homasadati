import { randomUUID } from "node:crypto";
import { ApiError, limit } from "../server/http";
import { assertPurchasesOpen } from "./card-schedule";
import { settleCheckout } from "./checkout";
import { createDigiPayTicket, digipayConfig, verifyDigiPayPurchase, type DigiPayBasketItem, type DigiPayPurchaseType } from "./digipay";
import { digipayCheckoutEnabled, digipayPhone } from "./digipay-basket";
import { digipayVatFromOrder } from "./checkout-vat";
import { purchaseActivationReceipt } from "./purchase-activation-receipt";
import { all, atomic, now, one, run, type Row } from "./schema";
import { audit } from "./security";

export type DigiPayOutcome = "paid" | "pending" | "review" | "unknown_payment";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACKING = /^[A-Za-z0-9_-]{1,160}$/;
const TYPES = [0, 5, 11, 13, 24];
const payment = (id: string) => one("SELECT * FROM p_digipay_payments WHERE id=?", id);
export const digipayErrorCode = (error: unknown) => error instanceof ApiError
  ? error.code.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80) : "provider_unavailable";

export function assertDigiPayEnvironment(p: Row) {
  const config = digipayConfig();
  if (p.environment !== config.environment ||
    (process.env.NODE_ENV === "production" && p.environment !== "production"))
    throw new ApiError(503, "payment_not_configured");
}

function gateway(p: Row, status: "requested" | "request_failed" | "paid", code: string, reference: string | null = null) {
  const at = now();
  run(`INSERT INTO p_gateway_transactions(id,gateway,authority,ref_kind,ref_id,user_id,amount,status,bank_reference,code,created_at,updated_at)
    VALUES(?,'digipay',?,'checkout',?,?,?,?,?,?,?,?)
    ON CONFLICT(authority) DO UPDATE SET status=excluded.status,bank_reference=excluded.bank_reference,code=excluded.code,updated_at=excluded.updated_at`,
    randomUUID(), "digipay:" + p.id, p.checkout_id, p.user_id, p.amount, status, reference, code, at, at);
}

/** One server-priced basket per attempt. The order snapshots are created
 * before stock is reserved and cannot be replaced by browser-supplied items. */
function storedBasket(checkout: Row): DigiPayBasketItem[] {
  const orders = all("SELECT o.* FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=?", checkout.id);
  if (!orders.length || orders.some(o => o.status !== "pending" || o.payment_method !== "digipay") ||
    orders.reduce((total, o) => total + o.amount + digipayVatFromOrder(o), 0) !== checkout.amount)
    throw new ApiError(409, "invalid_state");
  return orders.map(o => {
    const item = JSON.parse(o.policy)?.orderTerms?.digipayItem as DigiPayBasketItem | undefined;
    if (!item || item.count !== o.quantity) throw new ApiError(409, "digipay_basket_not_configured");
    return item;
  });
}

export async function startDigiPayPayment(checkoutId: string, userId: string) {
  const c = one("SELECT * FROM p_checkouts WHERE id=? AND user_id=?", checkoutId, userId);
  if (!c) throw new ApiError(404, "not_found");
  if (c.method !== "digipay") throw new ApiError(409, "invalid_state");
  if (c.status === "paid") return { status: "paid" as const, id: c.id };
  const existing = one("SELECT * FROM p_digipay_payments WHERE checkout_id=? AND status IN ('creating','pending','verified','paid','review') ORDER BY created_at DESC LIMIT 1", c.id);
  if (existing) {
    assertDigiPayEnvironment(existing);
    if (existing.status === "verified") {
      if (settleVerifiedDigiPay(existing.id) === "paid") return { status: "paid" as const, id: c.id };
      throw new ApiError(409, "digipay_verification_pending");
    }
    if (existing.status === "creating") throw new ApiError(409, "payment_request_in_progress");
    if (existing.status === "pending" && existing.callback_tracking) {
      if (await verifyDigiPayPayment(existing.id) === "paid") return { status: "paid" as const, id: c.id };
    }
    // Never issue a second ticket while the first may have been paid. A stale
    // or missing callback needs provider reconciliation, not another charge.
    if (existing.status === "pending" && !existing.callback_tracking && existing.redirect_url &&
      c.expires_at > now() && Date.now() - Date.parse(existing.created_at) < 15 * 60_000)
      return { status: "redirect" as const, url: existing.redirect_url as string };
    throw new ApiError(409, "digipay_verification_pending");
  }
  assertPurchasesOpen();
  if (!digipayCheckoutEnabled()) throw new ApiError(503, "payment_not_configured");
  if (c.status !== "pending" || c.expires_at <= now()) throw new ApiError(409, "invalid_state");
  const amountRial = c.amount * 10;
  if (!Number.isSafeInteger(amountRial) || amountRial <= 0) throw new ApiError(400, "invalid_input");
  const items = storedBasket(c), cellNumber = digipayPhone(userId), id = randomUUID(), at = now();
  const config = digipayConfig();
  try {
    run("INSERT INTO p_digipay_payments(id,checkout_id,user_id,environment,amount,amount_rial,status,basket,created_at,updated_at) VALUES(?,?,?,?,?,?,'creating',?,?,?)",
      id, c.id, userId, config.environment, c.amount, amountRial, JSON.stringify(items), at, at);
  } catch { throw new ApiError(409, "payment_request_in_progress"); }
  try {
    const ticket = await createDigiPayTicket({
      providerId: id, amountRial, cellNumber,
      callbackUrl: `${config.origin}/api/platform/payment/digipay/callback?pid=${id}`,
      basketId: c.id, items,
    });
    atomic(() => {
      if (!run("UPDATE p_digipay_payments SET status='pending',ticket=?,redirect_url=?,updated_at=? WHERE id=? AND status='creating'",
        ticket.ticket, ticket.redirectUrl, now(), id).changes) throw new ApiError(409, "invalid_state");
      gateway(payment(id)!, "requested", "ticket_created");
    });
    return { status: "redirect" as const, url: ticket.redirectUrl };
  } catch (error) {
    // No URL was returned to the customer. A ticket alone cannot pay a basket.
    run("UPDATE p_digipay_payments SET status='request_failed',last_error=?,updated_at=? WHERE id=? AND status='creating'", digipayErrorCode(error), now(), id);
    if (payment(id)?.status === "request_failed") gateway(payment(id)!, "request_failed", digipayErrorCode(error));
    throw error instanceof ApiError ? error : new ApiError(503, "provider_unavailable");
  }
}

/** The authenticated response is committed before local settlement. If the
 * process stops between the two, recovery does not need to repeat a potentially
 * non-repeatable provider verification or guess an 'already verified' code. */
export async function verifyDigiPayPayment(paymentId: string): Promise<DigiPayOutcome> {
  const p = payment(paymentId);
  if (!p) return "unknown_payment";
  if (p.status === "paid") return "paid";
  if (p.status === "review") return "review";
  if (p.status === "verified") return settleVerifiedDigiPay(p.id);
  if (p.status !== "pending" || !p.callback_tracking || !TYPES.includes(p.callback_type)) return "pending";
  const claim = randomUUID(), at = now(), stale = new Date(Date.now() - 90_000).toISOString();
  if (!run("UPDATE p_digipay_payments SET verify_claim=?,claimed_at=?,verify_attempts=verify_attempts+1 WHERE id=? AND status='pending' AND (verify_claim IS NULL OR claimed_at<?)",
    claim, at, p.id, stale).changes) return "pending";
  try {
    assertDigiPayEnvironment(p);
    const result = await verifyDigiPayPurchase({ providerId: p.id, trackingCode: p.callback_tracking,
      type: p.callback_type as DigiPayPurchaseType, amountRial: p.amount_rial });
    // Defence in depth: even a replaced test adapter cannot bypass binding.
    if (result.providerId !== p.id || result.trackingCode !== p.callback_tracking ||
      result.amountRial !== p.amount_rial || result.type !== p.callback_type)
      throw new ApiError(409, "payment_unverified");
    atomic(() => {
      const other = one("SELECT id FROM p_digipay_payments WHERE tracking_code=? AND id!=?", result.trackingCode, p.id);
      if (other) {
        run("UPDATE p_digipay_payments SET status='review',last_error='duplicate_transaction',verify_claim=NULL,claimed_at=NULL,updated_at=? WHERE id=? AND verify_claim=?", now(), p.id, claim);
        return;
      }
      run("UPDATE p_digipay_payments SET status='verified',tracking_code=?,payment_type=?,verified_at=?,verify_claim=NULL,claimed_at=NULL,last_error=NULL,updated_at=? WHERE id=? AND status='pending' AND verify_claim=?",
        result.trackingCode, result.type, now(), now(), p.id, claim);
    });
    return settleVerifiedDigiPay(p.id);
  } catch (error) {
    run("UPDATE p_digipay_payments SET last_error=?,verify_claim=NULL,claimed_at=NULL,updated_at=? WHERE id=? AND verify_claim=?",
      digipayErrorCode(error), now(), p.id, claim);
    return payment(p.id)?.status === "review" ? "review" : "pending";
  }
}

function settleVerifiedDigiPay(id: string): DigiPayOutcome {
  try {
    return atomic(() => {
      const p = payment(id)!;
      if (p.status === "paid") return "paid";
      if (p.status !== "verified" || !p.tracking_code || !p.verified_at) return p.status === "review" ? "review" : "pending";
      assertDigiPayEnvironment(p);
      const c = one("SELECT * FROM p_checkouts WHERE id=?", p.checkout_id)!;
      const reference = "digipay:" + p.tracking_code;
      const invalid = c.method !== "digipay" || c.amount !== p.amount ||
        (c.status === "paid" && c.payment_ref !== reference) ||
        all("SELECT o.status,o.payment_ref FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=?", c.id)
          .some(o => o.status !== "pending" && !(o.payment_ref as string | null)?.startsWith(reference + ":"));
      if (invalid) {
        run("UPDATE p_digipay_payments SET status='review',last_error='digipay_refund_required',updated_at=? WHERE id=?", now(), id);
        audit(p.user_id, "payment.digipay.review", id, null, { checkout: c.id, reason: "settlement_conflict" });
        return "review";
      }
      settleCheckout(c.id, reference);
      run("UPDATE p_digipay_payments SET status='paid',last_error=NULL,updated_at=? WHERE id=?", now(), id);
      gateway(p, "paid", "verified", p.tracking_code);
      return "paid";
    });
  } catch (error) {
    run("UPDATE p_digipay_payments SET last_error=?,updated_at=? WHERE id=? AND status='verified'", digipayErrorCode(error), now(), id);
    return "pending";
  }
}

export async function handleDigiPayCallback(fields: URLSearchParams): Promise<{ outcome: DigiPayOutcome; paymentId?: string }> {
  const pid = fields.get("pid") || "";
  if (!UUID.test(pid)) return { outcome: "unknown_payment" };
  const p = payment(pid);
  if (!p) return { outcome: "unknown_payment" };
  const amount = fields.get("amount") || "", type = fields.get("type") || "", tracking = fields.get("trackingCode") || "";
  if (fields.get("providerId") !== p.id || !/^\d+$/.test(amount) || Number(amount) !== p.amount_rial ||
    !/^\d+$/.test(type) || !TYPES.includes(Number(type)) || !TRACKING.test(tracking) ||
    !["SUCCESS", "FAILURE"].includes(fields.get("result") || ""))
    return { outcome: "unknown_payment" };
  // The callback is intentionally cross-origin. Limit only a recognised,
  // fully bound attempt, not all visitors behind an untrusted reverse proxy:
  // a burst of malformed callbacks must not block unrelated real payments.
  // The provider's normal retry behavior remains comfortably below this cap.
  limit("digipay-callback:" + p.id, 12, 60);
  if (p.status === "pending" || (p.status === "review" && !p.verified_at && ["callback_missing", "verification_stalled"].includes(p.last_error))) {
    // These remain untrusted candidate identifiers, separate from the UNIQUE
    // authenticated tracking_code. Forged callbacks cannot reserve another sale.
    run("UPDATE p_digipay_payments SET status='pending',callback_tracking=?,callback_type=?,updated_at=? WHERE id=? AND status IN ('pending','review') AND verified_at IS NULL AND verify_claim IS NULL",
      tracking, Number(type), now(), p.id);
  }
  return { outcome: await verifyDigiPayPayment(p.id), paymentId: p.id };
}

/** Operator recovery only supplies provider-issued identifiers. It has no
 * manual success override: the normal authenticated verification still runs. */
export async function reconcileDigiPayPayment(id: string, actor: string, trackingCode: string, type: DigiPayPurchaseType, reason: string) {
  if (!TRACKING.test(trackingCode) || !TYPES.includes(type)) throw new ApiError(400, "invalid_input");
  const p = payment(id);
  if (!p) throw new ApiError(404, "not_found");
  assertDigiPayEnvironment(p);
  if (p.status === "review" && (p.verified_at || !["callback_missing", "verification_stalled"].includes(p.last_error)))
    throw new ApiError(409, "digipay_refund_required");
  if (p.status === "pending" || p.status === "review") {
    if (!run("UPDATE p_digipay_payments SET status='pending',callback_tracking=?,callback_type=?,last_error=NULL,updated_at=? WHERE id=? AND status IN ('pending','review') AND verify_claim IS NULL", trackingCode, type, now(), id).changes)
      throw new ApiError(409, "payment_request_in_progress");
  }
  audit(actor, "payment.digipay.reconcile", id, null, { trackingCode, type }, reason);
  const outcome = await verifyDigiPayPayment(id);
  return { id, outcome, status: payment(id)!.status };
}

export async function recheckPendingDigiPayPayments(max = 10) {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const rows = all("SELECT id FROM p_digipay_payments WHERE (status='verified' OR (status='pending' AND callback_tracking IS NOT NULL)) AND updated_at<? ORDER BY updated_at LIMIT ?", cutoff, max);
  for (const row of rows) await verifyDigiPayPayment(row.id);
  // No browser could receive a URL from an attempt that never became pending.
  run("UPDATE p_digipay_payments SET status='request_failed',last_error='interrupted_ticket_request',updated_at=? WHERE status='creating' AND created_at<?", now(), new Date(Date.now() - 5 * 60_000).toISOString());
  // The official UPG contract has no purchase lookup without a tracking code.
  // Escalate stale ambiguity visibly; never release stock on an assumed failure.
  run("UPDATE p_digipay_payments SET status='review',last_error=CASE WHEN callback_tracking IS NULL THEN 'callback_missing' ELSE 'verification_stalled' END,verify_claim=NULL,claimed_at=NULL,updated_at=? WHERE status='pending' AND created_at<? AND (verify_claim IS NULL OR claimed_at<?)", now(), new Date(Date.now() - 24 * 3600_000).toISOString(), new Date(Date.now() - 90_000).toISOString());
  return rows.length;
}

export function digipayPaymentSummary(id: string, userId: string) {
  const p = one("SELECT p.id,p.status,p.amount,p.tracking_code,p.checkout_id,c.status checkout_status FROM p_digipay_payments p JOIN p_checkouts c ON c.id=p.checkout_id WHERE p.id=? AND p.user_id=?", id, userId);
  if (!p) throw new ApiError(404, "not_found");
  const paid = p.status === "paid" && p.checkout_status === "paid";
  const orders = all("SELECT o.id,o.status,o.amount,o.paid_at,o.refunded_at FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=?", p.checkout_id);
  const refunded = paid && orders.length > 0 && orders.every(o => o.status === "refunded");
  return {
    status: refunded ? "refunded" : p.status === "verified" ? "pending" : p.status,
    amount: p.amount, reference: paid ? p.tracking_code : null,
    orders: orders.map(o => String(o.id).slice(0, 8).toUpperCase()),
    checkoutPaid: paid, activationReceipt: paid && !refunded ? purchaseActivationReceipt(userId) : null,
    paidPurchaseVolume: orders.filter(o => o.paid_at && !o.refunded_at && !["cancelled", "refunded"].includes(o.status)).reduce((sum, o) => sum + o.amount, 0),
  };
}
