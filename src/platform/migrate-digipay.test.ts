// @vitest-environment node
import { afterAll, afterEach, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDigiPay } from "./migrate-digipay";

const dir = mkdtempSync(join(tmpdir(), "homa-digipay-migration-"));
const originalPath = process.env.DATABASE_PATH;
const databases: Database.Database[] = [];
let sequence = 0;
afterEach(() => {
  for (const db of databases.splice(0)) if (db.open) db.close();
  if (originalPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalPath;
  vi.resetModules();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function legacyDb() {
  const db = new Database(join(dir, `${++sequence}.sqlite`));
  databases.push(db);
  db.pragma("foreign_keys=ON");
  db.exec(`
    CREATE TABLE p_users(id TEXT PRIMARY KEY);
    CREATE TABLE p_products(id TEXT PRIMARY KEY);
    CREATE TABLE p_orders(
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES p_users(id),
      product_id TEXT NOT NULL REFERENCES p_products(id),
      amount INTEGER NOT NULL CHECK(amount>0),
      status TEXT NOT NULL CHECK(status IN ('pending','processing','delivered','refunded')),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('wallet','zarinpal','zibal','bale','company_credit')),
      payment_ref TEXT UNIQUE, idem_key TEXT NOT NULL, extension TEXT DEFAULT 'preserved',
      UNIQUE(user_id,idem_key)
    );
    CREATE TABLE p_checkouts(
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES p_users(id),
      amount INTEGER NOT NULL CHECK(amount>0),
      method TEXT NOT NULL CHECK(method IN ('wallet','zarinpal','zibal','bale','company_credit')),
      status TEXT NOT NULL CHECK(status IN ('pending','paid')),
      payment_ref TEXT UNIQUE, payload TEXT NOT NULL, idem_key TEXT NOT NULL,
      UNIQUE(user_id,idem_key)
    );
    CREATE TABLE p_checkout_items(
      checkout_id TEXT NOT NULL REFERENCES p_checkouts(id),
      order_id TEXT NOT NULL UNIQUE REFERENCES p_orders(id),
      PRIMARY KEY(checkout_id,order_id)
    );
    CREATE TABLE migration_audit(order_id TEXT NOT NULL, status TEXT NOT NULL);
    CREATE INDEX p_orders_user ON p_orders(user_id,amount);
    CREATE UNIQUE INDEX custom_pending_checkout ON p_checkouts(user_id,amount) WHERE status='pending';
    CREATE TRIGGER custom_order_audit AFTER UPDATE OF status ON p_orders
      BEGIN INSERT INTO migration_audit(order_id,status) VALUES(NEW.id,NEW.status); END;
    INSERT INTO p_users VALUES('u');
    INSERT INTO p_products VALUES('p');
  `);
  for (const [i, method] of ["wallet", "zarinpal", "zibal", "bale", "company_credit"].entries()) {
    db.prepare("INSERT INTO p_orders VALUES(?,?,?,?,?,?,?,?,?)")
      .run(`o${i}`, "u", "p", 1000 + i, "pending", method, `order-ref-${i}`, `order-idem-${i}`, `extension-${i}`);
    db.prepare("INSERT INTO p_checkouts VALUES(?,?,?,?,?,?,?,?)")
      .run(`c${i}`, "u", 1000 + i, method, "pending", `checkout-ref-${i}`, `{"method":"${method}"}`, `checkout-idem-${i}`);
    db.prepare("INSERT INTO p_checkout_items VALUES(?,?)").run(`c${i}`, `o${i}`);
  }
  return db;
}

function objects(db: Database.Database) {
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
}

it("preserves legacy rows, extension columns, indexes, triggers and foreign keys while adding DigiPay", () => {
  const db = legacyDb();
  const tables = ["p_orders", "p_checkouts", "p_checkout_items"];
  const rows = tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  const foreignKeys = tables.map(table => db.pragma(`foreign_key_list(${table})`));
  const extras = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL ORDER BY name").all();
  expect(() => db.exec("UPDATE p_orders SET payment_method='digipay' WHERE id='o0'")) .toThrow(/CHECK/);
  expect(() => db.exec("UPDATE p_checkouts SET method='digipay' WHERE id='c0'")) .toThrow(/CHECK/);

  migrateDigiPay(db);

  expect(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all())).toEqual(rows);
  expect(tables.map(table => db.pragma(`foreign_key_list(${table})`))).toEqual(foreignKeys);
  expect(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL ORDER BY name").all()).toEqual(extras);
  expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  expect(db.pragma("foreign_key_check")).toEqual([]);
  db.exec("UPDATE p_orders SET payment_method='digipay' WHERE id='o0'; UPDATE p_checkouts SET method='digipay' WHERE id='c0'");
  expect(() => db.exec("UPDATE p_orders SET payment_method='unknown' WHERE id='o0'")) .toThrow(/CHECK/);
  expect(() => db.exec("UPDATE p_checkouts SET amount=0 WHERE id='c0'")) .toThrow(/CHECK/);
  expect(() => db.exec("UPDATE p_orders SET payment_ref='order-ref-0' WHERE id='o1'")) .toThrow(/UNIQUE/);
  expect(() => db.exec("UPDATE p_orders SET idem_key='order-idem-0' WHERE id='o1'")) .toThrow(/UNIQUE/);
  expect(() => db.exec("UPDATE p_checkouts SET amount=1000 WHERE id='c1'")) .toThrow(/UNIQUE/);
  expect(() => db.exec("UPDATE p_orders SET user_id='missing' WHERE id='o0'")) .toThrow(/FOREIGN KEY/);
  expect(() => db.exec("DELETE FROM p_orders WHERE id='o0'")) .toThrow(/FOREIGN KEY/);
  expect(() => db.exec("DELETE FROM p_checkouts WHERE id='c0'")) .toThrow(/FOREIGN KEY/);
  db.exec("UPDATE p_orders SET status='delivered' WHERE id='o0'");
  expect(db.prepare("SELECT * FROM migration_audit").all()).toEqual([{ order_id: "o0", status: "delivered" }]);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%digipay_v1%'").all()).toEqual([]);
});

it("is idempotent, supports a partially migrated database, and restores a disabled foreign-key setting", () => {
  const db = legacyDb();
  db.pragma("foreign_keys=OFF");
  // Simulate an installation whose orders constraint has already been upgraded.
  const orderSql = (db.prepare("SELECT sql FROM sqlite_master WHERE name='p_orders'").get() as { sql: string }).sql;
  db.exec(orderSql.replace("p_orders", "orders_upgraded").replace("'company_credit'", "'company_credit','digipay'"));
  db.exec("INSERT INTO orders_upgraded SELECT * FROM p_orders; DROP TABLE p_orders; ALTER TABLE orders_upgraded RENAME TO p_orders");
  const ordersBefore = db.prepare("SELECT * FROM p_orders ORDER BY id").all();
  migrateDigiPay(db);
  expect(db.pragma("foreign_keys", { simple: true })).toBe(0);
  expect(db.prepare("SELECT * FROM p_orders ORDER BY id").all()).toEqual(ordersBefore);
  db.exec("UPDATE p_checkouts SET method='digipay' WHERE id='c0'");
  const before = objects(db);
  const version = db.pragma("schema_version", { simple: true });
  migrateDigiPay(db);
  migrateDigiPay(db);
  expect(objects(db)).toEqual(before);
  expect(db.pragma("schema_version", { simple: true })).toBe(version);
  expect(db.pragma("foreign_key_check")).toEqual([]);
});

it("rolls back the first table rebuild when the second table cannot be migrated", () => {
  const db = legacyDb();
  db.pragma("foreign_keys=OFF");
  db.exec("DROP TABLE p_checkouts; CREATE TABLE p_checkouts(id TEXT PRIMARY KEY, method TEXT CHECK(method IN ('legacy'))); INSERT INTO p_checkouts VALUES('c0','legacy')");
  db.pragma("foreign_keys=ON");
  const before = objects(db);
  const orders = db.prepare("SELECT * FROM p_orders ORDER BY id").all();
  expect(() => migrateDigiPay(db)).toThrow("Unrecognized payment method constraint");
  expect(objects(db)).toEqual(before);
  expect(db.prepare("SELECT * FROM p_orders ORDER BY id").all()).toEqual(orders);
  expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%digipay_v1%'").all()).toEqual([]);
  expect(() => db.exec("UPDATE p_orders SET payment_method='digipay' WHERE id='o0'")) .toThrow(/CHECK/);
});

it("initializes a fresh platform database with DigiPay constraints and remains unchanged on repeat migration", async () => {
  process.env.DATABASE_PATH = join(dir, `platform-${++sequence}.sqlite`);
  vi.resetModules();
  const { platformDb } = await import("./schema");
  const db = platformDb();
  databases.push(db);
  db.prepare("INSERT INTO p_users(id,name,password,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?)")
    .run("fresh-user", "test", "test", "fresh-ref", "t", "t", "t");
  db.prepare("INSERT INTO p_checkouts(id,user_id,amount,method,status,payload,created_at,expires_at,idem_key) VALUES(?,?,?,?,?,?,?,?,?)")
    .run("fresh-checkout", "fresh-user", 1000, "digipay", "pending", "{}", "t", "t", "fresh-idem");
  for (const table of ["p_orders", "p_checkouts"]) {
    expect((db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(table) as { sql: string }).sql).toContain("'digipay'");
  }
  for (const table of ["p_digipay_payments", "p_digipay_refunds", "p_digipay_deliveries"]) {
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)).toBeTruthy();
    expect((db.pragma(`foreign_key_list(${table})`) as unknown[]).length).toBeGreaterThan(0);
  }
  const refundIndex = db.prepare("SELECT sql FROM sqlite_master WHERE name='p_digipay_refunds_open_order'").get() as { sql: string };
  expect(refundIndex.sql).toMatch(/WHERE\s+status\s*!=\s*'failed'/);
  const before = objects(db);
  migrateDigiPay(db);
  expect(objects(db)).toEqual(before);
  expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  expect(db.pragma("foreign_key_check")).toEqual([]);
});
