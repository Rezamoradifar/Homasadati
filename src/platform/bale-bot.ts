import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { ApiError, body, fail, json } from "../server/http";
import { baleApi } from "./bale-api";
import { baleConfig, baleConfigValid } from "./bale-config";
import { baleCheckoutActive, balePayEnabled, balePayloadHash, validBalePayload } from "./bale-pay";
import { verifyBalePayment } from "./bale-payments";
import { atomic, now, one, run, type Row } from "./schema";
import { audit } from "./security";

const UPDATE_LEASE_MS = 15_000;
const SEND_LEASE_MS = 10_000;
const SEND_COOLDOWN_MS = 30_000;
const decline = "این درخواست معتبر نیست یا مهلت سفارش تمام شده است. وضعیت سفارش را در سایت بررسی کنید.";
const record = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const transactionId = (value: unknown): value is string => typeof value === "string" &&
  value.length > 0 && value.length <= 200 && !/[\u0000-\u0020\u007f]/.test(value);

function privateChat(message: Row): number | undefined {
  if (!record(message.chat) || message.chat.type !== "private" || !positiveId(message.chat.id) ||
      !record(message.from) || message.from.is_bot === true || message.from.id !== message.chat.id) return undefined;
  return message.chat.id;
}

/** Hash a bounded canonical representation, never persist raw chat bodies. */
function canonical(value: unknown, depth = 0): unknown {
  if (depth > 16) throw new ApiError(400, "invalid_input");
  if (Array.isArray(value)) return value.map((entry) => canonical(entry, depth + 1));
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], depth + 1)]));
  return value;
}

function sessionFor(payload: unknown) {
  if (!validBalePayload(payload)) return undefined;
  return one(
    `SELECT b.*,s.payload_hash,s.account_fingerprint,s.chat_id,s.invoice_message_id,s.send_claim,
       s.send_started_at,s.transaction_id,s.accepted_at,s.successful_at
     FROM p_bale_sessions s JOIN p_bale_payments b ON b.id=s.payment_id WHERE s.payload_hash=?`,
    balePayloadHash(payload),
  );
}

function resultMarkup(paymentId: string) {
  return { inline_keyboard: [[{
    text: "بررسی نتیجه در همانت",
    url: `${baleConfig().origin}/payment/result?provider=bale&pid=${paymentId}`,
  }]] };
}

async function start(message: Row) {
  const chat = privateChat(message);
  if (!chat || typeof message.text !== "string" || message.text.length > 256) return;
  const command = /^\/start(?:@([A-Za-z0-9_]+))?(?:\s+([A-Za-z0-9_-]+))?\s*$/.exec(message.text);
  if (!command || (command[1] && command[1].toLowerCase() !== baleConfig().botUsername.toLowerCase())) return;
  if (!command[2]) {
    await baleApi().sendMessage(chat, `برای پرداخت، از سبد خرید سایت وارد ربات شوید: ${baleConfig().origin}`);
    return;
  }
  const payload = command[2], claim = randomUUID();
  const decision = atomic(() => {
    const payment = sessionFor(payload);
    if (!payment || payment.account_fingerprint !== baleConfig().accountFingerprint ||
        (payment.chat_id && payment.chat_id !== chat)) return { action: "reject" as const };
    if (payment.transaction_id || payment.status === "paid") return { action: "status" as const, id: payment.id as string };
    if (!balePayEnabled() || !baleCheckoutActive(payment)) return { action: "reject" as const };
    const elapsed = Date.now() - (payment.send_started_at ?? 0);
    if ((payment.send_claim && elapsed < SEND_LEASE_MS) ||
        (!payment.invoice_message_id && payment.send_started_at && elapsed < SEND_LEASE_MS))
      throw new ApiError(503, "payment_request_in_progress");
    if (payment.invoice_message_id && elapsed < SEND_COOLDOWN_MS)
      return { action: "existing" as const, id: payment.id as string };
    run("UPDATE p_bale_sessions SET chat_id=?,send_claim=?,send_started_at=?,last_error=NULL WHERE payment_id=?",
      chat, claim, Date.now(), payment.id);
    return { action: "invoice" as const, id: payment.id as string, amountRial: payment.amount_rial as number };
  });
  if (decision.action === "reject") {
    await baleApi().sendMessage(chat, decline);
    return;
  }
  if (decision.action === "status" || decision.action === "existing") {
    await baleApi().sendMessage(chat, decision.action === "existing"
      ? "صورتحساب همین سفارش در این گفتگو ارسال شده است. پس از پرداخت، نتیجه را در سایت بررسی کنید."
      : "این پرداخت در حال بررسی است. نتیجهٔ نهایی را در سایت ببینید.", resultMarkup(decision.id));
    return;
  }
  try {
    const invoice = await baleApi().sendInvoice({
      chatId: chat, payload, amountRial: decision.amountRial,
      description: "پرداخت سفارش همانت؛ مبلغ صورتحساب به ریال است. پس از پرداخت به سایت برگردید.",
    });
    run("UPDATE p_bale_sessions SET invoice_message_id=?,send_claim=NULL,last_error=NULL WHERE payment_id=? AND send_claim=?",
      invoice.message_id, decision.id, claim);
  } catch {
    // An invoice may have been sent even if the response was lost. Keep the
    // same session/payload; its unique accepted transaction prevents a resend
    // from approving a second debit.
    run("UPDATE p_bale_sessions SET send_claim=NULL,last_error='invoice_unknown' WHERE payment_id=? AND send_claim=?",
      decision.id, claim);
    throw new ApiError(503, "provider_unavailable");
  }
}

async function preCheckout(query: Row) {
  if (!transactionId(query.id)) throw new ApiError(400, "invalid_input");
  const decision = atomic(() => {
    const payment = sessionFor(query.invoice_payload);
    if (!payment || payment.account_fingerprint !== baleConfig().accountFingerprint ||
        !record(query.from) || query.from.is_bot === true || !positiveId(query.from.id) ||
        payment.chat_id !== query.from.id || !payment.send_started_at ||
        query.currency !== "IRR" || !Number.isSafeInteger(query.total_amount) ||
        query.total_amount !== payment.amount_rial) return "reject";
    // The original true answer may have arrived even if its response was
    // lost. Once independently verified paid, finish a redelivered update
    // locally rather than send a contradictory false answer to Bale.
    if (payment.status === "paid" && payment.transaction_id === query.id &&
        payment.provider_transaction_id === query.id && payment.accepted_at) return "settled";
    if (!balePayEnabled() || !baleCheckoutActive(payment)) return "reject";
    if (payment.transaction_id) return payment.transaction_id === query.id ? "accept" : "reject";
    const other = one("SELECT payment_id FROM p_bale_sessions WHERE transaction_id=?", query.id);
    if (other) return "reject";
    // Commit the payer, amount/payload context and unique transaction binding
    // BEFORE telling Bale to accept. A receipt cannot establish this binding.
    return run("UPDATE p_bale_sessions SET transaction_id=?,accepted_at=?,last_error=NULL WHERE payment_id=? AND transaction_id IS NULL",
      query.id, now(), payment.id).changes === 1 ? "accept" : "reject";
  });
  if (decision === "settled") return;
  const accepted = decision === "accept";
  try {
    await baleApi().answerPreCheckoutQuery(query.id, accepted, accepted ? undefined : decline);
  } catch {
    // Keep a durable binding if the acknowledgment is ambiguous, so either
    // webhook retry or independent inquiry can recover the same transaction.
    throw new ApiError(503, "provider_unavailable");
  }
}

async function successfulPayment(message: Row) {
  const chat = privateChat(message), receipt = message.successful_payment;
  if (!chat || !record(receipt)) return;
  const accepted = atomic(() => {
    const payment = sessionFor(receipt.invoice_payload);
    if (!payment) return undefined;
    let problem = "";
    if (payment.account_fingerprint !== baleConfig().accountFingerprint) problem = "account_changed";
    else if (!payment.transaction_id || !payment.accepted_at || payment.chat_id !== chat ||
        receipt.telegram_payment_charge_id !== payment.transaction_id || receipt.currency !== "IRR" ||
        !Number.isSafeInteger(receipt.total_amount) || receipt.total_amount !== payment.amount_rial) problem = "receipt_mismatch";
    else if (!["pending", "paid"].includes(payment.status)) problem = "receipt_after_failure";
    if (problem) {
      run("UPDATE p_bale_sessions SET last_error=? WHERE payment_id=?", problem, payment.id);
      run("UPDATE p_bale_payments SET last_error=?,updated_at=? WHERE id=? AND status!='paid'", problem, now(), payment.id);
      audit(payment.user_id, "payment.bale.receipt_rejected", payment.id, null, { reason: problem });
      return undefined;
    }
    run("UPDATE p_bale_sessions SET successful_at=COALESCE(successful_at,?),last_error=NULL WHERE payment_id=?", now(), payment.id);
    return payment.id as string;
  });
  if (!accepted) return;
  // The receipt only triggers an inquiry; paid status comes from Bale's
  // server, matched to the durable transaction, payer and checkout amount.
  await verifyBalePayment(accepted);
  await baleApi().sendMessage(chat, "رویداد پرداخت دریافت شد. نتیجهٔ نهایی سفارش را در سایت بررسی کنید.", resultMarkup(accepted));
}

/** Bale documents a webhook URL, but no secret_token/header parameter. A
 * randomly generated 256-bit secret path authenticates this HTTPS endpoint.
 * Never log the route or its raw request. Authentication precedes body reads.
 */
export async function handleBaleWebhook(req: Request, secret: string): Promise<Response> {
  try {
    const config = baleConfig();
    if (req.method !== "POST" || !baleConfigValid(config) || !/^[a-f0-9]{64}$/.test(secret) ||
        !timingSafeEqual(Buffer.from(secret, "hex"), Buffer.from(config.webhookSecret, "hex")))
      throw new ApiError(404, "not_found");
    const update = await body(req, 65_536);
    if (!Number.isSafeInteger(update.update_id) || (update.update_id as number) < 0 ||
        (record(update.pre_checkout_query) && record(update.message))) throw new ApiError(400, "invalid_input");
    const updateId = update.update_id as number;
    const hash = createHash("sha256").update(JSON.stringify(canonical(update))).digest("hex");
    const lease = Date.now() + UPDATE_LEASE_MS;
    const claimed = atomic(() => {
      const saved = one("SELECT * FROM p_bale_updates WHERE account_fingerprint=? AND update_id=?", config.accountFingerprint, updateId);
      if (saved?.body_hash && saved.body_hash !== hash) throw new ApiError(409, "update_mismatch");
      if (saved?.state === "done") return false;
      if (saved?.state === "processing" && saved.lease_until > Date.now()) throw new ApiError(503, "update_in_progress");
      run(`INSERT INTO p_bale_updates(account_fingerprint,update_id,body_hash,state,lease_until,created_at,updated_at)
        VALUES(?,?,?,'processing',?,?,?) ON CONFLICT(account_fingerprint,update_id)
        DO UPDATE SET state='processing',lease_until=excluded.lease_until,updated_at=excluded.updated_at`,
      config.accountFingerprint, updateId, hash, lease, now(), now());
      return true;
    });
    if (!claimed) return json({ ok: true });
    try {
      if (record(update.pre_checkout_query)) await preCheckout(update.pre_checkout_query);
      else if (record(update.message)) {
        if (record(update.message.successful_payment)) await successfulPayment(update.message);
        else await start(update.message);
      }
      run("UPDATE p_bale_updates SET state='done',lease_until=0,updated_at=? WHERE account_fingerprint=? AND update_id=? AND lease_until=?",
        now(), config.accountFingerprint, updateId, lease);
    } catch {
      run("UPDATE p_bale_updates SET state='retry',lease_until=0,updated_at=? WHERE account_fingerprint=? AND update_id=? AND lease_until=?",
        now(), config.accountFingerprint, updateId, lease);
      throw new ApiError(503, "webhook_retry");
    }
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
