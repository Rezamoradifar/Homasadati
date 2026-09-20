// @vitest-environment node
import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { platformDb, run, one, all, now } from "./schema";
import {
  createCheckout,
  quoteCart,
  settleCheckout,
  payCheckout,
} from "./checkout";
import { checkoutSchema } from "./cart-validation";
import { saveSetting } from "./providers";
import { refundOrder, wallet } from "./finance";
import { migrateLeather } from "./migrate-leather";
import { handle } from "./api";
import { session, SESSION_COOKIE } from "./security";
const dir = mkdtempSync(join(tmpdir(), "homa-checkout-"));
let buyer: string,
  sponsor: string,
  address: string,
  first: string,
  second: string;
function member(sponsorId: string | null = null) {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,name,password,referral_code,sponsor_id,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",
    id,
    "Fixture",
    "unused",
    id,
    sponsorId,
    now(),
    now(),
    "test",
  );
  run("INSERT INTO p_wallets(user_id,available) VALUES(?,?)", id, 500000);
  return id;
}
function product(vertical: string, price: number) {
  const id = randomUUID();
  run(
    "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)",
    id,
    "کالای آزمون",
    "test",
    vertical,
    "product",
    price,
    10,
    now(),
    now(),
  );
  return id;
}
function payload(method: "wallet" | "zarinpal" = "wallet") {
  return checkoutSchema.parse({
    items: [
      { productId: first, quantity: 1 },
      { productId: second, quantity: 2 },
    ],
    method,
    idempotencyKey: randomUUID(),
    expectedTotal: 400000,
    addressId: address,
  });
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "db.sqlite");
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
  process.env.APP_ORIGIN = "https://cart.test";
});
afterAll(() => {
  vi.unstubAllGlobals();
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  vi.unstubAllGlobals();
  saveSetting(
    "commission_policy",
    JSON.stringify({
      directBps: 1000,
      levels: [],
      binaryBps: 0,
      maxPayoutBps: 3000,
      warningBps: 5000,
      criticalBps: 8000,
      withdrawMin: 1,
      withdrawMax: 1000000,
      paused: false,
    }),
  );
  sponsor = member();
  buyer = member(sponsor);
  address = randomUUID();
  run(
    "INSERT INTO p_addresses VALUES(?,?,?,?,?,?,?)",
    address,
    buyer,
    "خانه",
    "ایران",
    "تهران",
    "1234567890",
    "نشانی آزمون",
  );
  first = product("leather", 200000);
  second = product("craft", 100000);
});
it("atomically buys multiple SKUs with one wallet debit total and snapshots the delivery address", () => {
  const p = payload();
  const c = createCheckout(buyer, p);
  expect(c.status).toBe("paid");
  expect(wallet(buyer).available).toBe(100000);
  expect(wallet(sponsor).pending).toBe(40000);
  expect(
    all("SELECT * FROM p_checkout_items WHERE checkout_id=?", c.id),
  ).toHaveLength(2);
  const order = one("SELECT * FROM p_orders WHERE user_id=?", buyer)!;
  expect(JSON.parse(order.policy).orderTerms.shippingAddress.city).toBe(
    "تهران",
  );
  expect(createCheckout(buyer, p).id).toBe(c.id);
  expect(wallet(buyer).available).toBe(100000);
});
it("rolls back every stock change, ledger row and order when the second wallet purchase cannot be funded", () => {
  run("UPDATE p_wallets SET available=250000 WHERE user_id=?", buyer);
  expect(() => createCheckout(buyer, payload())).toThrow(
    "insufficient_balance",
  );
  expect(wallet(buyer).available).toBe(250000);
  expect(one("SELECT stock FROM p_products WHERE id=?", first)!.stock).toBe(10);
  expect(one("SELECT COUNT(*) n FROM p_orders WHERE user_id=?", buyer)!.n).toBe(
    0,
  );
  expect(
    one("SELECT COUNT(*) n FROM p_checkouts WHERE user_id=?", buyer)!.n,
  ).toBe(0);
});
it("rejects stale totals, unavailable inventory, duplicate lines and somebody else's address", () => {
  expect(() =>
    createCheckout(buyer, { ...payload(), expectedTotal: 1 }),
  ).toThrow("price_changed");
  expect(() => createCheckout(member(), payload())).toThrow("address_required");
  run("UPDATE p_products SET stock=0 WHERE id=?", second);
  expect(() => quoteCart(payload().items)).toThrow("out_of_stock");
  expect(() =>
    checkoutSchema.parse({
      ...payload(),
      items: [
        { productId: first, quantity: 1 },
        { productId: first, quantity: 2 },
      ],
    }),
  ).toThrow();
});
it("verifies one bank payment for the entire cart and settles every line exactly once", async () => {
  saveSetting("zarinpal_merchant", "test-merchant", true);
  const c = createCheckout(buyer, payload("zarinpal"));
  const authority = "A" + randomUUID();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.amount).toBe(4000000);
      return Response.json(
        url.includes("request.json")
          ? { data: { code: 100, authority } }
          : { data: { code: 100, ref_id: "bank-" + c.id } },
      );
    }),
  );
  await payCheckout(c.id, buyer);
  const callback = () =>
    handle(
      new Request(
        "https://cart.test/api/platform/payment/callback?Authority=" +
          authority,
      ),
      ["payment", "callback"],
    );
  expect((await callback()).status).toBe(303);
  expect((await callback()).status).toBe(303);
  expect(wallet(sponsor).pending).toBe(40000);
  expect(one("SELECT status FROM p_checkouts WHERE id=?", c.id)!.status).toBe(
    "paid",
  );
  expect(
    all(
      "SELECT * FROM p_orders WHERE user_id=? AND paid_at IS NOT NULL",
      buyer,
    ),
  ).toHaveLength(2);
});
it("blocks partial cancellation of an active bank checkout and refunds late payment once after expiry", () => {
  const c = createCheckout(buyer, payload("zarinpal"));
  const orders = all(
    "SELECT order_id FROM p_checkout_items WHERE checkout_id=?",
    c.id,
  );
  expect(() => refundOrder(orders[0].order_id, buyer)).toThrow(
    "payment_reconciliation_required",
  );
  run("UPDATE p_checkouts SET expires_at='2000' WHERE id=?", c.id);
  for (const o of orders) {
    run("UPDATE p_orders SET expires_at='2000' WHERE id=?", o.order_id);
    refundOrder(o.order_id, buyer);
  }
  settleCheckout(c.id, "late-" + c.id);
  settleCheckout(c.id, "late-" + c.id);
  expect(wallet(buyer).available).toBe(900000);
  expect(wallet(sponsor).pending).toBe(0);
  expect(one("SELECT stock FROM p_products WHERE id=?", first)!.stock).toBe(10);
});
it("enforces checkout ownership and permits public server-priced quotes", async () => {
  const c = createCheckout(buyer, payload("zarinpal"));
  const cookie = SESSION_COOKIE + "=" + session(member(), "test");
  const r = await handle(
    new Request("https://cart.test/api/platform/checkouts/" + c.id, {
      headers: { cookie },
    }),
    ["checkouts", c.id],
  );
  expect(r.status).toBe(404);
  const quote = await handle(
    new Request("https://cart.test/api/platform/cart/quote", {
      method: "POST",
      headers: {
        origin: "https://cart.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: payload().items }),
    }),
    ["cart", "quote"],
  );
  expect(quote.status).toBe(200);
  expect((await quote.json()).total).toBe(400000);
});
it("rebuilds the old four-sector schema without losing referenced products or indexes", () => {
  const d = new Database(":memory:");
  d.pragma("foreign_keys=ON");
  d.exec(
    "CREATE TABLE p_products(id TEXT PRIMARY KEY,vertical TEXT NOT NULL CHECK(vertical IN ('tourism','beauty','craft','ai'))); CREATE INDEX original_vertical ON p_products(vertical); CREATE TABLE child(id TEXT REFERENCES p_products(id) ON DELETE CASCADE); INSERT INTO p_products VALUES('old','craft'); INSERT INTO child VALUES('old');",
  );
  migrateLeather(d);
  expect(d.prepare("SELECT * FROM child").all()).toHaveLength(1);
  expect(
    d.prepare("SELECT vertical FROM p_products WHERE id='old'").get(),
  ).toEqual({ vertical: "craft" });
  d.prepare("INSERT INTO p_products VALUES(?,?)").run("new", "leather");
  expect(() =>
    d.prepare("INSERT INTO p_products VALUES(?,?)").run("bad", "unknown"),
  ).toThrow();
  expect(d.pragma("foreign_keys", { simple: true })).toBe(1);
  expect(
    d
      .prepare("SELECT name FROM sqlite_master WHERE name='original_vertical'")
      .get(),
  ).toBeTruthy();
  migrateLeather(d);
  d.close();
});
