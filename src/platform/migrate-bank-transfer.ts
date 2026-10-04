import type Database from "better-sqlite3";
/** Rebuild only the CHECK constraints; preserve every row, index and trigger. */
export function migrateBankTransfer(d: Database.Database) {
  const tables = ["p_orders", "p_checkouts"];
  const schema = (name: string) => d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name) as {sql:string}|undefined;
  if (!tables.some(name => {const s=schema(name); return s && !s.sql.includes("'bank_transfer'");})) return;
  d.pragma("foreign_keys=OFF");
  try {
    d.transaction(() => {
      for (const name of tables) {
        const s=schema(name); if (!s || s.sql.includes("'bank_transfer'")) continue;
        const extras=d.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL").all(name) as {sql:string}[];
        const next=name+"_bank_v9";
        const sql=s.sql.replace(new RegExp('CREATE TABLE\\s+["`]?'+name+'["`]?', 'i'), "CREATE TABLE "+next)
          .replace(/'wallet'\s*,\s*'zarinpal'/g, "'wallet','zarinpal','bank_transfer'");
        if (!sql.includes("'bank_transfer'")) throw new Error("Unknown payment schema");
        d.exec(sql);
        d.exec(`INSERT INTO ${next} SELECT * FROM ${name}; DROP TABLE ${name}; ALTER TABLE ${next} RENAME TO ${name};`);
        extras.forEach(x=>d.exec(x.sql));
      }
      if ((d.pragma("foreign_key_check") as unknown[]).length) throw new Error("Bank migration foreign key check failed");
    }).immediate();
  } finally { d.pragma("foreign_keys=ON"); }
}
