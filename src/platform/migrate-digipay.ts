import type Database from "better-sqlite3";

/** SQLite CHECK constraints need a table rebuild. Preserve rows, foreign keys,
 * indexes and triggers, including installations with previous payment methods. */
export function migrateDigiPay(d: Database.Database) {
  const names = ["p_orders", "p_checkouts"];
  const read = (name: string) => d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { sql: string } | undefined;
  if (!names.some(name => read(name) && !read(name)!.sql.includes("'digipay'"))) return;
  const foreignKeys = d.pragma("foreign_keys", { simple: true });
  d.pragma("foreign_keys=OFF");
  try {
    d.transaction(() => {
      for (const name of names) {
        const old = read(name);
        if (!old || old.sql.includes("'digipay'")) continue;
        const extras = d.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL")
          .all(name) as { sql: string }[];
        const temporary = name + "_digipay_v1";
        const sql = old.sql
          .replace(new RegExp('CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?["`]?' + name + '["`]?', "i"), "CREATE TABLE " + temporary)
          .replace(/IN\s*\(([^)]*'wallet'[^)]*)\)/g, "IN ($1,'digipay')");
        if (!sql.includes("'digipay'")) throw new Error("Unrecognized payment method constraint");
        d.exec(sql);
        d.exec(`INSERT INTO ${temporary} SELECT * FROM ${name}; DROP TABLE ${name}; ALTER TABLE ${temporary} RENAME TO ${name};`);
        for (const extra of extras) d.exec(extra.sql);
      }
      if ((d.pragma("foreign_key_check") as unknown[]).length) throw new Error("DigiPay migration foreign key check failed");
    }).immediate();
  } finally {
    d.pragma(`foreign_keys=${foreignKeys ? "ON" : "OFF"}`);
  }
}
