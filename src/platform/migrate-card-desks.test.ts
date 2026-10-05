// @vitest-environment node
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { migrateCardDesks } from "./migrate-card-desks";

it("limits active slots to seven while preserving settled rewards and old desk history", () => {
  const d = new Database(":memory:");
  try {
    d.exec(`CREATE TABLE p_migrations(version INTEGER PRIMARY KEY, applied_at TEXT);
      CREATE TABLE p_card_members(user_id TEXT PRIMARY KEY,total INTEGER,level INTEGER,desks INTEGER,updated_at TEXT);
      CREATE TABLE p_card_desks(user_id TEXT,desk INTEGER,matches INTEGER);
      CREATE TABLE p_card_payouts(id TEXT,amount INTEGER);
      INSERT INTO p_card_members VALUES('a',100000000,8,8,'old'),('b',25000000,2,2,'old');
      INSERT INTO p_card_desks VALUES('a',8,17);
      INSERT INTO p_card_payouts VALUES('historic',5400000);`);
    migrateCardDesks(d);
    expect(d.prepare("SELECT desks FROM p_card_members ORDER BY user_id").all()).toEqual([{ desks: 7 }, { desks: 2 }]);
    expect(d.prepare("SELECT * FROM p_card_desks").get()).toEqual({ user_id: "a", desk: 8, matches: 17 });
    expect(d.prepare("SELECT amount FROM p_card_payouts").get()).toEqual({ amount: 5400000 });
    migrateCardDesks(d);
    expect(d.prepare("SELECT COUNT(*) n FROM p_migrations").get()).toEqual({ n: 1 });
  } finally { d.close(); }
});
