// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "../server/http";
import { now, one, platformDb, run } from "./schema";
import { checkoutSchema } from "./cart-validation";
import { createCheckout } from "./checkout";
import { saveSetting } from "./providers";
import { refundOrder, sales, wallet } from "./finance";
import { session, SESSION_COOKIE } from "./security";
import { handle } from "./api";
import { digipayPaymentSummary, handleDigiPayCallback, startDigiPayPayment } from "./digipay-payments";
import {
  assertNoPendingDigiPayRefund, processDigiPayFollowups, queueDigiPayDelivery,
  reconcileDigiPayRefund, refundDigiPayOrder, sendDigiPayDelivery,
} from "./digipay-fulfillment";
import {
  createDigiPayTicket, deliverDigiPayPurchase, inquireDigiPayRefund,
  refundDigiPayPurchase, verifyDigiPayPurchase, type DigiPayPurchase,
} from "./digipay";

// Keep finance and fulfillment real. Provider transport never reaches a network.
vi.mock("./digipay", async (original) => ({
  ...await original<typeof import("./digipay")>(),
  createDigiPayTicket: vi.fn(), verifyDigiPayPurchase: vi.fn(),
  deliverDigiPayPurchase: vi.fn(), refundDigiPayPurchase: vi.fn(), inquireDigiPayRefund: vi.fn(),
}));

const dir = mkdtempSync(join(tmpdir(), "homa-digipay-fulfillment-"));
const createMock = vi.mocked(createDigiPayTicket);
const verifyMock = vi.mocked(verifyDigiPayPurchase);
const deliverMock = vi.mocked(deliverDigiPayPurchase);
const refundMock = vi.mocked(refundDigiPayPurchase);
const inquiryMock = vi.mocked(inquireDigiPayRefund);
let buyer: string, sponsor: string, admin: string, foreign: string, phoneSequence = 0;
let forbiddenFetch = vi.fn();

function member(sponsorId: string | null = null, role = "user") {
  const id = randomUUID();
  run("INSERT INTO p_users(id,name,password,phone,role,referral_code,sponsor_id,preferences,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    id, "DigiPay fixture", "unused", "+98912" + String(++phoneSequence).padStart(7, "0"), role, id, sponsorId,
    JSON.stringify({ email: false, sms: false, inApp: true }), now(), now(), "test");
  run("INSERT INTO p_wallets(user_id,available) VALUES(?,0)", id);
  return id;
}

function product(price: number) {
  const id = randomUUID();
  run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)",
    id, "DigiPay product", "fixture", "ai", "product", price, 10, now(), now());
  return id;
}

async function started(prices = [250_000], paid = true, type = 5) {
  const products = prices.map(product);
  const c = createCheckout(buyer, checkoutSchema.parse({
    items: products.map((productId) => ({ productId, quantity: 1 })), method: "digipay",
    idempotencyKey: randomUUID(), expectedTotal: prices.reduce((sum, price) => sum + price, 0),
  }));
  await startDigiPayPayment(c.id, buyer);
  const p = one("SELECT * FROM p_digipay_payments WHERE checkout_id=?", c.id)!;
  if (paid) {
    const result = await handleDigiPayCallback(new URLSearchParams({ pid: p.id, providerId: p.id,
      amount: String(p.amount_rial), type: String(type), trackingCode: "sale-" + p.id, result: "SUCCESS" }));
    expect(result.outcome).toBe("paid");
  }
  const orders = products.map((id) => one("SELECT o.* FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=? AND o.product_id=?", c.id, id)!);
  return { c, p: one("SELECT * FROM p_digipay_payments WHERE id=?", p.id)!, products, orders };
}

const refundRow = (orderId: string) => one("SELECT * FROM p_digipay_refunds WHERE order_id=?", orderId)!;
const cookie = (userId: string) => `${SESSION_COOKIE}=${session(userId, "digipay-test")}`;

function inquiryOutcome(outcome: "succeeded" | "failed" | "pending") {
  inquiryMock.mockImplementation(async (input) => ({ providerId: input.providerId,
    trackingCode: input.trackingCode || "refund-" + input.providerId, outcome }));
}

async function adminAction(orderId: string, action: "shipped" | "delivered" | "refund") {
  return handle(new Request("https://homanets.test/api/platform/admin/orders", {
    method: "POST", headers: { cookie: cookie(admin), Origin: "https://homanets.test", "Content-Type": "application/json" },
    body: JSON.stringify({ id: orderId, action, reason: "Verified fixture action" }),
  }), ["admin", "orders"]);
}

beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "db.sqlite");
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
  platformDb();
});
beforeEach(() => {
  platformDb().exec("BEGIN");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_ORIGIN", "https://homanets.test");
  vi.stubEnv("DIGIPAY_ENABLED", "1");
  vi.stubEnv("HOMA_DIGIPAY_VAT_ENABLED", "0");
  vi.stubEnv("DIGIPAY_ENVIRONMENT", "sandbox");
  vi.stubEnv("DIGIPAY_USERNAME", "fixture-merchant");
  vi.stubEnv("DIGIPAY_PASSWORD", "fixture-password");
  vi.stubEnv("DIGIPAY_CLIENT_ID", "fixture-client");
  vi.stubEnv("DIGIPAY_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("DIGIPAY_SELLER_ID", "approved-seller");
  vi.stubEnv("DIGIPAY_SUPPLIER_ID", "approved-supplier");
  vi.stubEnv("DIGIPAY_DEFAULT_BRAND", "هما");
  vi.stubEnv("DIGIPAY_CATEGORY_MAP_JSON", JSON.stringify({ ai: { categoryId: "approved-ai", productType: 3 } }));
  forbiddenFetch = vi.fn(async () => { throw new Error("Unexpected external fetch in integration test"); });
  vi.stubGlobal("fetch", forbiddenFetch);
  createMock.mockReset().mockImplementation(async (input) => ({ ticket: "ticket-" + input.providerId, redirectUrl: "https://uatweb.mydigipay.info/pay/" + input.providerId }));
  verifyMock.mockReset().mockImplementation(async (input) => ({ ...input }));
  deliverMock.mockReset().mockResolvedValue();
  refundMock.mockReset().mockImplementation(async (input) => ({
    providerId: input.providerId, trackingCode: "refund-" + input.providerId, amountRial: input.amountRial, type: input.type,
  }));
  inquiryMock.mockReset();
  inquiryOutcome("pending");
  saveSetting("commission_policy", JSON.stringify({ directBps: 1000, levels: [], binaryBps: 0, maxPayoutBps: 3000, warningBps: 5000, criticalBps: 8000, withdrawMin: 1, withdrawMax: 1_000_000, paused: false }));
  saveSetting("loyalty_policy", JSON.stringify({ enabled: true, spendUnit: 10_000, pointsPerUnit: 1, expiryDays: 365 }));
  saveSetting("seven_card_live", "0");
  sponsor = member(); buyer = member(sponsor); admin = member(null, "superadmin"); foreign = member();
});
afterEach(() => {
  if (platformDb().inTransaction) platformDb().exec("ROLLBACK");
  expect(forbiddenFetch).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
afterAll(() => {
  platformDb().close(); rmSync(dir, { recursive: true, force: true });
});

describe("refund reconciliation", () => {
  it("refunds merchandise plus snapshotted VAT through DigiPay, never to Homa cash", async () => {
    vi.stubEnv("HOMA_DIGIPAY_VAT_ENABLED", "1");
    const productId=product(250_000);
    run("INSERT INTO p_product_details(product_id,details,updated_at) VALUES(?,?,?)",productId,JSON.stringify({vatStatus:"taxable"}),now());
    const c=createCheckout(buyer,checkoutSchema.parse({items:[{productId,quantity:1}],method:"digipay",expectedTotal:250_000,expectedVatToman:25_000,idempotencyKey:randomUUID()}));
    await startDigiPayPayment(c.id,buyer);
    const p=one("SELECT * FROM p_digipay_payments WHERE checkout_id=?",c.id)!;
    expect(p.amount_rial).toBe(2_750_000);
    expect((await handleDigiPayCallback(new URLSearchParams({pid:p.id,providerId:p.id,amount:String(p.amount_rial),type:"5",trackingCode:"sale-"+p.id,result:"SUCCESS"}))).outcome).toBe("paid");
    const order=one("SELECT * FROM p_orders WHERE product_id=? AND user_id=?",productId,buyer)!;
    expect(sales(buyer).personal).toBe(250_000);
    inquiryOutcome("succeeded");
    await expect(refundDigiPayOrder(order.id,buyer)).resolves.toMatchObject({status:"refunded"});
    expect(refundRow(order.id).amount_rial).toBe(2_750_000);
    expect(refundMock.mock.calls[0][0].amountRial).toBe(2_750_000);
    expect(wallet(buyer).available).toBe(0);
    expect(sales(buyer).personal).toBe(0);
  });

  it("blocks ordinary wallet refunds until the provider has confirmed a matching refund", async () => {
    const { orders, products } = await started();
    expect(() => refundOrder(orders[0].id, buyer)).toThrow("digipay_refund_pending");
    expect(one("SELECT status FROM p_orders WHERE id=?", orders[0].id)!.status).toBe("processing");
    expect(one("SELECT stock FROM p_products WHERE id=?", products[0])!.stock).toBe(9);
    expect(wallet(buyer).available).toBe(0);
    expect(wallet(sponsor).pending).toBe(25_000);
  });

  it("does not treat accepted refund submission as completed repayment", async () => {
    const { orders } = await started();
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    const r = refundRow(orders[0].id);
    expect(r).toMatchObject({ status: "pending", completed_at: null, amount_rial: 2_500_000 });
    expect(r.id).not.toBe(orders[0].id);
    expect(one("SELECT status FROM p_orders WHERE id=?", orders[0].id)!.status).toBe("processing");
    expect(wallet(sponsor).pending).toBe(25_000);
    expect(wallet(buyer).available).toBe(0);
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(inquiryMock).toHaveBeenCalledTimes(2);
  });

  it("inquires the same durable ID after a refund timeout and never issues another refund POST", async () => {
    const { orders, p, products } = await started();
    refundMock.mockRejectedValueOnce(new ApiError(503, "digipay_timeout"));
    inquiryMock.mockRejectedValueOnce(new ApiError(503, "digipay_timeout"));
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    const r = refundRow(orders[0].id);
    expect(r.status).toBe("pending");
    expect(r.tracking_code).toBeNull();
    expect(refundMock).toHaveBeenCalledWith({ providerId: r.id, saleTrackingCode: p.tracking_code, amountRial: 2_500_000, type: 5 });
    expect(inquiryMock).toHaveBeenLastCalledWith({ providerId: r.id, trackingCode: undefined, type: 5 });
    inquiryOutcome("succeeded");
    await expect(refundDigiPayOrder(orders[0].id, buyer)).resolves.toMatchObject({ status: "refunded" });
    expect(inquiryMock).toHaveBeenLastCalledWith({ providerId: r.id, trackingCode: undefined, type: 5 });
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(one("SELECT stock FROM p_products WHERE id=?", products[0])!.stock).toBe(10);
    expect(wallet(buyer).available).toBe(0);
  });

  it("reverses inventory, commission, points and purchase volume exactly once without minting wallet cash", async () => {
    const { orders, products } = await started();
    const orderId = orders[0].id;
    expect(one("SELECT status,points FROM p_loyalty_accruals WHERE order_id=?", orderId)).toEqual({ status: "pending", points: 25 });
    inquiryOutcome("succeeded");
    await expect(refundDigiPayOrder(orderId, buyer)).resolves.toMatchObject({ status: "refunded", refunded_at: expect.any(String) });
    expect(refundRow(orderId)).toMatchObject({ status: "succeeded", completed_at: expect.any(String) });
    expect(one("SELECT stock FROM p_products WHERE id=?", products[0])!.stock).toBe(10);
    expect(one("SELECT status FROM p_commissions WHERE order_id=?", orderId)!.status).toBe("reversed");
    expect(one("SELECT status FROM p_loyalty_accruals WHERE order_id=?", orderId)!.status).toBe("cancelled");
    expect(sales(buyer).personal).toBe(0);
    expect(sales(sponsor).group).toBe(0);
    expect(wallet(sponsor).pending).toBe(0);
    expect(wallet(buyer)).toMatchObject({ available: 0, pending: 0, held: 0, debt: 0 });
    expect(one("SELECT COUNT(*) n FROM p_ledger WHERE user_id=? AND kind IN ('refund','late_payment_refund')", buyer)!.n).toBe(0);
    await refundDigiPayOrder(orderId, buyer);
    await reconcileDigiPayRefund(refundRow(orderId).id);
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(inquiryMock).toHaveBeenCalledTimes(1);
    expect(one("SELECT stock FROM p_products WHERE id=?", products[0])!.stock).toBe(10);
  });

  it("finishes an already-authorized refund after the customer cancellation window closes", async () => {
    const { orders } = await started();
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    run("UPDATE p_orders SET cancel_until=? WHERE id=?", new Date(Date.now() - 60_000).toISOString(), orders[0].id);
    inquiryOutcome("succeeded");
    await reconcileDigiPayRefund(refundRow(orders[0].id).id);
    expect(one("SELECT status FROM p_orders WHERE id=?", orders[0].id)!.status).toBe("refunded");
    expect(wallet(buyer).available).toBe(0);
  });

  it("recovers a durable provider-confirmed refund after local reversal fails without another provider call", async () => {
    const { orders, products } = await started();
    inquiryOutcome("succeeded");
    platformDb().exec("CREATE TEMP TRIGGER stop_digipay_refund BEFORE UPDATE OF status ON p_orders WHEN NEW.status='refunded' BEGIN SELECT RAISE(ABORT,'injected reversal failure'); END");
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    const r = refundRow(orders[0].id);
    expect(r).toMatchObject({ status: "succeeded", completed_at: null });
    expect(one("SELECT stock FROM p_products WHERE id=?", products[0])!.stock).toBe(9);
    expect(wallet(sponsor).pending).toBe(25_000);
    platformDb().exec("DROP TRIGGER stop_digipay_refund");
    await reconcileDigiPayRefund(r.id);
    expect(refundRow(orders[0].id).completed_at).toEqual(expect.any(String));
    expect(one("SELECT stock FROM p_products WHERE id=?", products[0])!.stock).toBe(10);
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(inquiryMock).toHaveBeenCalledTimes(1);
  });

  it.each(["providerId", "trackingCode"])("rejects a foreign confirmed refund with mismatched %s", async (field) => {
    const { orders, products } = await started();
    inquiryMock.mockImplementation(async (input) => ({
      providerId: input.providerId, trackingCode: input.trackingCode || "refund-" + input.providerId,
      outcome: "succeeded", [field]: "another-refund",
    }));
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    expect(refundRow(orders[0].id)).toMatchObject({ status: "pending", completed_at: null, last_error: "payment_unverified" });
    expect(one("SELECT status FROM p_orders WHERE id=?", orders[0].id)!.status).toBe("processing");
    expect(one("SELECT stock FROM p_products WHERE id=?", products[0])!.stock).toBe(9);
    expect(wallet(sponsor).pending).toBe(25_000);
  });

  it("does not reverse or automatically resubmit a failed refund, but permits an explicit new request", async () => {
    const { orders } = await started();
    inquiryOutcome("failed");
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_failed" });
    const failed = refundRow(orders[0].id);
    expect(failed.status).toBe("failed");
    await reconcileDigiPayRefund(failed.id);
    await processDigiPayFollowups();
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(inquiryMock).toHaveBeenCalledTimes(1);
    expect(one("SELECT status FROM p_orders WHERE id=?", orders[0].id)!.status).toBe("processing");
    inquiryOutcome("pending");
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    expect(refundMock).toHaveBeenCalledTimes(2);
    expect(refundMock.mock.calls[1][0].providerId).not.toBe(failed.id);
    expect(one("SELECT status FROM p_digipay_refunds WHERE id=?", failed.id)!.status).toBe("failed");
    expect(one("SELECT COUNT(*) n FROM p_digipay_refunds WHERE order_id=?", orders[0].id)!.n).toBe(2);
  });

  it("records one refund before awaiting the provider so concurrent requests cannot refund twice", async () => {
    const { orders } = await started();
    let release!: (value: DigiPayPurchase) => void;
    refundMock.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const first = expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(inquiryMock).not.toHaveBeenCalled();
    const r = refundRow(orders[0].id);
    release({ providerId: r.id, trackingCode: "refund-" + r.id, amountRial: r.amount_rial, type: 5 });
    await first;
    expect(one("SELECT COUNT(*) n FROM p_digipay_refunds WHERE order_id=?", orders[0].id)!.n).toBe(1);
    expect(inquiryMock).toHaveBeenCalledTimes(1);
  });

  it("checks ownership and environment before creating a refund", async () => {
    const { orders } = await started();
    await expect(refundDigiPayOrder(orders[0].id, foreign)).rejects.toMatchObject({ code: "not_found" });
    vi.stubEnv("DIGIPAY_ENVIRONMENT", "production");
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "payment_not_configured" });
    expect(refundMock).not.toHaveBeenCalled();
    expect(one("SELECT COUNT(*) n FROM p_digipay_refunds")!.n).toBe(0);
  });

  it("does not cancel an unpaid order while an issued ticket could still settle", async () => {
    const { orders, c } = await started([250_000], false);
    const expired = new Date(Date.now() - 3_600_000).toISOString();
    run("UPDATE p_orders SET expires_at=? WHERE id=?", expired, orders[0].id);
    run("UPDATE p_checkouts SET expires_at=? WHERE id=?", expired, c.id);
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "payment_reconciliation_required" });
    expect(refundMock).not.toHaveBeenCalled();
    expect(one("SELECT status FROM p_orders WHERE id=?", orders[0].id)!.status).toBe("pending");
    expect(wallet(buyer).available).toBe(0);
  });

  it("requires provider-refund consent at the customer API instead of wallet-refund consent", async () => {
    const { orders } = await started();
    const url = `https://homanets.test/api/platform/orders/${orders[0].id}/cancel`;
    const headers = { cookie: cookie(buyer), Origin: "https://homanets.test", "Content-Type": "application/json" };
    const wrong = await handle(new Request(url, { method: "POST", headers, body: JSON.stringify({ walletRefundConsent: true }) }), ["orders", orders[0].id, "cancel"]);
    expect(wrong.status).toBe(400);
    expect(refundMock).not.toHaveBeenCalled();
    const right = await handle(new Request(url, { method: "POST", headers, body: JSON.stringify({ providerRefundConsent: true }) }), ["orders", orders[0].id, "cancel"]);
    expect(right.status).toBe(409);
    expect(await right.json()).toMatchObject({ error: "digipay_refund_pending" });
    expect(refundMock).toHaveBeenCalledTimes(1);
  });

  it("reports a fully refunded purchase without an active-purchase receipt or purchase volume", async () => {
    const { p, orders } = await started();
    expect(digipayPaymentSummary(p.id, buyer)).toMatchObject({ status: "paid", paidPurchaseVolume: 250_000 });
    inquiryOutcome("succeeded");
    await refundDigiPayOrder(orders[0].id, buyer);
    expect(digipayPaymentSummary(p.id, buyer)).toMatchObject({ status: "refunded", activationReceipt: null, paidPurchaseVolume: 0 });
  });
});

describe("delivery lifecycle", () => {
  it("does not report delivery at payment, while processing, or while only shipped", async () => {
    const { orders } = await started();
    expect(deliverMock).not.toHaveBeenCalled();
    await queueDigiPayDelivery(orders[0].id);
    expect(deliverMock).not.toHaveBeenCalled();
    expect((await adminAction(orders[0].id, "shipped")).status).toBe(200);
    await queueDigiPayDelivery(orders[0].id);
    expect(deliverMock).not.toHaveBeenCalled();
    expect((await adminAction(orders[0].id, "delivered")).status).toBe(200);
    expect(deliverMock).toHaveBeenCalledTimes(1);
  });

  it("waits for the entire basket to be actually delivered and sends each product code once", async () => {
    const { orders, products, p, c } = await started([250_000, 100_000]);
    expect((await adminAction(orders[0].id, "delivered")).status).toBe(200);
    expect(deliverMock).not.toHaveBeenCalled();
    expect((await adminAction(orders[1].id, "delivered")).status).toBe(200);
    expect(deliverMock).toHaveBeenCalledTimes(1);
    expect(deliverMock.mock.calls[0][0]).toMatchObject({ trackingCode: p.tracking_code, type: 5, invoiceNumber: c.id, deliveryDate: expect.any(Number) });
    expect([...deliverMock.mock.calls[0][0].products].sort()).toEqual([...products].sort());
    await Promise.all([queueDigiPayDelivery(orders[0].id), queueDigiPayDelivery(orders[1].id), sendDigiPayDelivery(p.id)]);
    expect(deliverMock).toHaveBeenCalledTimes(1);
    expect(one("SELECT status,delivered_at FROM p_digipay_deliveries WHERE payment_id=?", p.id)).toMatchObject({ status: "delivered", delivered_at: expect.any(String) });
  });

  it("blocks shipping and delivery updates while a refund is unresolved", async () => {
    const { orders } = await started();
    await expect(refundDigiPayOrder(orders[0].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    expect(() => assertNoPendingDigiPayRefund(orders[0].id)).toThrow("digipay_refund_pending");
    expect((await adminAction(orders[0].id, "shipped")).status).toBe(409);
    expect((await adminAction(orders[0].id, "delivered")).status).toBe(409);
    expect(one("SELECT status FROM p_orders WHERE id=?", orders[0].id)!.status).toBe("processing");
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("waits for a partial refund and delivers only the remaining item after it completes", async () => {
    const { orders, products, p } = await started([250_000, 100_000]);
    await expect(refundDigiPayOrder(orders[1].id, buyer)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    expect((await adminAction(orders[0].id, "delivered")).status).toBe(200);
    await processDigiPayFollowups();
    expect(deliverMock).not.toHaveBeenCalled();
    inquiryOutcome("succeeded");
    await reconcileDigiPayRefund(refundRow(orders[1].id).id);
    await processDigiPayFollowups();
    expect(deliverMock).toHaveBeenCalledTimes(1);
    expect(deliverMock.mock.calls[0][0]).toMatchObject({ trackingCode: p.tracking_code, products: [products[0]] });
    expect(wallet(buyer).available).toBe(0);
    expect(sales(buyer).personal).toBe(250_000);
  });

  it.each([false, true])("holds delivery until a confirmed refund completes local reversal (already queued: %s)", async (queued) => {
    const { orders, products, p } = await started([250_000, 100_000]);
    run("UPDATE p_orders SET status='delivered' WHERE id IN (?,?)", orders[0].id, orders[1].id);
    if (queued) {
      deliverMock.mockRejectedValueOnce(new ApiError(503, "digipay_timeout"));
      await queueDigiPayDelivery(orders[0].id);
      deliverMock.mockClear();
    }
    inquiryOutcome("succeeded");
    platformDb().exec("CREATE TEMP TRIGGER stop_digipay_delivery_refund BEFORE UPDATE OF status ON p_orders WHEN NEW.status='refunded' BEGIN SELECT RAISE(ABORT,'injected reversal failure'); END");
    await expect(refundDigiPayOrder(orders[1].id, admin, true)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    const r = refundRow(orders[1].id);
    expect(r).toMatchObject({ status: "succeeded", completed_at: null });
    expect(() => assertNoPendingDigiPayRefund(orders[1].id)).toThrow("digipay_refund_pending");
    await queueDigiPayDelivery(orders[0].id);
    await sendDigiPayDelivery(p.id);
    run("UPDATE p_digipay_refunds SET updated_at='2020-01-01T00:00:00.000Z' WHERE id=?", r.id);
    run("UPDATE p_digipay_deliveries SET updated_at='2020-01-01T00:00:00.000Z' WHERE payment_id=?", p.id);
    await processDigiPayFollowups();
    expect(deliverMock).not.toHaveBeenCalled();
    if (!queued) expect(one("SELECT payment_id FROM p_digipay_deliveries WHERE payment_id=?", p.id)).toBeUndefined();
    platformDb().exec("DROP TRIGGER stop_digipay_delivery_refund");
    await reconcileDigiPayRefund(r.id);
    await queueDigiPayDelivery(orders[0].id);
    expect(deliverMock).toHaveBeenCalledTimes(1);
    expect(deliverMock.mock.calls[0][0].products).toEqual([products[0]]);
  });

  it("refreshes a queued delivery's product list after a refund instead of replaying stale items", async () => {
    const { orders, products, p } = await started([250_000, 100_000]);
    deliverMock.mockRejectedValueOnce(new ApiError(503, "digipay_timeout"));
    run("UPDATE p_orders SET status='delivered' WHERE id IN (?,?)", orders[0].id, orders[1].id);
    await queueDigiPayDelivery(orders[0].id);
    expect(one("SELECT status FROM p_digipay_deliveries WHERE payment_id=?", p.id)!.status).toBe("pending");
    await expect(refundDigiPayOrder(orders[1].id, admin, true)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    await sendDigiPayDelivery(p.id);
    expect(deliverMock).toHaveBeenCalledTimes(1);
    inquiryOutcome("succeeded");
    await reconcileDigiPayRefund(refundRow(orders[1].id).id);
    await sendDigiPayDelivery(p.id);
    expect(deliverMock).toHaveBeenCalledTimes(2);
    expect(deliverMock.mock.calls[1][0].products).toEqual([products[0]]);
    expect(JSON.parse(one("SELECT payload FROM p_digipay_deliveries WHERE payment_id=?", p.id)!.payload).products).toEqual([products[0]]);
  });

  it("does not report delivery after every item was refunded", async () => {
    const { orders, p } = await started();
    deliverMock.mockRejectedValueOnce(new ApiError(503, "digipay_timeout"));
    run("UPDATE p_orders SET status='delivered' WHERE id=?", orders[0].id);
    await queueDigiPayDelivery(orders[0].id);
    inquiryOutcome("succeeded");
    await refundDigiPayOrder(orders[0].id, admin, true);
    await sendDigiPayDelivery(p.id);
    expect(deliverMock).toHaveBeenCalledTimes(1);
    expect(one("SELECT status FROM p_digipay_deliveries WHERE payment_id=?", p.id)!.status).toBe("not_required");
  });

  it("claims an in-flight delivery and blocks a simultaneous refund until it finishes", async () => {
    const { orders, p } = await started();
    let release!: () => void;
    deliverMock.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    run("UPDATE p_orders SET status='delivered' WHERE id=?", orders[0].id);
    const first = queueDigiPayDelivery(orders[0].id);
    await queueDigiPayDelivery(orders[0].id);
    expect(deliverMock).toHaveBeenCalledTimes(1);
    await expect(refundDigiPayOrder(orders[0].id, admin, true)).rejects.toMatchObject({ code: "digipay_refund_pending" });
    expect(refundMock).not.toHaveBeenCalled();
    release(); await first;
    expect(one("SELECT status FROM p_digipay_deliveries WHERE payment_id=?", p.id)!.status).toBe("delivered");
  });

  it("does not call the credit delivery endpoint for a non-credit UPG purchase", async () => {
    const { orders } = await started([250_000], true, 0);
    expect((await adminAction(orders[0].id, "delivered")).status).toBe(200);
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("keeps existing followups available when new DigiPay checkouts are disabled", async () => {
    const { orders } = await started();
    vi.stubEnv("DIGIPAY_ENABLED", "0");
    expect((await adminAction(orders[0].id, "delivered")).status).toBe(200);
    expect(deliverMock).toHaveBeenCalledTimes(1);
    inquiryOutcome("succeeded");
    await expect(refundDigiPayOrder(orders[0].id, admin, true)).resolves.toMatchObject({ status: "refunded" });
    expect(wallet(buyer).available).toBe(0);
  });
});
