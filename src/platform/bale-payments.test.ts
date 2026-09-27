// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { all, now, one, platformDb, run } from "./schema";
import { createCheckout } from "./checkout";
import { checkoutSchema } from "./cart-validation";
import { saveSetting } from "./providers";
import { wallet } from "./finance";
import { ApiError } from "../server/http";
import { setBalePayClient, type BalePayClient, type BaleVerifyResult } from "./bale-pay";
import { handleBaleCallback, recheckPendingBalePayments, startBalePayment, verifyBalePayment } from "./bale-payments";
import { handle } from "./api";

// BalePay is always mocked: these tests never contact a real provider.
const dir = mkdtempSync(join(tmpdir(), "homa-bale-"));
let buyer: string, sponsor: string, item: string;
let verifyResult: () => Promise<BaleVerifyResult>;
const calls = { create: 0, verify: 0 };
const mock: BalePayClient = {
  async createPayment(input) {
    calls.create++;
    return { providerReference: "ref-" + input.paymentId, redirectUrl: "https://pay.bale.test/p/" + input.paymentId };
  },
  async verifyPayment() {
    calls.verify++;
    return verifyResult();
  },
  parseCallback(fields) {
    return { providerReference: fields.get("ref") || undefined };
  },
};
const paid = (amountRial: number, transactionId = "tx-" + randomUUID()): (() => Promise<BaleVerifyResult>) =>
  async () => ({ outcome: "paid", transactionId, amountRial });

function member(sponsorId: string | null = null) {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,name,password,referral_code,sponsor_id,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",
    id, "Fixture", "unused", id, sponsorId, now(), now(), "test",
  );
  run("INSERT INTO p_wallets(user_id,available) VALUES(?,?)", id, 0);
  return id;
}
function product(price: number) {
  const id = randomUUID();
  run(
    "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)",
    id, "کالای آزمون", "test", "ai", "product", price, 10, now(), now(),
  );
  return id;
}
function baleCheckout(price = 250000) {
  item = product(price);
  return createCheckout(
    buyer,
    checkoutSchema.parse({ items: [{ productId: item, quantity: 1 }], method: "bale", idempotencyKey: randomUUID(), expectedTotal: price }),
  );
}
async function started(price = 250000) {
  const c = baleCheckout(price);
  const r = await startBalePayment(c.id, buyer);
  const p = one("SELECT * FROM p_bale_payments WHERE checkout_id=?", c.id)!;
  return { c, r, p };
}
const callback = (pid: string, extra: Record<string, string> = {}) =>
  handleBaleCallback(new URLSearchParams({ pid, ...extra }));
const orderStatus = (checkoutId: string) =>
  all("SELECT o.status,o.paid_at FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=?", checkoutId);

beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "db.sqlite");
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
  process.env.APP_ORIGIN = "https://homanets.test";
  platformDb();
});
afterAll(() => {
  setBalePayClient(null);
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  setBalePayClient(mock);
  calls.create = calls.verify = 0;
  saveSetting(
    "commission_policy",
    JSON.stringify({ directBps: 1000, levels: [], binaryBps: 0, maxPayoutBps: 3000, warningBps: 5000, criticalBps: 8000, withdrawMin: 1, withdrawMax: 1000000, paused: false }),
  );
  sponsor = member();
  buyer = member(sponsor);
});

it("sends the server's own amount in rial and returns only the redirect URL", async () => {
  const { r, p } = await started(250000);
  expect(r).toEqual({ status: "redirect", url: "https://pay.bale.test/p/" + p.id });
  expect(p).toMatchObject({ status: "pending", amount: 250000, amount_rial: 2500000, provider_reference: "ref-" + p.id });
});

it("settles the order only after a verified, matching payment", async () => {
  const { c, p } = await started();
  expect(orderStatus(c.id)[0].paid_at).toBeNull();
  verifyResult = paid(2500000, "tx-ok");
  expect((await callback(p.id)).outcome).toBe("paid");
  expect(one("SELECT status,payment_ref FROM p_checkouts WHERE id=?", c.id)).toEqual({ status: "paid", payment_ref: "bale:tx-ok" });
  expect(orderStatus(c.id)[0].status).toBe("processing");
  expect(one("SELECT status,provider_transaction_id FROM p_bale_payments WHERE id=?", p.id)).toEqual({ status: "paid", provider_transaction_id: "tx-ok" });
  expect(wallet(sponsor).pending).toBe(25000);
});

it("does not settle a failed verification", async () => {
  const { c, p } = await started();
  verifyResult = async () => ({ outcome: "failed", code: "declined" });
  expect((await callback(p.id)).outcome).toBe("failed");
  expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
  expect(orderStatus(c.id)[0].paid_at).toBeNull();
  expect(wallet(sponsor).pending).toBe(0);
});

it("rejects a verified payment whose amount differs from the order", async () => {
  const { c, p } = await started();
  verifyResult = paid(1000, "tx-short");
  expect((await callback(p.id)).outcome).toBe("failed");
  expect(one("SELECT status,last_error FROM p_bale_payments WHERE id=?", p.id)).toEqual({ status: "failed", last_error: "amount_mismatch" });
  expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
  expect(one("SELECT COUNT(*) n FROM p_audit WHERE action='payment.bale.rejected' AND entity_id=?", p.id)!.n).toBe(1);
});

it("rejects a reference that belongs to another payment", async () => {
  const { c, p } = await started();
  verifyResult = async () => ({ outcome: "paid", transactionId: "tx-ref", amountRial: 2500000, reference: "someone-else" });
  expect((await callback(p.id)).outcome).toBe("failed");
  expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
});

it("ignores unknown or malformed callbacks without touching any order", async () => {
  verifyResult = paid(2500000);
  expect((await callback(randomUUID())).outcome).toBe("unknown_payment");
  expect((await callback("not-a-uuid")).outcome).toBe("unknown_payment");
  expect((await handleBaleCallback(new URLSearchParams())).outcome).toBe("unknown_payment");
  expect((await callback("'; DROP TABLE p_orders;--")).outcome).toBe("unknown_payment");
  expect(calls.verify).toBe(0);
});

it("handles a duplicate callback once: no second settlement or commission", async () => {
  const { c, p } = await started();
  verifyResult = paid(2500000, "tx-dup");
  expect((await callback(p.id)).outcome).toBe("paid");
  expect((await callback(p.id)).outcome).toBe("paid");
  await Promise.all([callback(p.id), callback(p.id)]);
  expect(calls.verify).toBe(1);
  expect(wallet(sponsor).pending).toBe(25000);
  expect(one("SELECT COUNT(*) n FROM p_commissions WHERE order_id IN (SELECT order_id FROM p_checkout_items WHERE checkout_id=?)", c.id)!.n).toBe(1);
});

it("never lets one Bale transaction id pay two orders", async () => {
  const a = await started();
  verifyResult = paid(2500000, "tx-shared");
  expect((await callback(a.p.id)).outcome).toBe("paid");
  const b = await started();
  expect((await callback(b.p.id)).outcome).toBe("failed");
  expect(one("SELECT last_error FROM p_bale_payments WHERE id=?", b.p.id)!.last_error).toBe("duplicate_transaction");
  expect(one("SELECT status FROM p_checkouts WHERE id=?", b.c.id)!.status).toBe("pending");
});

it("treats a replayed callback for another payment's reference as a mismatch", async () => {
  const a = await started();
  const b = await started();
  verifyResult = paid(2500000);
  const r = await callback(b.p.id, { ref: a.p.provider_reference });
  expect(r.outcome).toBe("failed");
  expect(calls.verify).toBe(0);
  expect(one("SELECT status FROM p_checkouts WHERE id=?", b.c.id)!.status).toBe("pending");
});

it("keeps the payment pending when Bale times out, and settles once it can verify", async () => {
  const { c, p } = await started();
  verifyResult = async () => {
    throw new ApiError(503, "provider_unavailable");
  };
  expect((await callback(p.id)).outcome).toBe("pending");
  expect(one("SELECT status,last_error FROM p_bale_payments WHERE id=?", p.id)).toEqual({ status: "pending", last_error: "provider_unavailable" });
  verifyResult = async () => ({ outcome: "unknown", code: "timeout" });
  expect((await verifyBalePayment(p.id)).valueOf()).toBe("pending");
  // The worker re-verifies it later.
  verifyResult = paid(2500000, "tx-late");
  run("UPDATE p_bale_payments SET updated_at=? WHERE id=?", new Date(Date.now() - 600000).toISOString(), p.id);
  expect(await recheckPendingBalePayments()).toBe(1);
  expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("paid");
});

it("does not open a new attempt while an older one may still be paid", async () => {
  const { c, p } = await started();
  run("UPDATE p_bale_payments SET created_at=? WHERE id=?", new Date(Date.now() - 3600000).toISOString(), p.id);
  verifyResult = async () => ({ outcome: "unknown", code: "timeout" });
  await expect(startBalePayment(c.id, buyer)).rejects.toThrow("payment_verification_pending");
  // Once Bale confirms it was cancelled, a fresh attempt may start.
  verifyResult = async () => ({ outcome: "cancelled", code: "user" });
  const again = await startBalePayment(c.id, buyer);
  expect(again.status).toBe("redirect");
  expect(one("SELECT COUNT(*) n FROM p_bale_payments WHERE checkout_id=?", c.id)!.n).toBe(2);
});

it("reuses a fresh redirect instead of creating duplicate attempts", async () => {
  const { c, r } = await started();
  expect(await startBalePayment(c.id, buyer)).toEqual(r);
  expect(calls.create).toBe(1);
});

it("keeps the order when the create call fails, and allows a safe retry", async () => {
  const c = baleCheckout();
  setBalePayClient({ ...mock, createPayment: async () => { throw new ApiError(503, "provider_unavailable"); } });
  await expect(startBalePayment(c.id, buyer)).rejects.toThrow("provider_unavailable");
  expect(one("SELECT status FROM p_bale_payments WHERE checkout_id=?", c.id)!.status).toBe("request_failed");
  expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
  setBalePayClient(mock);
  expect((await startBalePayment(c.id, buyer)).status).toBe("redirect");
});

it("refuses redirects to anything but https", async () => {
  const c = baleCheckout();
  setBalePayClient({ ...mock, createPayment: async () => ({ providerReference: "r1", redirectUrl: "javascript:alert(1)" }) });
  await expect(startBalePayment(c.id, buyer)).rejects.toThrow("provider_rejected");
});

it("reports an already-paid order as paid without calling Bale again", async () => {
  const { c, p } = await started();
  verifyResult = paid(2500000, "tx-once");
  await callback(p.id);
  const before = calls.create + calls.verify;
  expect(await startBalePayment(c.id, buyer)).toEqual({ status: "paid" });
  expect((await callback(p.id)).outcome).toBe("paid");
  expect(calls.create + calls.verify).toBe(before);
});

it("only lets the owner start a payment for a checkout", async () => {
  const c = baleCheckout();
  await expect(startBalePayment(c.id, member())).rejects.toThrow("not_found");
});

it("redirects the browser to the result page and never marks paid from query parameters", async () => {
  const { c, p } = await started();
  verifyResult = async () => ({ outcome: "unknown", code: "timeout" });
  const res = await handle(
    new Request(`https://homanets.test/api/platform/payment/bale/callback?pid=${p.id}&status=paid&amount=2500000`),
    ["payment", "bale", "callback"],
  );
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe(`https://homanets.test/payment/result?provider=bale&pid=${p.id}`);
  expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe("pending");
});

it("hides Bale from checkout until it is configured", async () => {
  setBalePayClient(null);
  const res = await handle(new Request("https://homanets.test/api/platform/payment/methods"), ["payment", "methods"]);
  expect(await res.json()).toMatchObject({ bale: false });
  await expect(startBalePayment(baleCheckout().id, buyer)).rejects.toThrow("payment_not_configured");
});
