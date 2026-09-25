import type Database from "better-sqlite3";
// The eighth (Aria) card needs card levels and desk numbers up to 8. SQLite
// cannot change a CHECK in place, so each affected table is rebuilt once with
// the same rows, as in migrate-leather.
const tables = ["p_card_members", "p_card_desks"];
export function migrateCardLevels(d: Database.Database) {
  const read = (table: string) =>
    d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as { sql: string } | undefined;
  const stale = (table: string) => !!read(table)?.sql.match(/BETWEEN [01] AND 7\b/);
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
            .replace(/BETWEEN ([01]) AND 7\b/g, "BETWEEN $1 AND 8"),
        );
        d.exec(`INSERT INTO ${table}_v2 SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_v2 RENAME TO ${table};`);
        extras.forEach((x) => d.exec(x.sql));
      }
      if ((d.pragma("foreign_key_check") as unknown[]).length)
        throw new Error("Foreign key check failed during card level migration");
      d.exec("INSERT OR IGNORE INTO p_migrations VALUES(19,datetime('now'))");
    }).immediate();
  } finally {
    d.pragma("foreign_keys = ON");
  }
}
