import type Database from "better-sqlite3";
/** Rebuild only the CHECK constraints; preserve every row, index and trigger. */
export function migrateZibal(d: Database.Database) {
  const tables = ["p_orders", "p_checkouts"];
  const schema = (name: string) =>
    d
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(name) as { sql: string } | undefined;
  if (
    !tables.some((name) => {
      const s = schema(name);
      return s && !s.sql.includes("'zibal'");
    })
  )
    return;
  d.pragma("foreign_keys=OFF");
  try {
    d.transaction(() => {
      for (const name of tables) {
        const s = schema(name);
        if (!s || s.sql.includes("'zibal'")) continue;
        const extras = d
          .prepare(
            "SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL",
          )
          .all(name) as { sql: string }[];
        const next = name + "_zibal_v10";
        const sql = s.sql
          .replace(
            new RegExp('CREATE TABLE\\s+["`]?' + name + '["`]?', "i"),
            "CREATE TABLE " + next,
          )
          .replace(/'wallet'\s*,\s*'zarinpal'/g, "'wallet','zarinpal','zibal'");
        if (!sql.includes("'zibal'")) throw new Error("Unknown payment schema");
        d.exec(sql);
        d.exec(
          `INSERT INTO ${next} SELECT * FROM ${name}; DROP TABLE ${name}; ALTER TABLE ${next} RENAME TO ${name};`,
        );
        extras.forEach((x) => d.exec(x.sql));
      }
      if ((d.pragma("foreign_key_check") as unknown[]).length)
        throw new Error("Zibal migration foreign key check failed");
    }).immediate();
  } finally {
    d.pragma("foreign_keys=ON");
  }
}
