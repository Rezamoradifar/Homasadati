import type Database from "better-sqlite3";

/** Add DigiPay to existing payment-method CHECK constraints without losing rows. */
export function migrateDigipay(d: Database.Database) {
  const tables = ["p_orders", "p_checkouts"];
  const schema = (name: string) =>
    d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name) as { sql: string } | undefined;
  const pending = tables.filter((name) => {
    const current = schema(name)?.sql || "";
    return current && !current.includes("'digipay'");
  });
  if (!pending.length) return;

  d.pragma("foreign_keys=OFF");
  try {
    d.transaction(() => {
      for (const name of pending) {
        const current = schema(name);
        if (!current || current.sql.includes("'digipay'")) continue;
        const extras = d.prepare(
          "SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL",
        ).all(name) as { sql: string }[];
        const temporary = name + "_digipay_v10";
        const nextSql = current.sql
          .replace(new RegExp("CREATE TABLE\\s+[\"\x60]?" + name + "[\"\x60]?", "i"), "CREATE TABLE " + temporary)
          .replace(/'wallet'\s*,\s*'zarinpal'\s*,\s*'bank_transfer'/g, "'wallet','zarinpal','bank_transfer','digipay'");
        if (!nextSql.includes("'digipay'")) throw new Error("Unknown payment schema for " + name);
        d.exec(nextSql);
        d.exec(`INSERT INTO ${temporary} SELECT * FROM ${name}; DROP TABLE ${name}; ALTER TABLE ${temporary} RENAME TO ${name};`);
        extras.forEach((entry) => d.exec(entry.sql));
      }
      for (const name of tables) {\n        const columns = d.pragma("table_info(" + name + ")") as { name: string }[];\n        if (columns.length && !columns.some((column) => column.name === "provider_url")) {\n          d.exec("ALTER TABLE " + name + " ADD COLUMN provider_url TEXT");\n        }\n      }\n      if ((d.pragma("foreign_key_check") as unknown[]).length) {
        throw new Error("DigiPay migration foreign key check failed");
      }
    }).immediate();
  } finally {
    d.pragma("foreign_keys=ON");
  }
}
