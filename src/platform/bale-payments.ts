import {purchaseActivationReceipt} from "./purchase-activation-receipt";
import { assertPurchasesOpen } from "./card-schedule";
import { randomUUID } from "node:crypto";
import { ApiError } from "../server/http";
import { balePayClient, balePayConfig, balePayEnabled, safeRedirect, type BaleVerifyResult } from "./bale-pay";
import { settleCheckout } from "./checkout";
import { all, atomic, now, one, run, type Row } from "./schema";
import { audit } from "./security";

/**
 * Bale payments for a checkout, on the same model as the Zarinpal flow:
 * the checkout (and its orders) already exist with a server-computed amount;
 * a payment attempt is opened with Bale; the callback only identifies the
 * attempt; the order is settled only after a server-to-server verification
 * whose amount, reference and merchant match what Homanets stored.
 *
 * Amounts: p_checkouts.amount is toman (the project's unit); Bale is sent rial.
 */
const RIAL_PER_TOMAN = 10;
/** A redirect older than this is re-verified before a new attempt is opened. */
const REUSE_MS = 15 * 60_000;

export type BaleOutcome = "paid" | "failed" | "cancelled" | "pending" | "unknown_payment";

function callbackUrl(paymentId: string) {
  const origin = process.env.APP_ORIGIN;
  if (!origin || !origin.startsWith("https://")) throw new ApiError(503, "payment_not_configured");
  return `${new URL(origin).origin}/api/platform/payment/bale/callback?pid=${paymentId}`;
}

const payment = (id: string) => one("SELECT * FROM p_bale_payments WHERE id=?", id);

function mark(id: string, from: string[], fields: Record<string, string | number | null>) {
  const keys = Object.keys(fields);
  return run(
    `UPDATE p_bale_payments SET ${keys.map((k) => k + "=?").join(",")},updated_at=? WHERE id=? AND status IN (${from.map(() => "?").join(",")})`,
    ...keys.map((k) => fields[k]),
    now(),
    id,
    ...from,
  ).changes;
}

/** Opens (or resumes) a Bale payment for the member's own pending checkout
 * and returns only the URL to send the customer to. */
export async function startBalePayment(checkoutId: string, userId: string) {
  assertPurchasesOpen();
  if (!balePayEnabled()) throw new ApiError(503, "payment_not_configured");
  const c = one("SELECT * FROM p_checkouts WHERE id=? AND user_id=?", checkoutId, userId);
  if (!c) throw new ApiError(404, "not_found");
  if (c.method !== "bale") throw new ApiError(409, "invalid_state");
  if (c.status === "paid") return { status: "paid" as const };
  if (c.status !== "pending" || c.expires_at <= now()) throw new ApiError(409, "invalid_state");

  const open = one(
    "SELECT * FROM p_bale_payments WHERE checkout_id=? AND status IN ('creating','pending') ORDER BY created_at DESC LIMIT 1",
    c.id,
  );
  if (open) {
    if (open.status === "creating") throw new ApiError(409, "payment_request_in_progress");
    if (Date.now() - Date.parse(open.created_at) < REUSE_MS && open.redirect_url)
      return { status: "redirect" as const, url: open.redirect_url as string };
    // An older attempt may have been paid after all: find out before opening another.
    const outcome = await verifyBalePayment(open.id);
    if (outcome === "paid") return { status: "paid" as const };
    if (outcome === "pending") throw new ApiError(409, "payment_verification_pending");
  }

  // Claim: the partial unique index allows one open attempt per checkout.
  const id = randomUUID(),
    at = now();
  try {
    run(
      "INSERT INTO p_bale_payments(id,checkout_id,user_id,amount,amount_rial,status,created_at,updated_at) VALUES(?,?,?,?,?,'creating',?,?)",
      id,
      c.id,
      userId,
      c.amount,
      c.amount * RIAL_PER_TOMAN,
      at,
      at,
    );
  } catch {
    throw new ApiError(409, "payment_request_in_progress");
  }
  try {
    const created = await balePayClient().createPayment({
      paymentId: id,
      amountRial: c.amount * RIAL_PER_TOMAN,
      callbackUrl: callbackUrl(id),
      description: `Homanet ${c.id}`,
    });
    if (!created.providerReference || created.providerReference.length > 200) throw new ApiError(503, "provider_rejected");
    const url = safeRedirect(created.redirectUrl);
    if (!mark(id, ["creating"], { status: "pending", provider_reference: created.providerReference, redirect_url: url }))
      throw new ApiError(409, "invalid_state");
    return { status: "redirect" as const, url };
  } catch (e) {
    // The customer never reached Bale, so nothing can have been paid.
    mark(id, ["creating"], { status: "request_failed", last_error: e instanceof ApiError ? e.code : "error" });
    throw e instanceof ApiError ? e : new ApiError(503, "provider_unavailable");
  }
}

/** Server-to-server verification of one attempt; settles the checkout only on
 * a verified, matching payment. Safe to call any number of times. */
export async function verifyBalePayment(paymentId: string): Promise<BaleOutcome> {
  const p = payment(paymentId);
  if (!p) return "unknown_payment";
  if (p.status === "paid") return "paid";
  if (p.status === "failed" || p.status === "request_failed") return "failed";
  if (p.status === "cancelled") return "cancelled";
  if (p.status !== "pending" || !p.provider_reference) return "pending";

  run("UPDATE p_bale_payments SET verify_attempts=verify_attempts+1,updated_at=? WHERE id=?", now(), p.id);
  let result: BaleVerifyResult;
  try {
    result = await balePayClient().verifyPayment({
      paymentId: p.id,
      providerReference: p.provider_reference,
      amountRial: p.amount_rial,
    });
  } catch (e) {
    // Timeout or outage: the status is unknown, so the payment stays pending.
    mark(p.id, ["pending"], { last_error: e instanceof ApiError ? e.code : "verify_error" });
    return "pending";
  }
  if (result.outcome === "unknown") {
    mark(p.id, ["pending"], { last_error: safeCode(result.code) });
    return "pending";
  }
  if (result.outcome === "failed" || result.outcome === "cancelled") {
    mark(p.id, ["pending"], { status: result.outcome, last_error: safeCode(result.code), verified_at: now() });
    return result.outcome;
  }
  return settleVerified(p, result);
}

function settleVerified(p: Row, r: Extract<BaleVerifyResult, { outcome: "paid" }>): BaleOutcome {
  const problem =
    !r.transactionId || r.transactionId.length > 200
      ? "missing_transaction"
      : !Number.isSafeInteger(r.amountRial) || r.amountRial !== p.amount_rial
        ? "amount_mismatch"
        : r.reference && r.reference !== p.id && r.reference !== p.provider_reference
          ? "reference_mismatch"
          : r.merchantId && balePayConfig().merchantId && r.merchantId !== balePayConfig().merchantId
            ? "merchant_mismatch"
            : "";
  if (problem) {
    // Money may have moved, but not as agreed: never settle; staff review it.
    mark(p.id, ["pending"], { status: "failed", last_error: problem, verified_at: now() });
    audit(p.user_id, "payment.bale.rejected", p.id, null, { checkout: p.checkout_id, reason: problem });
    return "failed";
  }
  try {
    return atomic(() => {
      const current = payment(p.id)!;
      if (current.status === "paid") return "paid";
      const reused = one("SELECT id FROM p_bale_payments WHERE provider_transaction_id=?", r.transactionId);
      if (reused) {
        mark(p.id, ["pending"], { status: "failed", last_error: "duplicate_transaction", verified_at: now() });
        audit(p.user_id, "payment.bale.duplicate_transaction", p.id, null, { other: reused.id });
        return "failed";
      }
      if (!mark(p.id, ["pending"], { status: "paid", provider_transaction_id: r.transactionId, verified_at: now(), last_error: null }))
        return payment(p.id)!.status === "paid" ? "paid" : "failed";
      const checkout = one("SELECT status,payment_ref FROM p_checkouts WHERE id=?", p.checkout_id)!;
      if (checkout.status === "paid") {
        // Already settled by another method or attempt: this is a second charge.
        audit(p.user_id, "payment.bale.double_charge", p.id, null, { checkout: p.checkout_id });
        run("UPDATE p_bale_payments SET last_error='needs_refund' WHERE id=?", p.id);
        return "paid";
      }
      // The existing paid-order workflow (stock, subscriptions, rewards,
      // commissions, notifications); itself idempotent per checkout and order.
      settleCheckout(p.checkout_id, "bale:" + r.transactionId);
      return "paid";
    });
  } catch (e) {
    // UNIQUE(provider_transaction_id) raced with another settlement.
    if (e instanceof Error && /UNIQUE/.test(e.message)) {
      mark(p.id, ["pending"], { status: "failed", last_error: "duplicate_transaction", verified_at: now() });
      return "failed";
    }
    throw e;
  }
}

const safeCode = (code: unknown) => String(code ?? "").replace(/[^\w.-]/g, "").slice(0, 40) || "unknown";

/** Callback/return from Bale. `pid` (our own id in the callback URL) and the
 * provider's fields only identify the attempt; verification decides. */
export async function handleBaleCallback(fields: URLSearchParams): Promise<{ outcome: BaleOutcome; checkoutId?: string }> {
  const pid = fields.get("pid") || "";
  if (!/^[0-9a-f-]{36}$/i.test(pid)) return { outcome: "unknown_payment" };
  const p = payment(pid);
  if (!p) return { outcome: "unknown_payment" };
  let hint;
  try {
    hint = balePayClient().parseCallback(fields);
  } catch {
    hint = {};
  }
  // A reference in the callback that isn't this attempt's is a mix-up or replay.
  if (hint.providerReference && p.provider_reference && hint.providerReference !== p.provider_reference) {
    audit(p.user_id, "payment.bale.callback_mismatch", p.id, null, { field: "provider_reference" });
    return { outcome: p.status === "paid" ? "paid" : "failed", checkoutId: p.checkout_id };
  }
  const outcome = await verifyBalePayment(p.id);
  return { outcome, checkoutId: p.checkout_id };
}

/** Worker step: re-verifies attempts left pending (closed tab, timeout). */
export async function recheckPendingBalePayments(limit = 20) {
  if (!balePayEnabled()) return 0;
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString(),
    oldest = new Date(Date.now() - 3 * 86400_000).toISOString();
  const rows = all(
    "SELECT id FROM p_bale_payments WHERE status='pending' AND updated_at<? AND created_at>? ORDER BY updated_at LIMIT ?",
    cutoff,
    oldest,
    limit,
  );
  for (const r of rows) await verifyBalePayment(r.id);
  return rows.length;
}

/** Non-sensitive view for the result page: never the raw provider payload. */
export function balePaymentSummary(paymentId: string, userId: string) {
  const p = one(
    `SELECT b.id,b.status,b.amount,b.provider_transaction_id,b.checkout_id,b.last_error,c.status checkout_status
     FROM p_bale_payments b JOIN p_checkouts c ON c.id=b.checkout_id WHERE b.id=? AND b.user_id=?`,
    paymentId,
    userId,
  );
  if (!p) throw new ApiError(404, "not_found");
  const orders = all("SELECT order_id FROM p_checkout_items WHERE checkout_id=?", p.checkout_id).map((r) =>
    String(r.order_id).slice(0, 8).toUpperCase(),
  );
  return {
    status: p.status as string,
    amount: p.amount as number,
    reference: p.status === "paid" ? (p.provider_transaction_id as string) : null,
    orders,
    checkoutPaid: p.checkout_status === "paid",
    activationReceipt:p.checkout_status === "paid" ? purchaseActivationReceipt(userId) : null,
  };
}
