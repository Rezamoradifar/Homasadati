// @vitest-environment node
import { afterAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const dir = mkdtempSync(join(tmpdir(), "homa-paymig-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("upgrades an existing database so orders and checkouts accept Bale, keeping every row", async () => {
  process.env.DATABASE_PATH = join(dir, "db.sqlite");
  let schema = await import("./schema");
  const db = schema.platformDb();
  // Turn it into a database from before Bale: the old CHECK on both tables.
  db.pragma("foreign_keys = OFF");
  for (const table of ["p_checkouts", "p_orders"]) {
    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(table) as { sql: string }).sql;
    db.exec(sql.replace(table, table + "_old").replace(",'company_credit'", "").replace(",'bale'", "").replace(",'zibal'", ""));
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
  for (const table of ["p_checkouts", "p_orders"])
    expect(schema.one("SELECT sql FROM sqlite_master WHERE name=?", table)!.sql).toContain("'wallet','zarinpal','zibal','bale'");
  expect(schema.one("SELECT method FROM p_checkouts WHERE id='c1'")!.method).toBe("zarinpal");
  schema.run("UPDATE p_checkouts SET method='bale' WHERE id='c1'");
  expect(schema.one("SELECT version FROM p_migrations WHERE version=21")).toBeTruthy();
  expect((upgraded.pragma("foreign_key_check") as unknown[]).length).toBe(0);
  upgraded.close();
});
