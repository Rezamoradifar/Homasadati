// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const transport = vi.hoisted(() => ({
  getMe: vi.fn(), getWebhookInfo: vi.fn(), setWebhook: vi.fn(),
  sendMessage: vi.fn(), sendInvoice: vi.fn(), answerPreCheckoutQuery: vi.fn(), inquireTransaction: vi.fn(),
}));
vi.mock("./bale-api", async (original) => ({
  ...await original<typeof import("./bale-api")>(),
  baleApi: vi.fn(() => transport),
}));

import { all, now, one, platformDb, run, type Row } from "./schema";
import { createCheckout, checkoutSchema } from "./checkout";
import { saveSetting } from "./providers";
import { refundOrder, wallet } from "./finance";
import { baleConfig } from "./bale-config";
import { BaleApiError } from "./bale-api";
import { balePayEnabled, setBalePayClient } from "./bale-pay";
import { handleBaleWebhook } from "./bale-bot";
import { balePaymentSummary, recheckPendingBalePayments, startBalePayment, verifyBalePayment } from "./bale-payments";
import { handle } from "./api";

const dir = mkdtempSync(join(tmpdir(), "homa-native-bale-"));
const secret = "b".repeat(64);
const origin = "https://homanets.test";
const forbiddenFetch = vi.fn();
let buyer: string, sponsor: string, sequence = 100;
type Attempt = { checkout: Row; payment: Row; payload: string; url: string };

function configure() {
  vi.stubEnv("BALEPAY_ENABLED", "1");
  vi.stubEnv("BALEPAY_BOT_USERNAME", "Homanets_bot");
  vi.stubEnv("BALEPAY_BOT_TOKEN", "12345:unit_token");
  vi.stubEnv("BALEPAY_PROVIDER_TOKEN", "WALLET-UNIT-credential");
  vi.stubEnv("BALEPAY_WEBHOOK_SECRET", secret);
  vi.stubEnv("APP_ORIGIN", origin);
}
function registerCurrent() {
  run("INSERT INTO p_bale_runtime(key,value,updated_at) VALUES('registered_config',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", baleConfig().configFingerprint, now());
}
function member(parent: string | null = null) {
  const id = randomUUID();
  run("INSERT INTO p_users(id,name,password,referral_code,sponsor_id,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)", id, "Fixture", "unused", id, parent, now(), now(), "test");
  run("INSERT INTO p_wallets(user_id,available) VALUES(?,0)", id);
  return id;
}
function product(price: number) {
  const id = randomUUID();
  run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)", id, "کالای آزمون", "test", "ai", "product", price, 10, now(), now());
  return id;
}
async function started(prices = [250000]): Promise<Attempt> {
  const checkout = createCheckout(buyer, checkoutSchema.parse({
    items: prices.map((price) => ({ productId: product(price), quantity: 1 })),
    method: "bale", idempotencyKey: randomUUID(), expectedTotal: prices.reduce((a, b) => a + b, 0),
  }));
  const result = await startBalePayment(checkout.id, buyer);
  if (result.status !== "redirect") throw new Error("Fixture expected a bot handoff");
  const payment = one("SELECT * FROM p_bale_payments WHERE checkout_id=?", checkout.id)!;
  return { checkout, payment, payload: new URL(result.url).searchParams.get("start")!, url: result.url };
}
const session = (attempt: Attempt) => one("SELECT * FROM p_bale_sessions WHERE payment_id=?", attempt.payment.id)!;
const status = (attempt: Attempt) => one("SELECT status FROM p_checkouts WHERE id=?", attempt.checkout.id)!.status;
const orders = (attempt: Attempt) => all("SELECT o.* FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=? ORDER BY o.amount", attempt.checkout.id);
const paymentStatus = (attempt: Attempt) => one("SELECT status FROM p_bale_payments WHERE id=?", attempt.payment.id)!.status;
const update = (value: object) => ({ update_id: ++sequence, ...value });
function startUpdate(payload: string, chat = 101) {
  return update({ message: {
    message_id: ++sequence, date: Math.floor(Date.now() / 1000),
    from: { id: chat, is_bot: false, first_name: "Shopper" },
    chat: { id: chat, type: "private" }, text: "/start " + payload,
  } });
}
function precheckout(attempt: Attempt, transactionId: string, overrides: Record<string, unknown> = {}) {
  return update({ pre_checkout_query: {
    id: transactionId, from: { id: 101, is_bot: false, first_name: "Shopper" },
    currency: "IRR", total_amount: attempt.payment.amount_rial, invoice_payload: attempt.payload,
    ...overrides,
  } });
}
function receipt(attempt: Attempt, transactionId: string, chat = 101) {
  return update({ message: {
    message_id: ++sequence, date: Math.floor(Date.now() / 1000),
    from: { id: chat, is_bot: false, first_name: "Shopper" }, chat: { id: chat, type: "private" },
    successful_payment: {
      currency: "IRR", total_amount: attempt.payment.amount_rial, invoice_payload: attempt.payload,
      telegram_payment_charge_id: transactionId, provider_payment_charge_id: "tracking-number-is-not-the-transaction-id",
    },
  } });
}
function request(body: unknown, hookSecret = secret) {
  return new Request(`${origin}/api/platform/payment/bale/webhook/${hookSecret}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `192.0.2.${sequence % 250 + 1}` },
    body: JSON.stringify(body),
  });
}
const webhook = (body: unknown, hookSecret = secret) => handleBaleWebhook(request(body, hookSecret), hookSecret);
async function linked(attempt: Attempt) {
  expect((await webhook(startUpdate(attempt.payload))).status).toBe(200);
  expect(session(attempt).chat_id).toBe(101);
}
async function accepted(attempt: Attempt, transactionId = randomUUID()) {
  await linked(attempt);
  expect((await webhook(precheckout(attempt, transactionId))).status).toBe(200);
  expect(transport.answerPreCheckoutQuery.mock.lastCall?.slice(0, 2)).toEqual([transactionId, true]);
  return transactionId;
}
function paid(attempt: Attempt, transactionId: string, overrides: Record<string, unknown> = {}) {
  transport.inquireTransaction.mockResolvedValue({ id: transactionId, status: "paid", userID: 101, amount: attempt.payment.amount_rial, ...overrides });
}
function expire(attempt: Attempt) {
  const past = new Date(Date.now() - 60000).toISOString();
  run("UPDATE p_checkouts SET expires_at=? WHERE id=?", past, attempt.checkout.id);
  run("UPDATE p_orders SET expires_at=? WHERE id IN (SELECT order_id FROM p_checkout_items WHERE checkout_id=?)", past, attempt.checkout.id);
}

beforeAll(() => {
  vi.stubEnv("DATABASE_PATH", join(dir, "db.sqlite"));
  vi.stubEnv("PLATFORM_MASTER_KEY", "a".repeat(64));
  configure();
  platformDb();
  vi.stubGlobal("fetch", forbiddenFetch);
});
beforeEach(() => {
  configure();
  sequence = 100;
  setBalePayClient(null);
  run("DELETE FROM p_bale_updates");
  run("DELETE FROM p_bale_sessions");
  run("DELETE FROM p_bale_payments");
  run("DELETE FROM p_bale_runtime");
  registerCurrent();
  for (const mock of Object.values(transport)) mock.mockReset();
  forbiddenFetch.mockReset().mockRejectedValue(new Error("Network is forbidden in native Bale tests"));
  transport.getMe.mockResolvedValue({ id: 12345, username: "Homanets_bot", is_bot: true });
  transport.getWebhookInfo.mockResolvedValue({ url: "" });
  transport.setWebhook.mockResolvedValue(true);
  transport.sendMessage.mockImplementation(async (chat: number) => ({ message_id: ++sequence, chat: { id: chat } }));
  transport.sendInvoice.mockImplementation(async ({ chatId }: { chatId: number }) => ({ message_id: ++sequence, chat: { id: chatId } }));
  transport.answerPreCheckoutQuery.mockResolvedValue(true);
  transport.inquireTransaction.mockImplementation(async (id: string) => ({ id, status: "pending", userID: 101, amount: 2500000 }));
  saveSetting("commission_policy", JSON.stringify({ directBps: 1000, levels: [], binaryBps: 0, maxPayoutBps: 3000, warningBps: 5000, criticalBps: 8000, withdrawMin: 1, withdrawMax: 1000000, paused: false }));
  sponsor = member();
  buyer = member(sponsor);
});
afterEach(() => expect(forbiddenFetch).not.toHaveBeenCalled());
afterAll(() => {
  setBalePayClient(null);
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("authenticates the routed webhook before reading even an oversized untrusted body", async () => {
  const wrong = "c".repeat(64);
  const req = request({}, wrong);
  req.headers.set("Content-Length", "999999");
  Object.defineProperty(req, "body", { get() { throw new Error("Unauthorized body was accessed"); } });
  expect((await handle(req, ["payment", "bale", "webhook", wrong])).status).toBe(404);
  expect(one("SELECT COUNT(*) n FROM p_bale_updates")!.n).toBe(0);
  expect(transport.sendInvoice).not.toHaveBeenCalled();
});

it("rejects oversized authenticated bodies and malformed update IDs without processing payment data", async () => {
  const large = new Request(`${origin}/api/platform/payment/bale/webhook/${secret}`, {
    method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "1" }, body: " ".repeat(70000),
  });
  expect((await handleBaleWebhook(large, secret)).status).toBe(413);
  for (const id of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"])
    expect((await webhook({ update_id: id })).status).toBe(400);
  expect(one("SELECT COUNT(*) n FROM p_bale_updates")!.n).toBe(0);
});

it("issues an opaque link locally and sends the stored invoice once when the private bot chat starts", async () => {
  const attempt = await started();
  expect(new URL(attempt.url).origin).toBe("https://ble.ir");
  expect(new URL(attempt.url).pathname).toBe("/Homanets_bot");
  expect(attempt.payload).toMatch(/^pay_[a-f0-9]{32}_[A-Za-z0-9_-]{22}$/);
  expect(transport.sendInvoice).not.toHaveBeenCalled();
  await linked(attempt);
  await webhook(startUpdate(attempt.payload));
  expect(transport.sendInvoice).toHaveBeenCalledTimes(1);
  expect(transport.sendInvoice).toHaveBeenCalledWith(expect.objectContaining({ chatId: 101, payload: attempt.payload, amountRial: 2500000 }));
  expect(status(attempt)).toBe("pending");
});

it("retries an in-flight duplicate update without sending a second invoice", async () => {
  const attempt = await started();
  const body = startUpdate(attempt.payload);
  let release!: () => void, entered!: () => void;
  const called = new Promise<void>((resolve) => { entered = resolve; });
  transport.sendInvoice.mockImplementationOnce(() => {
    entered();
    return new Promise((resolve) => { release = () => resolve({ message_id: 901, chat: { id: 101 } }); });
  });
  const first = webhook(body);
  await called;
  try {
    expect((await webhook(body)).status).toBe(503);
    expect(transport.sendInvoice).toHaveBeenCalledTimes(1);
  } finally {
    release();
  }
  expect((await first).status).toBe(200);
  expect((await webhook(body)).status).toBe(200);
  expect(transport.sendInvoice).toHaveBeenCalledTimes(1);
});

it("rejects a changed body replayed under an already processed update ID", async () => {
  const first = await started(), second = await started();
  const body = startUpdate(first.payload);
  expect((await webhook(body)).status).toBe(200);
  const changed = JSON.parse(JSON.stringify(body));
  changed.message.text = "/start " + second.payload;
  expect((await webhook(changed)).status).toBe(409);
  expect(session(second).chat_id).toBeNull();
  expect(transport.sendInvoice).toHaveBeenCalledTimes(1);
});

it("ignores a forged payload and does not let another chat claim an already bound attempt", async () => {
  const attempt = await started();
  const forged = attempt.payload.slice(0, -1) + (attempt.payload.endsWith("A") ? "B" : "A");
  await webhook(startUpdate(forged));
  expect(transport.sendInvoice).not.toHaveBeenCalled();
  await linked(attempt);
  await webhook(startUpdate(attempt.payload, 202));
  expect(session(attempt).chat_id).toBe(101);
  expect(transport.sendInvoice).toHaveBeenCalledTimes(1);
});

it.each([
  { total_amount: 250000 },
  { currency: "IRT" },
  { from: { id: 202, is_bot: false, first_name: "Other" } },
])("rejects precheckout whose amount, currency or payer differs: %j", async (override) => {
  const attempt = await started();
  await linked(attempt);
  const id = randomUUID();
  expect((await webhook(precheckout(attempt, id, override))).status).toBe(200);
  expect(transport.answerPreCheckoutQuery).toHaveBeenLastCalledWith(id, false, expect.any(String));
  expect(session(attempt).accepted_at).toBeNull();
  expect(session(attempt).transaction_id).toBeNull();
  expect(status(attempt)).toBe("pending");
});

it("durably binds the transaction before approval and recovers a lost approval response without a receipt", async () => {
  const attempt = await started();
  await linked(attempt);
  const id = randomUUID();
  transport.answerPreCheckoutQuery.mockImplementationOnce(async (queryId: string, ok: boolean) => {
    expect(ok).toBe(true);
    expect(session(attempt)).toMatchObject({ transaction_id: queryId, chat_id: 101 });
    expect(session(attempt).accepted_at).toBeTruthy();
    throw new BaleApiError("bale_timeout");
  });
  expect((await webhook(precheckout(attempt, id))).status).toBe(503);
  expect(status(attempt)).toBe("pending");
  paid(attempt, id);
  run("UPDATE p_bale_payments SET updated_at=? WHERE id=?", new Date(Date.now() - 600000).toISOString(), attempt.payment.id);
  expect(await recheckPendingBalePayments()).toBe(1);
  expect(status(attempt)).toBe("paid");
  expect(wallet(sponsor).pending).toBe(25000);
});

it("completes a lost-ACK update locally after independent settlement without sending a contradictory provider answer", async () => {
  const attempt = await started();
  await linked(attempt);
  const id = randomUUID(), body = precheckout(attempt, id);
  transport.answerPreCheckoutQuery.mockRejectedValueOnce(new BaleApiError("bale_timeout"));
  expect((await webhook(body)).status).toBe(503);
  expect(session(attempt).transaction_id).toBe(id);
  paid(attempt, id);
  expect(await verifyBalePayment(attempt.payment.id)).toBe("paid");
  transport.answerPreCheckoutQuery.mockClear();
  expect((await webhook(body)).status).toBe(200);
  expect(transport.answerPreCheckoutQuery).not.toHaveBeenCalled();
  expect(status(attempt)).toBe("paid");
  expect(wallet(sponsor).pending).toBe(25000);
});

it("accepts the one bound transaction when an invoice was delivered but its HTTP response was lost", async () => {
  const attempt = await started();
  const body = startUpdate(attempt.payload);
  transport.sendInvoice.mockRejectedValueOnce(new BaleApiError("bale_timeout"));
  expect((await webhook(body)).status).toBe(503);
  expect(session(attempt)).toMatchObject({ chat_id: 101, invoice_message_id: null });
  expect(session(attempt).send_started_at).toBeGreaterThan(0);
  const id = randomUUID();
  expect((await webhook(precheckout(attempt, id))).status).toBe(200);
  expect(transport.answerPreCheckoutQuery.mock.lastCall?.slice(0, 2)).toEqual([id, true]);
  expect((await webhook(body)).status).toBe(200);
  expect(transport.sendInvoice).toHaveBeenCalledTimes(1);
  paid(attempt, id);
  expect(await verifyBalePayment(attempt.payment.id)).toBe("paid");
});

it("does not let a successful-payment receipt establish a missing precheckout binding", async () => {
  const attempt = await started();
  await linked(attempt);
  const id = randomUUID();
  paid(attempt, id);
  expect((await webhook(receipt(attempt, id))).status).toBe(200);
  expect(transport.inquireTransaction).not.toHaveBeenCalled();
  expect(session(attempt).transaction_id).toBeNull();
  expect(status(attempt)).toBe("pending");
  expect(wallet(sponsor).pending).toBe(0);
  expect(balePaymentSummary(attempt.payment.id, buyer)).toMatchObject({ resolution: "review", checkoutPaid: false });
  expect(balePaymentSummary(attempt.payment.id, buyer)).not.toHaveProperty("botUrl");
});

it("shows a receipt arriving after a verified failure as requiring review", async () => {
  const attempt = await started();
  const id = await accepted(attempt);
  transport.inquireTransaction.mockResolvedValue({ id, status: "failed", userID: 101, amount: attempt.payment.amount_rial });
  expect(await verifyBalePayment(attempt.payment.id)).toBe("failed");
  await webhook(receipt(attempt, id));
  expect(status(attempt)).toBe("pending");
  expect(balePaymentSummary(attempt.payment.id, buyer)).toMatchObject({ resolution: "review", checkoutPaid: false });
  expect(balePaymentSummary(attempt.payment.id, buyer)).not.toHaveProperty("botUrl");
});

it("keeps a bound payment pending when only the receipt says paid", async () => {
  const attempt = await started();
  const id = await accepted(attempt);
  expect((await webhook(receipt(attempt, id))).status).toBe(200);
  expect(transport.inquireTransaction).toHaveBeenCalledWith(id);
  expect(status(attempt)).toBe("pending");
  expect(orders(attempt)[0].paid_at).toBeNull();
  expect(wallet(sponsor).pending).toBe(0);
});

it("ignores a forged browser success query without a bound transaction", async () => {
  const attempt = await started();
  paid(attempt, "invented");
  const response = await handle(new Request(`${origin}/api/platform/payment/bale/callback?pid=${attempt.payment.id}&status=paid&transaction_id=invented&amount=2500000`), ["payment", "bale", "callback"]);
  expect(response.status).toBe(303);
  expect(status(attempt)).toBe("pending");
  expect(transport.inquireTransaction).not.toHaveBeenCalled();
});

it("settles verified payment once across repeated receipts and preserves one commission", async () => {
  const attempt = await started();
  const id = await accepted(attempt);
  paid(attempt, id);
  const body = receipt(attempt, id);
  expect((await handle(request(body), ["payment", "bale", "webhook", secret])).status).toBe(200);
  await Promise.all([webhook(body), webhook(body)]);
  await webhook(receipt(attempt, id));
  expect(status(attempt)).toBe("paid");
  expect(paymentStatus(attempt)).toBe("paid");
  expect(orders(attempt)[0].status).toBe("processing");
  expect(one("SELECT payment_ref FROM p_checkouts WHERE id=?", attempt.checkout.id)!.payment_ref).toBe("bale:" + id);
  expect(wallet(sponsor).pending).toBe(25000);
  expect(one("SELECT COUNT(*) n FROM p_commissions WHERE order_id=?", orders(attempt)[0].id)!.n).toBe(1);
  expect(balePaymentSummary(attempt.payment.id, buyer)).toMatchObject({ resolution: "order", checkoutPaid: true });
});

it.each([{ userID: 202 }, { amount: 1 }])("keeps a mismatched server inquiry pending: %j", async (override) => {
  const attempt = await started();
  const id = await accepted(attempt);
  paid(attempt, id, override);
  await webhook(receipt(attempt, id));
  expect(status(attempt)).toBe("pending");
  expect(paymentStatus(attempt)).toBe("pending");
  expect(wallet(sponsor).pending).toBe(0);
});

it("keeps an inquiry timeout pending and settles safely on a later successful retry", async () => {
  const attempt = await started();
  const id = await accepted(attempt);
  transport.inquireTransaction.mockRejectedValueOnce(new BaleApiError("bale_timeout"));
  await webhook(receipt(attempt, id));
  expect(paymentStatus(attempt)).toBe("pending");
  paid(attempt, id);
  expect(await verifyBalePayment(attempt.payment.id)).toBe("paid");
  expect(await verifyBalePayment(attempt.payment.id)).toBe("paid");
  expect(wallet(sponsor).pending).toBe(25000);
});

it.each(["expired", "cancelled"])("rejects a new precheckout after the checkout is %s", async (reason) => {
  const attempt = await started();
  await linked(attempt);
  expire(attempt);
  if (reason === "cancelled") refundOrder(orders(attempt)[0].id, buyer);
  const id = randomUUID();
  await webhook(precheckout(attempt, id));
  expect(transport.answerPreCheckoutQuery).toHaveBeenLastCalledWith(id, false, expect.any(String));
  expect(session(attempt).accepted_at).toBeNull();
});

it("re-acknowledges the accepted transaction but refuses a second transaction for the same payload", async () => {
  const attempt = await started();
  const id = await accepted(attempt);
  await webhook(precheckout(attempt, id));
  expect(transport.answerPreCheckoutQuery.mock.lastCall?.slice(0, 2)).toEqual([id, true]);
  const second = randomUUID();
  await webhook(precheckout(attempt, second));
  expect(transport.answerPreCheckoutQuery).toHaveBeenLastCalledWith(second, false, expect.any(String));
  expect(session(attempt).transaction_id).toBe(id);
});

it("never binds one provider transaction to two different checkouts", async () => {
  const first = await started();
  const id = await accepted(first);
  const second = await started();
  await linked(second);
  await webhook(precheckout(second, id));
  expect(transport.answerPreCheckoutQuery).toHaveBeenLastCalledWith(id, false, expect.any(String));
  expect(session(second).transaction_id).toBeNull();
});

it("recovers a bound payment older than three days while new payments are disabled", async () => {
  const attempt = await started();
  const id = await accepted(attempt);
  vi.stubEnv("BALEPAY_ENABLED", "0");
  expect(balePayEnabled()).toBe(false);
  run("UPDATE p_bale_payments SET created_at=?,updated_at=? WHERE id=?", new Date(Date.now() - 4 * 86400000).toISOString(), new Date(Date.now() - 600000).toISOString(), attempt.payment.id);
  paid(attempt, id);
  expect(await recheckPendingBalePayments()).toBe(1);
  expect(status(attempt)).toBe("paid");
  expect(session(attempt).successful_at).toBeNull();
});

it("rejects the previous webhook secret after rotation but preserves same-account recovery", async () => {
  const attempt = await started();
  const id = await accepted(attempt);
  vi.stubEnv("BALEPAY_WEBHOOK_SECRET", "c".repeat(64));
  expect(balePayEnabled()).toBe(false);
  paid(attempt, id);
  expect((await webhook(receipt(attempt, id), secret)).status).toBe(404);
  expect(transport.inquireTransaction).not.toHaveBeenCalled();
  expect(await verifyBalePayment(attempt.payment.id)).toBe("paid");
});

it("never verifies an old attempt with a newly configured wallet account", async () => {
  const attempt = await started();
  const id = await accepted(attempt);
  vi.stubEnv("BALEPAY_PROVIDER_TOKEN", "WALLET-UNIT-another-account");
  registerCurrent();
  paid(attempt, id);
  expect(await verifyBalePayment(attempt.payment.id)).toBe("pending");
  expect(transport.inquireTransaction).not.toHaveBeenCalled();
  expect(status(attempt)).toBe("pending");
  configure();
  registerCurrent();
  expect(await verifyBalePayment(attempt.payment.id)).toBe("paid");
});

it("recovers a crash after the local bot link was saved without issuing another attempt", async () => {
  const attempt = await started();
  run("UPDATE p_bale_payments SET status='creating',updated_at=? WHERE id=?", new Date(Date.now() - 600000).toISOString(), attempt.payment.id);
  expect(await startBalePayment(attempt.checkout.id, buyer)).toEqual({ status: "redirect", url: attempt.url });
  expect(paymentStatus(attempt)).toBe("pending");
  expect(one("SELECT COUNT(*) n FROM p_bale_payments WHERE checkout_id=?", attempt.checkout.id)!.n).toBe(1);
});

it("releases an abandoned local creation claim that never acquired a session", async () => {
  const attempt = await started();
  run("DELETE FROM p_bale_sessions WHERE payment_id=?", attempt.payment.id);
  run("UPDATE p_bale_payments SET status='creating',provider_reference=NULL,redirect_url=NULL,created_at=? WHERE id=?", new Date(Date.now() - 120000).toISOString(), attempt.payment.id);
  const resumed = await startBalePayment(attempt.checkout.id, buyer);
  expect(resumed.status).toBe("redirect");
  expect(paymentStatus(attempt)).toBe("request_failed");
  expect(one("SELECT COUNT(*) n FROM p_bale_payments WHERE checkout_id=? AND status='pending'", attempt.checkout.id)!.n).toBe(1);
  expect(transport.sendInvoice).not.toHaveBeenCalled();
});

it("credits a verified late payment to the wallet once after the order was cancelled", async () => {
  const attempt = await started();
  const id = await accepted(attempt);
  expire(attempt);
  refundOrder(orders(attempt)[0].id, buyer);
  paid(attempt, id);
  await webhook(receipt(attempt, id));
  await webhook(receipt(attempt, id));
  expect(status(attempt)).toBe("paid");
  expect(orders(attempt)[0].status).toBe("refunded");
  expect(wallet(buyer).available).toBe(250000);
  expect(wallet(sponsor).pending).toBe(0);
  expect(balePaymentSummary(attempt.payment.id, buyer)).toMatchObject({ resolution: "wallet_credit", checkoutPaid: true });
});

it("resolves a mixed late checkout by refunding only the cancelled order and fulfilling the other", async () => {
  const attempt = await started([100000, 150000]);
  const id = await accepted(attempt);
  expire(attempt);
  refundOrder(orders(attempt)[0].id, buyer);
  paid(attempt, id);
  await webhook(receipt(attempt, id));
  expect(status(attempt)).toBe("paid");
  expect(orders(attempt).map((order) => order.status)).toEqual(["refunded", "processing"]);
  expect(wallet(buyer).available).toBe(100000);
  expect(wallet(sponsor).pending).toBe(15000);
  expect(balePaymentSummary(attempt.payment.id, buyer)).toMatchObject({ resolution: "review", checkoutPaid: true });
});
