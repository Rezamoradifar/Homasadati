// @vitest-environment node
import { afterAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const dir = mkdtempSync(join(tmpdir(), "homa-paymig-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("upgrades an existing database through every payment-method migration, keeping every row", async () => {
  process.env.DATABASE_PATH = join(dir, "db.sqlite");
  let schema = await import("./schema");
  const db = schema.platformDb();
  // Turn it into a database from before the later gateway additions: the old
  // CHECK on both tables accepted only wallet and Zarinpal.
  db.pragma("foreign_keys = OFF");
  for (const table of ["p_checkouts", "p_orders"]) {
    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(table) as { sql: string }).sql;
    db.exec(sql.replace(table, table + "_old").replace(",'company_credit'", "").replace(",'digipay'", "").replace(",'bale'", "").replace(",'zibal'", ""));
    db.exec(`INSERT INTO ${table}_old SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_old RENAME TO ${table};`);
  }
  const user = randomUUID();
  db.prepare("INSERT INTO p_users(id,name,password,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?)").run(user, "x", "x", user, "t", "t", "t");
  db.prepare(
    "INSERT INTO p_checkouts(id,user_id,amount,method,status,payload,created_at,expires_at,idem_key) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run("c1", user, 1000, "zarinpal", "pending", "{}", "t", "t", randomUUID());
  db.exec("DELETE FROM p_migrations WHERE version=21");
  expect(() =>
    db.prepare("UPDATE p_checkouts SET method='bale' WHERE id='c1'").run(),
  ).toThrow(/CHECK/);
  db.close();

  vi.resetModules();
  schema = await import("./schema");
  const upgraded = schema.platformDb();
  for (const table of ["p_checkouts", "p_orders"]) {
    const sql = schema.one("SELECT sql FROM sqlite_master WHERE name=?", table)!.sql as string;
    for (const method of ["wallet", "zarinpal", "zibal", "bale", "company_credit", "digipay"])
      expect(sql).toContain(`'${method}'`);
  }
  expect(schema.one("SELECT method FROM p_checkouts WHERE id='c1'")!.method).toBe("zarinpal");
  for (const method of ["bale", "zibal", "company_credit", "digipay"])
    schema.run("UPDATE p_checkouts SET method=? WHERE id='c1'", method);
  expect(schema.one("SELECT version FROM p_migrations WHERE version=21")).toBeTruthy();
  expect((upgraded.pragma("foreign_key_check") as unknown[]).length).toBe(0);
  upgraded.close();
});
