import type Database from "better-sqlite3";

/** Seven fixed slots; preserve historical desk counters, matches and payouts. */
export function migrateCardDesks(d: Database.Database) {
  if (d.prepare("SELECT 1 FROM p_migrations WHERE version=21").get()) return;
  d.transaction(() => {
    d.exec("UPDATE p_card_members SET desks=MIN(7,CAST(total/10000000 AS INTEGER))");
    d.exec("INSERT INTO p_migrations VALUES(21,datetime('now'))");
  }).immediate();
}
