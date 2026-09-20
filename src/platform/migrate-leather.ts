import type Database from "better-sqlite3";
// SQLite's documented table-rebuild procedure preserves existing IDs, indexes and references.
export function migrateLeather(d: Database.Database) {
  const old = d
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='p_products'",
    )
    .get() as { sql: string } | undefined;
  if (!old || old.sql.includes("'leather'")) return;
  d.pragma("foreign_keys = OFF");
  try {
    d.transaction(() => {
      const schema = d
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='p_products'",
        )
        .get() as { sql: string };
      if (schema.sql.includes("'leather'")) return;
      const extras = d
        .prepare(
          "SELECT sql FROM sqlite_master WHERE tbl_name='p_products' AND type IN ('index','trigger') AND sql IS NOT NULL",
        )
        .all() as { sql: string }[];
      d.exec(
        schema.sql
          .replace(
            /CREATE TABLE\s+["`]?p_products["`]?/i,
            "CREATE TABLE p_products_v3",
          )
          .replace("'craft','ai'", "'craft','ai','leather'"),
      );
      d.exec(
        "INSERT INTO p_products_v3 SELECT * FROM p_products; DROP TABLE p_products; ALTER TABLE p_products_v3 RENAME TO p_products;",
      );
      extras.forEach((x) => d.exec(x.sql));
      if ((d.pragma("foreign_key_check") as unknown[]).length)
        throw new Error("Foreign key check failed during catalog migration");
    }).immediate();
  } finally {
    d.pragma("foreign_keys = ON");
  }
}
