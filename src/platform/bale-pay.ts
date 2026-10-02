import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "../server/http";
import { baleApi, BaleApiError } from "./bale-api";
import { baleConfig, baleConfigValid } from "./bale-config";
import { all, atomic, now, one, run, type Row } from "./schema";

export type BaleCreateInput = {
  paymentId: string;
  /** Rial, calculated from the checkout saved on the server. */
  amountRial: number;
  callbackUrl: string;
  description: string;
};
export type BaleCreateResult = { providerReference: string; redirectUrl: string };
export type BaleVerifyInput = { paymentId: string; providerReference: string; amountRial: number };
export type BaleVerifyResult =
  | { outcome: "paid"; transactionId: string; amountRial: number; reference?: string }
  | { outcome: "failed"; code: string }
  | { outcome: "cancelled"; code: string }
  | { outcome: "unknown"; code: string };
export type BaleCallbackParams = {
  providerReference?: string;
  transactionId?: string;
  statusHint?: "cancelled" | "other";
};
export interface BalePayClient {
  createPayment(input: BaleCreateInput): Promise<BaleCreateResult>;
  verifyPayment(input: BaleVerifyInput): Promise<BaleVerifyResult>;
  parseCallback(fields: URLSearchParams): BaleCallbackParams;
}

export const balePayloadHash = (payload: string) => createHash("sha256").update(payload).digest("hex");
export const validBalePayload = (payload: unknown): payload is string =>
  typeof payload === "string" && /^pay_[a-f0-9]{32}_[A-Za-z0-9_-]{22}$/.test(payload);

/** Call within the same immediate transaction that accepts a pre-checkout. */
export function baleCheckoutActive(payment: Row) {
  if (payment.status !== "pending") return false;
  const at = now();
  const checkout = one("SELECT status,method,amount,expires_at FROM p_checkouts WHERE id=?", payment.checkout_id);
  if (!checkout || checkout.status !== "pending" || checkout.method !== "bale" ||
      checkout.expires_at <= at || checkout.amount !== payment.amount ||
      payment.amount_rial !== checkout.amount * 10 || !Number.isSafeInteger(payment.amount_rial)) return false;
  const orders = all(
    "SELECT o.status,o.expires_at,o.paid_at FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=?",
    payment.checkout_id,
  );
  return orders.length > 0 && orders.every((order) => order.status === "pending" && !order.paid_at && order.expires_at > at);
}

/** Native wallet flow: issue an opaque bot link locally, then verify only the
 * transaction durably accepted by the authenticated pre-checkout webhook.
 * https://docs.bale.ai/ — sendInvoice, PreCheckoutQuery, inquireTransaction.
 */
export const officialBalePayClient: BalePayClient & { implemented: boolean } = {
  implemented: true,
  async createPayment(input) {
    if (!balePayEnabled()) throw new ApiError(503, "payment_not_configured");
    const config = baleConfig();
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.paymentId) ||
        !Number.isSafeInteger(input.amountRial) || input.amountRial <= 0) throw new ApiError(400, "invalid_input");
    return atomic(() => {
      const payment = one("SELECT * FROM p_bale_payments WHERE id=?", input.paymentId);
      if (!payment || payment.status !== "creating" || payment.amount_rial !== input.amountRial)
        throw new ApiError(409, "invalid_state");
      if (!baleCheckoutActive({ ...payment, status: "pending" })) throw new ApiError(409, "invalid_state");
      const existing = one("SELECT * FROM p_bale_sessions WHERE payment_id=?", payment.id);
      if (existing) {
        if (existing.account_fingerprint !== config.accountFingerprint || !payment.redirect_url)
          throw new ApiError(409, "payment_verification_pending");
        return { providerReference: payment.id, redirectUrl: safeRedirect(payment.redirect_url) };
      }
      const payload = `pay_${payment.id.replaceAll("-", "")}_${randomBytes(16).toString("base64url")}`;
      const redirectUrl = `https://ble.ir/${config.botUsername}?start=${payload}`;
      run(
        "INSERT INTO p_bale_sessions(payment_id,payload_hash,account_fingerprint,created_at) VALUES(?,?,?,?)",
        payment.id, balePayloadHash(payload), config.accountFingerprint, now(),
      );
      // Persist the link atomically with its session so a process crash before
      // the caller changes creating -> pending is recoverable.
      run("UPDATE p_bale_payments SET provider_reference=?,redirect_url=?,updated_at=? WHERE id=? AND status='creating'",
        payment.id, redirectUrl, now(), payment.id);
      return { providerReference: payment.id, redirectUrl };
    });
  },
  async verifyPayment(input) {
    const config = baleConfig();
    // Disabling new payments must not disable recovery of money already paid.
    if (!baleConfigValid(config)) return { outcome: "unknown", code: "payment_not_configured" };
    const session = one("SELECT * FROM p_bale_sessions WHERE payment_id=?", input.paymentId);
    if (!session || input.providerReference !== input.paymentId)
      return { outcome: "unknown", code: "binding_missing" };
    if (session.account_fingerprint !== config.accountFingerprint)
      return { outcome: "unknown", code: "account_changed" };
    if (!session.transaction_id || !session.accepted_at || !session.chat_id)
      return { outcome: "unknown", code: "awaiting_payment" };
    try {
      const transaction = await baleApi(config).inquireTransaction(session.transaction_id);
      if (transaction.id !== session.transaction_id || transaction.userID !== session.chat_id ||
          transaction.amount !== input.amountRial)
        return { outcome: "unknown", code: "transaction_mismatch" };
      if (transaction.status === "paid")
        return { outcome: "paid", transactionId: transaction.id, amountRial: transaction.amount, reference: input.paymentId };
      if (transaction.status === "failed" || transaction.status === "rejected")
        return { outcome: transaction.status === "rejected" ? "cancelled" : "failed", code: "bale_" + transaction.status };
      return { outcome: "unknown", code: "awaiting_payment" };
    } catch (error) {
      return { outcome: "unknown", code: error instanceof BaleApiError ? error.code : "bale_unavailable" };
    }
  },
  // Browser query/form fields are not wallet transaction evidence.
  parseCallback() { return {}; },
};

let client: BalePayClient = officialBalePayClient;
export function setBalePayClient(next: BalePayClient | null) {
  if (process.env.NODE_ENV === "production") throw new Error("BalePay client cannot be replaced in production");
  client = next ?? officialBalePayClient;
}
export const balePayClient = () => client;
export const nativeBaleClient = () => client === officialBalePayClient;

/** New invoices require an explicitly enabled, verified bot/webhook setup. */
export function balePayEnabled() {
  if (!nativeBaleClient()) return true;
  const config = baleConfig();
  if (!baleConfigValid(config, true)) return false;
  return one("SELECT value FROM p_bale_runtime WHERE key='registered_config'")?.value === config.configFingerprint;
}

/** Production redirects are limited to this configured bot, with one opaque
 * start payload. A test-only adapter can use a fixture HTTPS host. */
export function safeRedirect(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash)
      throw new Error();
    if (nativeBaleClient() && (url.hostname !== "ble.ir" ||
        url.pathname !== "/" + baleConfig().botUsername ||
        Array.from(url.searchParams.keys()).length !== 1 || !validBalePayload(url.searchParams.get("start"))))
      throw new Error();
    return url.toString();
  } catch {
    throw new ApiError(503, "provider_rejected");
  }
}
