// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCheckout } from "./checkout";
import { createOrder } from "./finance";
import { orderDocument } from "./order-document";
import { saveSetting } from "./providers";
import { all, now, one, platformDb, run } from "./schema";

const dir = mkdtempSync(join(tmpdir(), "homa-order-document-"));
let buyer: string, product: string, address: string;
const originalName = "مینا احمدی";
const originalPhone = "+989121234567";
const originalAddress = "خیابان نمونه، پلاک ۱۲\nواحد ۳";

beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  process.env.APP_ORIGIN = "https://orders.test";
});

beforeEach(() => {
  saveSetting("commission_policy", JSON.stringify({
    directBps: 0, levels: [], binaryBps: 0, maxPayoutBps: 3000,
    warningBps: 7000, criticalBps: 9000, withdrawMin: 1,
    withdrawMax: 1e9, paused: false,
  }));
  buyer = randomUUID();
  product = randomUUID();
  address = randomUUID();
  run("UPDATE p_users SET phone=NULL WHERE phone=?", originalPhone);
  run(`INSERT INTO p_users(id,name,phone,password,referral_code,created_at,last_seen,signup_ip)
    VALUES(?,?,?,'private-password',?,?,?,'test')`,
    buyer, originalName, originalPhone, buyer, now(), now());
  run("INSERT INTO p_wallets(user_id,available) VALUES(?,1000000)", buyer);
  run(`INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at)
    VALUES(?,'کیف چرمی','fixture','leather','product',125000,10,1,?,?)`, product, now(), now());
  run("INSERT INTO p_addresses VALUES(?,?,?,'ایران','تهران','1234567890',?)",
    address, buyer, "خانه", originalAddress);
});

afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});

it("keeps the purchased line, contact and exact delivery snapshot after profile, address and catalog changes", () => {
  const other = randomUUID();
  run(`INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at)
    VALUES(?,'محصول دوم','fixture','craft','product',50000,10,1,?,?)`, other, now(), now());
  const checkout = createCheckout(buyer, {
    items: [{ productId: product, quantity: 2 }, { productId: other, quantity: 1 }],
    method: "wallet", expectedTotal: 300000, addressId: address,
    idempotencyKey: randomUUID(),
  });
  const order = one("SELECT * FROM p_orders WHERE user_id=? AND product_id=?", buyer, product)!;
  expect(all("SELECT * FROM p_checkout_items WHERE checkout_id=?", checkout.id)).toHaveLength(2);
  const savedPolicy = order.policy;
  run("UPDATE p_users SET name='نام جدید',phone=NULL WHERE id=?", buyer);
  run("UPDATE p_addresses SET address='نشانی جدید',postal_code='9999999999' WHERE id=?", address);
  run("UPDATE p_products SET title='عنوان جدید',price=900000 WHERE id=?", product);

  const document = orderDocument(order.id);
  expect(document.customer).toEqual({ name: originalName, phone: originalPhone, source: "snapshot" });
  expect(document.shipping).toEqual({ label: "خانه", country: "ایران", city: "تهران", postalCode: "1234567890", address: originalAddress });
  expect(document.order).toMatchObject({ id: order.id, title: "کیف چرمی", vertical: "leather", quantity: 2, unitPrice: 125000, amount: 250000 });
  expect(Object.keys(document).sort()).toEqual(["customer", "order", "shipping"]);
  expect(document).not.toHaveProperty("items");
  expect(document).not.toHaveProperty("policy");
  expect(document.customer).not.toHaveProperty("password");
  expect(one("SELECT policy FROM p_orders WHERE id=?", order.id)!.policy).toBe(savedPolicy);
});

it("labels legacy contact as current profile and never substitutes a saved address for missing order delivery", () => {
  const order = createOrder(buyer, product, 1, "zibal", randomUUID());
  const policy = JSON.parse(order.policy);
  delete policy.orderTerms.customer;
  run("UPDATE p_orders SET policy=? WHERE id=?", JSON.stringify(policy), order.id);
  run("UPDATE p_users SET name='نام فعلی',phone=NULL WHERE id=?", buyer);

  expect(orderDocument(order.id)).toMatchObject({
    customer: { name: "نام فعلی", phone: null, source: "current_profile" },
    shipping: null,
  });
  run("UPDATE p_orders SET policy='{}' WHERE id=?", order.id);
  expect(orderDocument(order.id).shipping).toBeNull();
});

it("keeps an explicitly absent phone in new contact snapshots when a phone is added later", () => {
  run("UPDATE p_users SET phone=NULL WHERE id=?", buyer);
  const order = createOrder(buyer, product, 1, "zibal", randomUUID());
  run("UPDATE p_users SET name='نام جدید',phone=? WHERE id=?", originalPhone, buyer);
  expect(orderDocument(order.id).customer).toEqual({ name: originalName, phone: null, source: "snapshot" });
});

it("handles malformed legacy terms without a write and returns not found for an absent order", () => {
  const order = createOrder(buyer, product, 1, "zibal", randomUUID());
  run("UPDATE p_orders SET policy='legacy invalid json' WHERE id=?", order.id);
  const document = orderDocument(order.id);
  expect(document.customer.source).toBe("current_profile");
  expect(document.shipping).toBeNull();
  expect(one("SELECT policy FROM p_orders WHERE id=?", order.id)!.policy).toBe("legacy invalid json");
  expect(() => orderDocument(randomUUID())).toThrow("not_found");
});
