// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "../server/http";
import { all, now, one, platformDb, run, type Row } from "./schema";
import * as schema from "./schema";
import { createCheckout, quoteCart, settleCheckout } from "./checkout";
import { checkoutSchema } from "./cart-validation";
import { saveSetting } from "./providers";
import { digipayItemsForCart } from "./digipay-basket";
import { refundOrder, sales, wallet } from "./finance";
import { session, SESSION_COOKIE } from "./security";
import { handle } from "./api";
import { maintenance } from "./maintenance";
import {
  createDigiPayTicket, deliverDigiPayPurchase, verifyDigiPayPurchase,
  type DigiPayPurchase,
} from "./digipay";
import {
  digipayPaymentSummary, handleDigiPayCallback, recheckPendingDigiPayPayments, reconcileDigiPayPayment,
  startDigiPayPayment, verifyDigiPayPayment,
} from "./digipay-payments";

// Only the provider boundary is replaced. Checkout, SQLite transactions,
// payment claims, settlement, commissions, API ownership and worker stay real.
vi.mock("./digipay", async (original) => ({
  ...await original<typeof import("./digipay")>(),
  createDigiPayTicket: vi.fn(), verifyDigiPayPurchase: vi.fn(),
  deliverDigiPayPurchase: vi.fn(), refundDigiPayPurchase: vi.fn(), inquireDigiPayRefund: vi.fn(),
}));
vi.mock("./fx", async (original) => ({ ...await original<typeof import("./fx")>(), refreshUsdRate: vi.fn(async () => undefined) }));
vi.mock("./outbox", async (original) => ({ ...await original<typeof import("./outbox")>(), processOutbox: vi.fn(async () => undefined) }));
vi.mock("./newsletter", async (original) => ({ ...await original<typeof import("./newsletter")>(), processNewsletter: vi.fn(async () => undefined) }));

const dir = mkdtempSync(join(tmpdir(), "homa-digipay-payments-"));
const createMock = vi.mocked(createDigiPayTicket);
const verifyMock = vi.mocked(verifyDigiPayPurchase);
const deliverMock = vi.mocked(deliverDigiPayPurchase);
let buyer: string, sponsor: string, foreign: string, phoneSequence = 0;
let forbiddenFetch = vi.fn();

function member(sponsorId: string | null = null) {
  const id = randomUUID();
  const phone = "+98912" + String(++phoneSequence).padStart(7, "0");
  run("INSERT INTO p_users(id,name,password,phone,referral_code,sponsor_id,preferences,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?)",
    id, "DigiPay fixture", "unused", phone, id, sponsorId,
    JSON.stringify({ email: false, sms: false, inApp: true }), now(), now(), "test");
  run("INSERT INTO p_wallets(user_id,available) VALUES(?,0)", id);
  return id;
}

function product(price = 250_000) {
  const id = randomUUID();
  run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)",
    id, "DigiPay item", "fixture", "ai", "product", price, 10, now(), now());
  return id;
}

function checkout(price = 250_000) {
  const productId = product(price);
  const input = checkoutSchema.parse({ items: [{ productId, quantity: 1 }], method: "digipay", idempotencyKey: randomUUID(), expectedTotal: price });
  const c = createCheckout(buyer, input);
  const order = one("SELECT order_id FROM p_checkout_items WHERE checkout_id=?", c.id)!.order_id as string;
  return { c, productId, order };
}

async function started(price = 250_000) {
  const result = checkout(price);
  const redirect = await startDigiPayPayment(result.c.id, buyer);
  const p = one("SELECT * FROM p_digipay_payments WHERE checkout_id=?", result.c.id)!;
  return { ...result, p, redirect };
}

function callbackFields(p: Row, extra: Record<string, string> = {}) {
  return new URLSearchParams({ pid: p.id, providerId: p.id, amount: String(p.amount_rial),
    type: "5", trackingCode: "track-" + p.id, result: "SUCCESS", ...extra });
}

const callback = (p: Row, extra: Record<string, string> = {}) => handleDigiPayCallback(callbackFields(p, extra));
const cookie = (userId: string) => `${SESSION_COOKIE}=${session(userId, "digipay-test")}`;

beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "db.sqlite");
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
  platformDb();
});
beforeEach(() => {
  // A rollback also isolates immutable ledgers without disabling their triggers.
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
  saveSetting("commission_policy", JSON.stringify({ directBps: 1000, levels: [], binaryBps: 0, maxPayoutBps: 3000, warningBps: 5000, criticalBps: 8000, withdrawMin: 1, withdrawMax: 1_000_000, paused: false }));
  saveSetting("seven_card_live", "0");
  sponsor = member();
  buyer = member(sponsor);
  foreign = member();
});
afterEach(() => {
  if (platformDb().inTransaction) platformDb().exec("ROLLBACK");
  expect(forbiddenFetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});

describe("checkout preparation", () => {
  it("finances classified 10% VAT but excludes it from reward volume", async () => {
    vi.stubEnv("HOMA_DIGIPAY_VAT_ENABLED", "1");
    const taxableId = product(250_000), exemptId = product(50_000);
    run("INSERT INTO p_product_details(product_id,details,updated_at) VALUES(?,?,?)", taxableId, JSON.stringify({vatStatus:"taxable"}), now());
    run("INSERT INTO p_product_details(product_id,details,updated_at) VALUES(?,?,?)", exemptId, JSON.stringify({vatStatus:"exempt"}), now());
    const items = [{productId:taxableId,quantity:1}, {productId:exemptId,quantity:1}];
    const quote = quoteCart(items);
    expect(quote).toMatchObject({total:300_000,creditVatToman:25_000,creditVatReady:true,creditVatEnabled:true});
    const c = createCheckout(buyer, checkoutSchema.parse({items,method:"digipay",expectedTotal:quote.total,expectedVatToman:quote.creditVatToman,idempotencyKey:randomUUID()}));
    expect(c.amount).toBe(325_000);
    await startDigiPayPayment(c.id,buyer);
    const p = one("SELECT * FROM p_digipay_payments WHERE checkout_id=?",c.id)!;
    expect(createMock.mock.calls[0][0].amountRial).toBe(3_250_000);
    expect((await callback(p)).outcome).toBe("paid");
    expect(verifyMock.mock.calls[0][0].amountRial).toBe(3_250_000);
    expect(sales(buyer).personal).toBe(300_000);
    expect(sales(sponsor).group).toBe(300_000);
    expect(wallet(sponsor).pending).toBe(30_000);
    expect(wallet(buyer).available).toBe(0);
    expect(JSON.parse(one("SELECT policy FROM p_orders WHERE product_id=? AND user_id=?",taxableId,buyer)!.policy).orderTerms.digipayVatToman).toBe(25_000);
    expect(JSON.parse(one("SELECT policy FROM p_orders WHERE product_id=? AND user_id=?",exemptId,buyer)!.policy).orderTerms.digipayVatToman).toBe(0);
  });

  it("stops unclassified or stale-tax credit checkouts before stock is reserved", () => {
    vi.stubEnv("HOMA_DIGIPAY_VAT_ENABLED", "1");
    const productId = product(100_000), items=[{productId,quantity:1}];
    expect(quoteCart(items).creditVatReady).toBe(false);
    const draft={items,method:"digipay" as const,expectedTotal:100_000,expectedVatToman:0,idempotencyKey:randomUUID()};
    expect(() => createCheckout(buyer, checkoutSchema.parse(draft))).toThrow("vat_status_required");
    run("INSERT INTO p_product_details(product_id,details,updated_at) VALUES(?,?,?)",productId,JSON.stringify({vatStatus:"taxable"}),now());
    expect(quoteCart(items).creditVatToman).toBe(10_000);
    expect(() => createCheckout(buyer, checkoutSchema.parse(draft))).toThrow("price_changed");
    expect(one("SELECT stock FROM p_products WHERE id=?",productId)!.stock).toBe(10);
    expect(one("SELECT COUNT(*) n FROM p_checkouts WHERE user_id=?",buyer)!.n).toBe(0);
  });

  it("sends server prices in rials and the order's immutable basket snapshot", async () => {
    const { c, productId } = checkout();
    vi.stubEnv("DIGIPAY_CATEGORY_MAP_JSON", JSON.stringify({ ai: { categoryId: "changed-later", productType: 1 } }));
    run("UPDATE p_products SET price=999999 WHERE id=?", productId);
    await startDigiPayPayment(c.id, buyer);
    const input = createMock.mock.calls[0][0];
    expect(input).toMatchObject({ amountRial: 2_500_000, basketId: c.id, cellNumber: "0912" + String(phoneSequence - 1).padStart(7, "0") });
    expect(input.items).toEqual([{ sellerId: "approved-seller", supplierId: "approved-supplier", productCode: productId,
      brand: "هما", productType: 3, count: 1, categoryId: "approved-ai" }]);
    expect(input.callbackUrl).toBe(`https://homanets.test/api/platform/payment/digipay/callback?pid=${input.providerId}`);
    expect(one("SELECT stock FROM p_products WHERE id=?", productId)!.stock).toBe(9);
    expect(wallet(buyer).available).toBe(0);
  });

  it("uses a legacy saved catalog SKU in the provider basket", async () => {
    const productId = product();
    run("INSERT INTO p_product_details(product_id,sku,details,updated_at) VALUES(?,?,?,?)",
      productId, "HOMA-LEGACY-001", "{}", now());
    const input = checkoutSchema.parse({ items: [{ productId, quantity: 1 }], method: "digipay", idempotencyKey: randomUUID(), expectedTotal: 250_000 });
    const c = createCheckout(buyer, input);

    await startDigiPayPayment(c.id, buyer);

    expect(createMock.mock.calls[0][0].items[0]).toMatchObject({ productCode: "HOMA-LEGACY-001" });
  });

  it.each([undefined, "", "{}"])("uses official single-store defaults when category configuration is %s", async (raw) => {
    vi.stubEnv("DIGIPAY_SELLER_ID", "");
    vi.stubEnv("DIGIPAY_SUPPLIER_ID", "");
    vi.stubEnv("DIGIPAY_DEFAULT_BRAND", "");
    vi.stubEnv("DIGIPAY_CATEGORY_MAP_JSON", raw);
    const { c, productId } = checkout();
    await startDigiPayPayment(c.id, buyer);
    expect(createMock.mock.calls[0][0].items).toEqual([{
      sellerId: "1", supplierId: "1", productCode: productId,
      brand: "", productType: 3, count: 1, categoryId: "ai",
    }]);
  });

  it.each([
    ["tourism", 3], ["beauty", 2], ["craft", 1], ["ai", 3], ["leather", 1],
  ])("uses the real %s catalog root with product type %s", (vertical, productType) => {
    vi.stubEnv("DIGIPAY_CATEGORY_MAP_JSON", "{}");
    const productId = product();
    run("UPDATE p_products SET vertical=? WHERE id=?", vertical, productId);
    expect(digipayItemsForCart(buyer, [{ productId, quantity: 2 }]).get(productId))
      .toMatchObject({ categoryId: vertical, productType, count: 2 });
    expect(one("SELECT stock FROM p_products WHERE id=?", productId)!.stock).toBe(10);
  });

  it("accepts an empty brand while preserving explicit merchant identifiers and category settings", async () => {
    vi.stubEnv("DIGIPAY_DEFAULT_BRAND", "");
    const { c } = checkout();
    await startDigiPayPayment(c.id, buyer);
    expect(createMock.mock.calls[0][0].items[0]).toMatchObject({
      sellerId: "approved-seller", supplierId: "approved-supplier", categoryId: "approved-ai", productType: 3, brand: "",
    });
  });

  it.each([
    "not-json", "[]", "null", '{"ai":{"categoryId":"","productType":3}}',
    '{"ai":{"categoryId":"ai","productType":9}}', '{"unknown":{"categoryId":"unknown","productType":1}}',
  ])("rejects an invalid explicit category map before reserving inventory: %s", (raw) => {
    vi.stubEnv("DIGIPAY_CATEGORY_MAP_JSON", raw);
    const productId = product();
    const input = checkoutSchema.parse({ items: [{ productId, quantity: 1 }], method: "digipay", idempotencyKey: randomUUID(), expectedTotal: 250_000 });
    expect(() => createCheckout(buyer, input)).toThrow("payment_not_configured");
    expect(one("SELECT stock FROM p_products WHERE id=?", productId)!.stock).toBe(10);
    expect(one("SELECT COUNT(*) n FROM p_checkouts WHERE user_id=?", buyer)!.n).toBe(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each(["unknown", "constructor"])("rejects unknown catalog root %s before reserving inventory", (vertical) => {
    vi.stubEnv("DIGIPAY_CATEGORY_MAP_JSON", "{}");
    const productId = product();
    // The current DB CHECK already refuses these roots. Model a corrupt legacy
    // read without disabling that invariant in the real integration database.
    const realOne = schema.one;
    vi.spyOn(schema, "one").mockImplementation((sql: string, ...params: unknown[]) => {
      const row = realOne(sql, ...params);
      return sql.startsWith("SELECT p.id,p.vertical,d.sku,d.details") && row ? { ...row, vertical } : row;
    });
    const input = checkoutSchema.parse({ items: [{ productId, quantity: 1 }], method: "digipay", idempotencyKey: randomUUID(), expectedTotal: 250_000 });
    expect(() => createCheckout(buyer, input)).toThrow("digipay_basket_not_configured");
    expect(one("SELECT stock FROM p_products WHERE id=?", productId)!.stock).toBe(10);
    expect(one("SELECT COUNT(*) n FROM p_orders WHERE user_id=?", buyer)!.n).toBe(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("reuses an unexpired ticket without reserving inventory or charging again", async () => {
    const { c, p, productId, redirect } = await started();
    expect(await startDigiPayPayment(c.id, buyer)).toEqual(redirect);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(one("SELECT COUNT(*) n FROM p_digipay_payments WHERE checkout_id=?", c.id)!.n).toBe(1);
    expect(one("SELECT stock FROM p_products WHERE id=?", productId)!.stock).toBe(9);
    expect(p.status).toBe("pending");
  });

  it("claims a ticket before awaiting the provider so concurrent starts cannot create two attempts", async () => {
    const { c } = checkout();
    let release!: (value: { ticket: string; redirectUrl: string }) => void;
    createMock.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const first = startDigiPayPayment(c.id, buyer);
    await expect(startDigiPayPayment(c.id, buyer)).rejects.toMatchObject({ code: "payment_request_in_progress" });
    release({ ticket: "ticket-once", redirectUrl: "https://uatweb.mydigipay.info/pay/once" });
    await first;
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it.each(["voucher", "phone", "category", "disabled"])("rejects %s problems before inventory, checkout or order changes", (problem) => {
    const productId = product();
    const input = checkoutSchema.parse({ items: [{ productId, quantity: 2 }], method: "digipay", idempotencyKey: randomUUID(), expectedTotal: 500_000,
      ...(problem === "voucher" ? { useVoucher: true } : {}) });
    const expected = { voucher: "digipay_voucher_unsupported", phone: "digipay_phone_required", category: "digipay_basket_not_configured", disabled: "payment_not_configured" }[problem]!;
    if (problem === "phone") run("UPDATE p_users SET phone=NULL WHERE id=?", buyer);
    if (problem === "category") vi.stubEnv("DIGIPAY_CATEGORY_MAP_JSON", JSON.stringify({ tourism: { categoryId: "approved-travel", productType: 3 } }));
    if (problem === "disabled") vi.stubEnv("DIGIPAY_ENABLED", "0");
    expect(() => createCheckout(buyer, input)).toThrow(expected);
    expect(one("SELECT stock FROM p_products WHERE id=?", productId)!.stock).toBe(10);
    expect(one("SELECT COUNT(*) n FROM p_checkouts WHERE user_id=?", buyer)!.n).toBe(0);
    expect(one("SELECT COUNT(*) n FROM p_orders WHERE user_id=?", buyer)!.n).toBe(0);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("authenticated settlement", () => {
  it("settles the verified amount once and records real purchase volume without cash credit", async () => {
    const { c, p, order } = await started();
    expect((await callback(p)).outcome).toBe("paid");
    expect(verifyMock).toHaveBeenCalledWith({ providerId: p.id, trackingCode: "track-" + p.id, type: 5, amountRial: 2_500_000 });
    expect(one("SELECT status,payment_ref FROM p_checkouts WHERE id=?", c.id)).toEqual({ status: "paid", payment_ref: "digipay:track-" + p.id });
    expect(one("SELECT status,paid_at FROM p_orders WHERE id=?", order)).toMatchObject({ status: "processing", paid_at: expect.any(String) });
    expect(sales(buyer).personal).toBe(250_000);
    expect(sales(sponsor).group).toBe(250_000);
    expect(wallet(sponsor).pending).toBe(25_000);
    expect(wallet(buyer).available).toBe(0);
    expect(one("SELECT COUNT(*) n FROM p_digipay_deliveries")!.n).toBe(0);
    expect(deliverMock).not.toHaveBeenCalled();
    expect(one("SELECT gateway,status,bank_reference FROM p_gateway_transactions WHERE authority=?", "digipay:" + p.id)).toEqual({ gateway: "digipay", status: "paid", bank_reference: "track-" + p.id });
  });

  it("makes repeated callbacks and paid-checkout retries idempotent", async () => {
    const { c, p, order } = await started();
    await callback(p);
    expect((await callback(p)).outcome).toBe("paid");
    await Promise.all([callback(p), callback(p), verifyDigiPayPayment(p.id)]);
    expect(await startDigiPayPayment(c.id, buyer)).toMatchObject({ status: "paid" });
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(one("SELECT COUNT(*) n FROM p_commissions WHERE order_id=?", order)!.n).toBe(1);
    expect(one("SELECT COUNT(*) n FROM p_subscriptions WHERE order_id=?", order)!.n).toBe(1);
    expect(wallet(sponsor).pending).toBe(25_000);
  });

  it("holds a verification claim across awaits and does not let a concurrent callback replace it", async () => {
    const { p } = await started();
    let release!: (value: DigiPayPurchase) => void;
    verifyMock.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const first = callback(p);
    expect((await callback(p, { trackingCode: "forged-concurrent-candidate" })).outcome).toBe("pending");
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(one("SELECT callback_tracking FROM p_digipay_payments WHERE id=?", p.id)!.callback_tracking).toBe("track-" + p.id);
    release({ providerId: p.id, trackingCode: "track-" + p.id, amountRial: p.amount_rial, type: 5 });
    expect((await first).outcome).toBe("paid");
    expect(wallet(sponsor).pending).toBe(25_000);
  });

  it.each(["providerId", "trackingCode", "amountRial", "type"])("rejects authenticated verification that mismatches %s", async (field) => {
    const { p, c } = await started();
    verifyMock.mockImplementationOnce(async (input) => ({ ...input, [field]: field === "amountRial" ? 1 : field === "type" ? 13 : "different" }));
    expect((await callback(p)).outcome).toBe("pending");
    expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
    expect(wallet(sponsor).pending).toBe(0);
    expect(sales(buyer).personal).toBe(0);
  });

  it.each([
    { providerId: "another-payment" }, { amount: "10" }, { amount: "2500000.0" },
    { type: "99" }, { trackingCode: "invalid';DROP TABLE" }, { result: "paid" },
  ] as Record<string, string>[])("does not verify or pay from a malformed callback: %j", async (extra) => {
    const { p, c } = await started();
    expect((await callback(p, extra)).outcome).toBe("unknown_payment");
    expect(verifyMock).not.toHaveBeenCalled();
    expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
    expect(wallet(sponsor).pending).toBe(0);
  });

  it("will not reserve another payment's authenticated tracking code from an unverified callback", async () => {
    const first = await started();
    const second = await started();
    const shared = "provider-sale-shared";
    verifyMock.mockRejectedValueOnce(new ApiError(503, "digipay_provider_rejected"));
    expect((await callback(first.p, { trackingCode: shared })).outcome).toBe("pending");
    expect(one("SELECT tracking_code FROM p_digipay_payments WHERE id=?", first.p.id)!.tracking_code).toBeNull();
    expect((await callback(second.p, { trackingCode: shared })).outcome).toBe("paid");
    expect((await callback(first.p, { trackingCode: shared })).outcome).toBe("review");
    expect(one("SELECT status FROM p_checkouts WHERE id=?", first.c.id)!.status).toBe("pending");
    expect(wallet(sponsor).pending).toBe(25_000);
  });

  it("never lets ordinary settlement bypass authenticated DigiPay proof", () => {
    const { c } = checkout();
    expect(() => settleCheckout(c.id, "digipay:unverified-browser-value")).toThrow("payment_unverified");
    expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
    expect(wallet(sponsor).pending).toBe(0);
  });

  it("keeps a timed-out verification pending and never starts a second ticket", async () => {
    const { p, c } = await started();
    verifyMock.mockRejectedValue(new ApiError(503, "digipay_timeout"));
    expect((await callback(p)).outcome).toBe("pending");
    await expect(startDigiPayPayment(c.id, buyer)).rejects.toMatchObject({ code: "digipay_verification_pending" });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(one("SELECT status,tracking_code FROM p_digipay_payments WHERE id=?", p.id)).toEqual({ status: "pending", tracking_code: null });
    expect(wallet(sponsor).pending).toBe(0);
    verifyMock.mockImplementation(async (input) => ({ ...input }));
    run("UPDATE p_digipay_payments SET updated_at=? WHERE id=?", new Date(Date.now() - 180_000).toISOString(), p.id);
    expect(await recheckPendingDigiPayPayments()).toBe(1);
    expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("paid");
  });

  it("recovers durable verification after local settlement fails without verifying externally twice", async () => {
    const { p, c } = await started();
    platformDb().exec("CREATE TEMP TRIGGER stop_digipay_settlement BEFORE UPDATE OF status ON p_orders WHEN NEW.status='processing' BEGIN SELECT RAISE(ABORT,'injected settlement failure'); END");
    expect((await callback(p)).outcome).toBe("pending");
    expect(one("SELECT status,tracking_code,verified_at FROM p_digipay_payments WHERE id=?", p.id)).toMatchObject({ status: "verified", tracking_code: "track-" + p.id, verified_at: expect.any(String) });
    expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
    platformDb().exec("DROP TRIGGER stop_digipay_settlement");
    verifyMock.mockRejectedValue(new Error("verification must not repeat"));
    expect(await verifyDigiPayPayment(p.id)).toBe("paid");
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(wallet(sponsor).pending).toBe(25_000);
  });

  it("does not verify a saved sandbox payment after switching to production credentials", async () => {
    const { p, c } = await started();
    vi.stubEnv("DIGIPAY_ENVIRONMENT", "production");
    expect((await callback(p)).outcome).toBe("pending");
    await expect(startDigiPayPayment(c.id, buyer)).rejects.toMatchObject({ code: "payment_not_configured" });
    expect(verifyMock).not.toHaveBeenCalled();
    expect(wallet(sponsor).pending).toBe(0);
  });

  it("keeps expired orders with an unresolved issued ticket reserved during worker cleanup", async () => {
    const { p, c, order, productId } = await started();
    const expired = new Date(Date.now() - 3_600_000).toISOString();
    run("UPDATE p_checkouts SET expires_at=? WHERE id=?", expired, c.id);
    run("UPDATE p_orders SET expires_at=? WHERE id=?", expired, order);
    expect(() => refundOrder(order, buyer)).toThrow("payment_reconciliation_required");
    await maintenance();
    expect(one("SELECT status FROM p_orders WHERE id=?", order)!.status).toBe("pending");
    expect(one("SELECT stock FROM p_products WHERE id=?", productId)!.stock).toBe(9);
    expect(one("SELECT status FROM p_digipay_payments WHERE id=?", p.id)!.status).toBe("pending");
    expect(wallet(buyer).available).toBe(0);
  });

  it("escalates a missing callback to review without freeing stock, then recovers only through authenticated verification", async () => {
    const { p, c, order, productId } = await started();
    const old = new Date(Date.now() - 25 * 3_600_000).toISOString();
    run("UPDATE p_digipay_payments SET created_at=?,updated_at=? WHERE id=?", old, old, p.id);
    run("UPDATE p_checkouts SET expires_at=? WHERE id=?", old, c.id);
    run("UPDATE p_orders SET expires_at=? WHERE id=?", old, order);
    await recheckPendingDigiPayPayments();
    expect(one("SELECT status,last_error FROM p_digipay_payments WHERE id=?", p.id)).toEqual({ status: "review", last_error: "callback_missing" });
    expect(verifyMock).not.toHaveBeenCalled();
    await maintenance();
    expect(one("SELECT status FROM p_orders WHERE id=?", order)!.status).toBe("pending");
    expect(one("SELECT stock FROM p_products WHERE id=?", productId)!.stock).toBe(9);
    expect(wallet(buyer).available).toBe(0);
    expect((await callback(p)).outcome).toBe("paid");
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(one("SELECT status FROM p_orders WHERE id=?", order)!.status).toBe("processing");
    expect(wallet(buyer).available).toBe(0);
  });

  it("does not allow operator reconciliation to override a duplicate-transaction review", async () => {
    const first = await started();
    const second = await started();
    await callback(first.p, { trackingCode: "same-provider-sale" });
    expect((await callback(second.p, { trackingCode: "same-provider-sale" })).outcome).toBe("review");
    const before = verifyMock.mock.calls.length;
    await expect(reconcileDigiPayPayment(second.p.id, sponsor, "new-manual-reference", 5, "operator check")).rejects.toMatchObject({ code: "digipay_refund_required" });
    expect(verifyMock).toHaveBeenCalledTimes(before);
    expect(one("SELECT status FROM p_checkouts WHERE id=?", second.c.id)!.status).toBe("pending");
  });
});

describe("HTTP callback and ownership", () => {
  it("accepts the provider's cross-origin form POST and redirects to an authenticated result page", async () => {
    const { p, c } = await started();
    const res = await handle(new Request(`https://homanets.test/api/platform/payment/digipay/callback?pid=${p.id}`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://uatweb.mydigipay.info" },
      body: callbackFields(p).toString(),
    }), ["payment", "digipay", "callback"]);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://homanets.test/payment/result?provider=digipay&pid=${p.id}`);
    expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("paid");
  });

  it("ignores a forged success in callback GET parameters", async () => {
    const { p, c } = await started();
    const res = await handle(new Request(`https://homanets.test/api/platform/payment/digipay/callback?${callbackFields(p)}`), ["payment", "digipay", "callback"]);
    expect(res.status).toBe(303);
    expect(verifyMock).not.toHaveBeenCalled();
    expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
  });

  it("rejects duplicate form amount fields rather than selecting an ambiguous value", async () => {
    const { p } = await started();
    const form = callbackFields(p);
    form.append("amount", "1");
    const res = await handle(new Request(`https://homanets.test/api/platform/payment/digipay/callback?pid=${p.id}`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(),
    }), ["payment", "digipay", "callback"]);
    expect(res.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("limits a recognised callback per payment without sharing a proxy-wide bucket", async () => {
    vi.stubEnv("TRUST_PROXY", "0");
    const first = await started(), second = await started();
    const post = (p: Row) => handle(new Request(`https://homanets.test/api/platform/payment/digipay/callback?pid=${p.id}`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: callbackFields(p).toString(),
    }), ["payment", "digipay", "callback"]);
    for (let i = 0; i < 12; i++) expect((await post(first.p)).status).toBe(303);
    expect((await post(first.p)).status).toBe(429);
    expect((await post(second.p)).status).toBe(303);
    expect(one("SELECT status FROM p_checkouts WHERE id=?", second.c.id)!.status).toBe("paid");
  });

  it("requires login and ownership for viewing and re-verifying a payment", async () => {
    const { p, c } = await started();
    await expect(startDigiPayPayment(c.id, foreign)).rejects.toMatchObject({ code: "not_found" });
    expect(() => digipayPaymentSummary(p.id, foreign)).toThrow("not_found");
    const url = `https://homanets.test/api/platform/payments/digipay/${p.id}`;
    expect((await handle(new Request(url), ["payments", "digipay", p.id])).status).toBe(401);
    expect((await handle(new Request(url, { headers: { cookie: cookie(foreign) } }), ["payments", "digipay", p.id])).status).toBe(404);
    const strangerVerify = await handle(new Request(`${url}/verify`, { method: "POST", headers: {
      cookie: cookie(foreign), Origin: "https://homanets.test", "Content-Type": "application/json",
    }, body: "{}" }), ["payments", "digipay", p.id, "verify"]);
    expect(strangerVerify.status).toBe(404);
    expect(verifyMock).not.toHaveBeenCalled();
    const own = await handle(new Request(url, { headers: { cookie: cookie(buyer) } }), ["payments", "digipay", p.id]);
    expect(own.status).toBe(200);
    const summary = await own.json();
    expect(summary).toMatchObject({ status: "pending", checkoutPaid: false, reference: null });
    expect(summary).not.toHaveProperty("ticket");
    expect(summary).not.toHaveProperty("basket");
  });

  it("denies customer access to operator reconciliation and has no manual paid override even for an administrator", async () => {
    const { p, c } = await started();
    const url = "https://homanets.test/api/platform/admin/digipay-payments";
    const payload = { id: p.id, trackingCode: "operator-supplied-reference", type: 5, reason: "Support investigated a missing callback" };
    const request = (user: string, extra = {}) => new Request(url, {
      method: "POST", headers: { cookie: cookie(user), Origin: "https://homanets.test", "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, ...extra }),
    });
    expect((await handle(request(buyer), ["admin", "digipay-payments"])).status).toBe(403);
    expect(verifyMock).not.toHaveBeenCalled();
    run("UPDATE p_users SET role='superadmin' WHERE id=?", foreign);
    expect((await handle(request(foreign, { status: "paid" }), ["admin", "digipay-payments"])).status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
    verifyMock.mockRejectedValue(new ApiError(503, "digipay_timeout"));
    const result = await handle(request(foreign), ["admin", "digipay-payments"]);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ id: p.id, outcome: "pending" });
    expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
    expect(wallet(sponsor).pending).toBe(0);
  });
});
