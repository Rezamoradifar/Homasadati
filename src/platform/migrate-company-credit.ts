import type Database from "better-sqlite3";
/** Rebuild only the CHECK constraints; preserve every row, index and trigger. */
export function migrateCompanyCredit(d: Database.Database) {
  const tables = ["p_orders", "p_checkouts"];
  const schema = (name: string) =>
    d
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(name) as { sql: string } | undefined;
  if (
    !tables.some((name) => {
      const s = schema(name);
      return s && !s.sql.includes("'company_credit'");
    })
  )
    return;
  d.pragma("foreign_keys=OFF");
  try {
    d.transaction(() => {
      for (const name of tables) {
        const s = schema(name);
        if (!s || s.sql.includes("'company_credit'")) continue;
        const extras = d
          .prepare(
            "SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL",
          )
          .all(name) as { sql: string }[];
        const next = name + "_company_credit_v1";
        const sql = s.sql
          .replace(
            new RegExp('CREATE TABLE\\s+["`]?' + name + '["`]?', "i"),
            "CREATE TABLE " + next,
          )
          .replace(/IN \(([^)]*'wallet'[^)]*)\)/g, "IN ($1,'company_credit')");
        if (!sql.includes("'company_credit'")) throw new Error("Unknown payment schema");
        d.exec(sql);
        d.exec(
          `INSERT INTO ${next} SELECT * FROM ${name}; DROP TABLE ${name}; ALTER TABLE ${next} RENAME TO ${name};`,
        );
        extras.forEach((x) => d.exec(x.sql));
      }
      if ((d.pragma("foreign_key_check") as unknown[]).length)
        throw new Error("Company credit migration foreign key check failed");
    }).immediate();
  } finally {
    d.pragma("foreign_keys=ON");
  }
}
