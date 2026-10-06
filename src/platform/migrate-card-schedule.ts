import type Database from "better-sqlite3";
export function migrateCardSchedule(d: Database.Database) {
  d.exec(`CREATE TABLE IF NOT EXISTS p_card_due(
    match_id TEXT PRIMARY KEY REFERENCES p_card_matches(id),user_id TEXT NOT NULL REFERENCES p_users(id),
    kind TEXT NOT NULL CHECK(kind IN ('cash','voucher')),amount INTEGER NOT NULL CHECK(amount>0),
    release_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','released','cancelled')));
    CREATE INDEX IF NOT EXISTS p_card_due_release ON p_card_due(status,release_at);
    CREATE TABLE IF NOT EXISTS p_card_flush(match_id TEXT PRIMARY KEY REFERENCES p_card_matches(id),
      amount INTEGER NOT NULL CHECK(amount>0),reason TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS p_payout_ownership(user_id TEXT PRIMARY KEY REFERENCES p_users(id),reference TEXT NOT NULL,iban_hash TEXT NOT NULL,reviewed_by TEXT NOT NULL REFERENCES p_users(id),reviewed_at TEXT NOT NULL);
    INSERT OR IGNORE INTO p_migrations VALUES(22,datetime('now'));`);
}
