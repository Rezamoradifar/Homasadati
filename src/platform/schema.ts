import { migrateLeather } from "./migrate-leather";
import { db } from "../server/db";
let ready: object | undefined;
export function platformDb() {
  const d = db();
  if (ready === d) return d;
  migrateLeather(d);
  d.pragma("foreign_keys = ON");
  d.exec(`
  CREATE TABLE IF NOT EXISTS p_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_users(
    id TEXT PRIMARY KEY, email TEXT UNIQUE, phone TEXT UNIQUE, name TEXT NOT NULL,
    password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','superadmin','content','support','finance')),
    blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)), referral_code TEXT UNIQUE NOT NULL,
    sponsor_id TEXT REFERENCES p_users(id), parent_id TEXT REFERENCES p_users(id), leg TEXT CHECK(leg IN ('left','right')),
    preferences TEXT NOT NULL DEFAULT '{"email":true,"sms":false,"inApp":true}',
    otp_secret TEXT, otp_pending TEXT, otp_last INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, last_seen TEXT NOT NULL, signup_ip TEXT NOT NULL,
    UNIQUE(parent_id,leg), CHECK(id!=sponsor_id), CHECK(id!=parent_id),
    CHECK((parent_id IS NULL AND leg IS NULL) OR (parent_id IS NOT NULL AND leg IS NOT NULL)));
  CREATE INDEX IF NOT EXISTS p_users_sponsor ON p_users(sponsor_id);
  CREATE TABLE IF NOT EXISTS p_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),expires INTEGER NOT NULL,created_at TEXT NOT NULL,agent TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_session_user ON p_sessions(user_id);
  CREATE TABLE IF NOT EXISTS p_otp(id TEXT PRIMARY KEY,target TEXT NOT NULL,purpose TEXT NOT NULL,code_hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,secret INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_wallets(user_id TEXT PRIMARY KEY REFERENCES p_users(id),available INTEGER NOT NULL DEFAULT 0 CHECK(available>=0),pending INTEGER NOT NULL DEFAULT 0 CHECK(pending>=0),held INTEGER NOT NULL DEFAULT 0 CHECK(held>=0),debt INTEGER NOT NULL DEFAULT 0 CHECK(debt>=0));
  CREATE TABLE IF NOT EXISTS p_ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),event_key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,available_delta INTEGER NOT NULL,pending_delta INTEGER NOT NULL,held_delta INTEGER NOT NULL,debt_delta INTEGER NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TRIGGER IF NOT EXISTS p_ledger_no_update BEFORE UPDATE ON p_ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
  CREATE TRIGGER IF NOT EXISTS p_ledger_no_delete BEFORE DELETE ON p_ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
  CREATE TABLE IF NOT EXISTS p_categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('category','tag')),vertical TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_products(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,vertical TEXT NOT NULL CHECK(vertical IN ('tourism','beauty','craft','ai','leather')),subtype TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),stock INTEGER NOT NULL CHECK(stock>=0),images TEXT NOT NULL DEFAULT '[]',taxonomy TEXT NOT NULL DEFAULT '[]',published INTEGER NOT NULL DEFAULT 0,duration_days INTEGER NOT NULL DEFAULT 30 CHECK(duration_days>0),cancel_hours INTEGER NOT NULL DEFAULT 24 CHECK(cancel_hours>=0),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),product_id TEXT NOT NULL REFERENCES p_products(id),title TEXT NOT NULL,vertical TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),unit_price INTEGER NOT NULL CHECK(unit_price>0),amount INTEGER NOT NULL CHECK(amount>0),status TEXT NOT NULL CHECK(status IN ('pending','processing','shipped','delivered','cancelled','refunded')),payment_method TEXT NOT NULL CHECK(payment_method IN ('wallet','zarinpal')),payment_ref TEXT UNIQUE,authority TEXT UNIQUE,checkout_claim TEXT,policy TEXT NOT NULL,cancel_until TEXT,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,paid_at TEXT,refunded_at TEXT,idem_key TEXT NOT NULL,UNIQUE(user_id,idem_key));
  CREATE INDEX IF NOT EXISTS p_orders_user ON p_orders(user_id,created_at);
  CREATE TABLE IF NOT EXISTS p_ranks(id TEXT PRIMARY KEY,name TEXT NOT NULL,personal_threshold INTEGER NOT NULL CHECK(personal_threshold>=0),group_threshold INTEGER NOT NULL CHECK(group_threshold>=0),bonus_bps INTEGER NOT NULL CHECK(bonus_bps BETWEEN 0 AND 10000));
  CREATE TABLE IF NOT EXISTS p_commissions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),order_id TEXT NOT NULL REFERENCES p_orders(id),kind TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),status TEXT NOT NULL CHECK(status IN ('pending','available','reversed')),available_at TEXT NOT NULL,created_at TEXT NOT NULL,event_key TEXT UNIQUE NOT NULL);
  CREATE TABLE IF NOT EXISTS p_binary_lots(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES p_orders(id),user_id TEXT NOT NULL REFERENCES p_users(id),leg TEXT NOT NULL,volume INTEGER NOT NULL,remaining INTEGER NOT NULL CHECK(remaining>=0),void INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,UNIQUE(order_id,user_id));
  CREATE TABLE IF NOT EXISTS p_binary_matches(id TEXT PRIMARY KEY,left_lot TEXT NOT NULL REFERENCES p_binary_lots(id),right_lot TEXT NOT NULL REFERENCES p_binary_lots(id),volume INTEGER NOT NULL,commission_id TEXT NOT NULL REFERENCES p_commissions(id),void INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS p_withdrawals(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),amount INTEGER NOT NULL CHECK(amount>0),iban TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','paid')),reason TEXT NOT NULL DEFAULT '',bank_reference TEXT UNIQUE,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,idem_key TEXT NOT NULL,UNIQUE(user_id,idem_key));
  CREATE TABLE IF NOT EXISTS p_addresses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),label TEXT NOT NULL,country TEXT NOT NULL,city TEXT NOT NULL,postal_code TEXT NOT NULL,address TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_subscriptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),product_id TEXT NOT NULL REFERENCES p_products(id),order_id TEXT NOT NULL UNIQUE REFERENCES p_orders(id),starts_at TEXT NOT NULL,expires_at TEXT NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS p_notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),title TEXT NOT NULL,body TEXT NOT NULL,read_at TEXT,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_missions(id TEXT PRIMARY KEY,title TEXT NOT NULL,metric TEXT NOT NULL CHECK(metric IN ('personal_sales','group_sales','referrals','orders')),target INTEGER NOT NULL CHECK(target>0),active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS p_content(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('blog','banner','page')),slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,image TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_flags(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),kind TEXT NOT NULL,detail TEXT NOT NULL,resolved INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,UNIQUE(user_id,kind));
  CREATE TABLE IF NOT EXISTS p_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES p_users(id),action TEXT NOT NULL,entity_id TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TRIGGER IF NOT EXISTS p_audit_no_update BEFORE UPDATE ON p_audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
  CREATE TRIGGER IF NOT EXISTS p_audit_no_delete BEFORE DELETE ON p_audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
  CREATE INDEX IF NOT EXISTS p_order_sales ON p_orders(paid_at,user_id);
  CREATE INDEX IF NOT EXISTS p_commission_user ON p_commissions(user_id,created_at);
  CREATE INDEX IF NOT EXISTS p_commission_maturity ON p_commissions(status,available_at);
  CREATE INDEX IF NOT EXISTS p_ledger_user ON p_ledger(user_id,created_at);
  CREATE INDEX IF NOT EXISTS p_withdrawal_user ON p_withdrawals(user_id,status);
  CREATE TABLE IF NOT EXISTS p_outbox(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),channel TEXT NOT NULL,target TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_product_details(product_id TEXT PRIMARY KEY REFERENCES p_products(id) ON DELETE CASCADE, sku TEXT UNIQUE, family TEXT NOT NULL DEFAULT '', details TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_product_family ON p_product_details(family);
  INSERT OR IGNORE INTO p_migrations VALUES(1,datetime('now'));
  INSERT OR IGNORE INTO p_migrations VALUES(2,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_checkouts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL CHECK(method IN ('wallet','zarinpal')),status TEXT NOT NULL CHECK(status IN ('pending','paid')),authority TEXT UNIQUE,claim TEXT,payment_ref TEXT UNIQUE,payload TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,idem_key TEXT NOT NULL,UNIQUE(user_id,idem_key));
  CREATE TABLE IF NOT EXISTS p_checkout_items(checkout_id TEXT NOT NULL REFERENCES p_checkouts(id),order_id TEXT NOT NULL UNIQUE REFERENCES p_orders(id),PRIMARY KEY(checkout_id,order_id));
  INSERT OR IGNORE INTO p_migrations VALUES(3,datetime('now'));
  `);
  ready = d;
  return d;
}
export type Row = Record<string, any>;
export const now = () => new Date().toISOString();
export const run = (sql: string, ...params: any[]) =>
  platformDb()
    .prepare(sql)
    .run(...params);
export const one = (sql: string, ...params: any[]) =>
  platformDb()
    .prepare(sql)
    .get(...params) as Row | undefined;
export const all = (sql: string, ...params: any[]) =>
  platformDb()
    .prepare(sql)
    .all(...params) as Row[];
export const atomic = <T>(fn: () => T) =>
  platformDb().transaction(fn).immediate();
