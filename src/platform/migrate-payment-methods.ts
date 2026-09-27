import type Database from "better-sqlite3";
// Bale joins wallet and Zarinpal as a payment method. SQLite cannot change a
// CHECK in place, so p_checkouts and p_orders are each rebuilt once with the
// same rows, as in migrate-card-levels. Runs only on databases created before
// the change; fresh databases get the new CHECK from schema.ts.
const tables = ["p_checkouts", "p_orders"];
const OLD = /IN \('wallet','zarinpal'\)/;
export function migratePaymentMethods(d: Database.Database) {
  const read = (table: string) =>
    d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as { sql: string } | undefined;
  const stale = (table: string) => OLD.test(read(table)?.sql || "");
  if (!tables.some(stale)) return;
  d.pragma("foreign_keys = OFF");
  try {
    d.transaction(() => {
      for (const table of tables) {
        if (!stale(table)) continue;
        const extras = d
          .prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL")
          .all(table) as { sql: string }[];
        d.exec(
          read(table)!
            .sql.replace(new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?["\`]?${table}["\`]?`, "i"), `CREATE TABLE ${table}_v2`)
            .replace(new RegExp(OLD.source, "g"), "IN ('wallet','zarinpal','bale')"),
        );
        d.exec(`INSERT INTO ${table}_v2 SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_v2 RENAME TO ${table};`);
        extras.forEach((x) => d.exec(x.sql));
      }
      if ((d.pragma("foreign_key_check") as unknown[]).length)
        throw new Error("Foreign key check failed during payment method migration");
      d.exec("INSERT OR IGNORE INTO p_migrations VALUES(21,datetime('now'))");
    }).immediate();
  } finally {
    d.pragma("foreign_keys = ON");
  }
}
