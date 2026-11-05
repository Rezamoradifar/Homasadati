// @vitest-environment node
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { migrateDigipay } from "./migrate-digipay";

describe("DigiPay schema migration", () => {
  it("preserves existing rows and indexes while allowing DigiPay payments", () => {
    const db = new Database(":memory:");
    try {
      db.exec(`
        CREATE TABLE p_orders (
          id TEXT PRIMARY KEY,
          payment_method TEXT NOT NULL CHECK(payment_method IN ('wallet','zarinpal','bank_transfer')),
          note TEXT NOT NULL
        );
        CREATE INDEX p_orders_note ON p_orders(note);
        INSERT INTO p_orders VALUES('order-1','zarinpal','keep me');
        CREATE TABLE p_checkouts (
          id TEXT PRIMARY KEY,
          method TEXT NOT NULL CHECK(method IN ('wallet','zarinpal','bank_transfer')),
          note TEXT NOT NULL
        );
        CREATE INDEX p_checkouts_note ON p_checkouts(note);
        INSERT INTO p_checkouts VALUES('checkout-1','bank_transfer','also keep me');
      `);
      migrateDigipay(db);
      expect(db.prepare("SELECT id,note FROM p_orders").get()).toEqual({
        id: "order-1",
        note: "keep me",
      });
      expect(db.prepare("SELECT id,note FROM p_checkouts").get()).toEqual({
        id: "checkout-1",
        note: "also keep me",
      });
      expect(db.pragma("table_info(p_orders)").some((column: { name: string }) => column.name === "provider_url")).toBe(true);
      expect(db.pragma("table_info(p_checkouts)").some((column: { name: string }) => column.name === "provider_url")).toBe(true);
      db.prepare("INSERT INTO p_orders(id,payment_method,note) VALUES(?,?,?)").run("order-2","digipay","new");
      db.prepare("INSERT INTO p_checkouts(id,method,note) VALUES(?,?,?)").run("checkout-2","digipay","new");
      expect(db.prepare("SELECT COUNT(*) AS n FROM p_orders").get()).toEqual({ n: 2 });
      expect(db.prepare("SELECT COUNT(*) AS n FROM p_checkouts").get()).toEqual({ n: 2 });
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='p_orders_note'").get()).toBeTruthy();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='p_checkouts_note'").get()).toBeTruthy();
    } finally {
      db.close();
    }
  });
});
