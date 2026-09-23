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
  CREATE TABLE IF NOT EXISTS p_member_details(user_id TEXT PRIMARY KEY REFERENCES p_users(id),details TEXT NOT NULL,contact_verified_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_consents(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),version TEXT NOT NULL,terms INTEGER NOT NULL CHECK(terms=1),privacy INTEGER NOT NULL CHECK(privacy=1),adult INTEGER NOT NULL CHECK(adult=1),marketing INTEGER NOT NULL CHECK(marketing IN(0,1)),accepted_at TEXT NOT NULL);
  CREATE TRIGGER IF NOT EXISTS p_consents_no_update BEFORE UPDATE ON p_consents BEGIN SELECT RAISE(ABORT,'immutable consent'); END;
  CREATE TRIGGER IF NOT EXISTS p_consents_no_delete BEFORE DELETE ON p_consents BEGIN SELECT RAISE(ABORT,'immutable consent'); END;
  INSERT OR IGNORE INTO p_migrations VALUES(4,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_travel_rules(rank_id TEXT PRIMARY KEY REFERENCES p_ranks(id),amount INTEGER NOT NULL CHECK(amount>0),valid_days INTEGER NOT NULL CHECK(valid_days>=8),active INTEGER NOT NULL CHECK(active IN(0,1)),updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_travel_cards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),rank_id TEXT NOT NULL REFERENCES p_ranks(id),holder_name TEXT NOT NULL,rank_name TEXT NOT NULL,issued INTEGER NOT NULL,available INTEGER NOT NULL CHECK(available>=0),reserved INTEGER NOT NULL CHECK(reserved>=0),spent INTEGER NOT NULL CHECK(spent>=0),personal_threshold INTEGER NOT NULL,group_threshold INTEGER NOT NULL,qualifying_order TEXT NOT NULL REFERENCES p_orders(id),issued_at TEXT NOT NULL,expires_on TEXT NOT NULL,UNIQUE(user_id,rank_id),CHECK(issued=available+reserved+spent));
  CREATE TABLE IF NOT EXISTS p_travel_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),card_id TEXT NOT NULL REFERENCES p_travel_cards(id),product_id TEXT NOT NULL REFERENCES p_products(id),title TEXT NOT NULL,travel_date TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),quoted_total INTEGER NOT NULL CHECK(quoted_total>=amount),status TEXT NOT NULL CHECK(status IN('requested','approved','rejected','redeemed','cancelled')),note TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,idem_key TEXT NOT NULL,payload TEXT NOT NULL,calendar TEXT NOT NULL,decision_reason TEXT NOT NULL DEFAULT '',UNIQUE(user_id,idem_key));
  CREATE INDEX IF NOT EXISTS p_travel_request_user ON p_travel_requests(user_id,created_at);
  INSERT OR IGNORE INTO p_migrations VALUES(5,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_travel_presets(level INTEGER PRIMARY KEY,name TEXT NOT NULL,personal_threshold INTEGER NOT NULL,credit INTEGER NOT NULL,valid_days INTEGER NOT NULL,tone TEXT NOT NULL,rank_id TEXT REFERENCES p_ranks(id));
  INSERT OR IGNORE INTO p_travel_presets VALUES
  (1,'جوانه',5000000,100000,365,'jade',NULL),
  (2,'سرو',15000000,300000,365,'forest',NULL),
  (3,'فیروزه',30000000,600000,365,'turquoise',NULL),
  (4,'یاقوت',60000000,1200000,365,'ruby',NULL),
  (5,'زمرد',120000000,2400000,365,'emerald',NULL),
  (6,'پارسه',250000000,5000000,365,'gold',NULL),
  (7,'سیمرغ',500000000,10000000,365,'obsidian',NULL);
  INSERT OR IGNORE INTO p_migrations VALUES(6,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_enrollments(token_hash TEXT PRIMARY KEY,target TEXT NOT NULL,secret TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS p_enrollment_target ON p_enrollments(target);
  CREATE TABLE IF NOT EXISTS p_recovery_codes(user_id TEXT NOT NULL REFERENCES p_users(id),code_hash TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,code_hash));
  CREATE TABLE IF NOT EXISTS p_totp_setups(user_id TEXT PRIMARY KEY REFERENCES p_users(id),expires INTEGER NOT NULL);
  INSERT OR IGNORE INTO p_migrations VALUES(7,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_google_identities(subject TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES p_users(id),created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_google_challenges(token_hash TEXT PRIMARY KEY,nonce TEXT NOT NULL,intent TEXT NOT NULL,user_id TEXT,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS p_google_enrollments(token_hash TEXT PRIMARY KEY REFERENCES p_enrollments(token_hash) ON DELETE CASCADE,subject TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_google_logins(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS p_service_events(id INTEGER PRIMARY KEY AUTOINCREMENT,area TEXT NOT NULL,code TEXT NOT NULL,created_at TEXT NOT NULL);
  INSERT OR IGNORE INTO p_migrations VALUES(8,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_merchants(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,city TEXT NOT NULL,address TEXT NOT NULL,phone TEXT NOT NULL,website TEXT NOT NULL,description TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_merchants_public ON p_merchants(active,city,category);
  CREATE TABLE IF NOT EXISTS p_points_ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),delta INTEGER NOT NULL CHECK(delta!=0),kind TEXT NOT NULL,reference TEXT NOT NULL,event_key TEXT NOT NULL UNIQUE,reason TEXT NOT NULL,actor_id TEXT REFERENCES p_users(id),created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_points_user ON p_points_ledger(user_id,created_at);
  CREATE TRIGGER IF NOT EXISTS p_points_no_update BEFORE UPDATE ON p_points_ledger BEGIN SELECT RAISE(ABORT,'immutable points ledger'); END;
  CREATE TRIGGER IF NOT EXISTS p_points_no_delete BEFORE DELETE ON p_points_ledger BEGIN SELECT RAISE(ABORT,'immutable points ledger'); END;
  CREATE TABLE IF NOT EXISTS p_rewards(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,points INTEGER NOT NULL CHECK(points>0),stock INTEGER NOT NULL CHECK(stock>=0),active INTEGER NOT NULL CHECK(active IN(0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_redemptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),reward_id TEXT NOT NULL REFERENCES p_rewards(id),title TEXT NOT NULL,points INTEGER NOT NULL CHECK(points>0),status TEXT NOT NULL CHECK(status IN('requested','fulfilled','cancelled')),idem_key TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,reason TEXT NOT NULL,UNIQUE(user_id,idem_key));
  CREATE INDEX IF NOT EXISTS p_redemptions_user ON p_redemptions(user_id,created_at);
  CREATE INDEX IF NOT EXISTS p_binary_user ON p_binary_lots(user_id,created_at);
  INSERT OR IGNORE INTO p_migrations VALUES(9,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_binary_lot_terms(lot_id TEXT PRIMARY KEY REFERENCES p_binary_lots(id),expires_at TEXT);
  CREATE TABLE IF NOT EXISTS p_binary_match_terms(match_id TEXT PRIMARY KEY REFERENCES p_binary_matches(id),left_volume INTEGER NOT NULL,right_volume INTEGER NOT NULL,rules TEXT NOT NULL,period TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_binary_match_allocations(match_id TEXT NOT NULL REFERENCES p_binary_matches(id),lot_id TEXT NOT NULL REFERENCES p_binary_lots(id),volume INTEGER NOT NULL CHECK(volume>0),PRIMARY KEY(match_id,lot_id));
  CREATE INDEX IF NOT EXISTS p_binary_allocations_lot ON p_binary_match_allocations(lot_id);

  CREATE TABLE IF NOT EXISTS p_points_lots(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),entry_id TEXT,remaining INTEGER NOT NULL CHECK(remaining>=0),expires_at TEXT,created_at TEXT NOT NULL,origin_entry TEXT);
  CREATE INDEX IF NOT EXISTS p_points_lots_user ON p_points_lots(user_id,expires_at);
  CREATE TABLE IF NOT EXISTS p_points_initialized(user_id TEXT PRIMARY KEY REFERENCES p_users(id));
  CREATE TABLE IF NOT EXISTS p_points_allocations(entry_id TEXT NOT NULL REFERENCES p_points_ledger(id),lot_id TEXT NOT NULL REFERENCES p_points_lots(id),amount INTEGER NOT NULL CHECK(amount>0),PRIMARY KEY(entry_id,lot_id));
  CREATE TABLE IF NOT EXISTS p_loyalty_accruals(order_id TEXT PRIMARY KEY REFERENCES p_orders(id),user_id TEXT NOT NULL REFERENCES p_users(id),points INTEGER NOT NULL CHECK(points>0),available_at TEXT NOT NULL,expires_at TEXT,status TEXT NOT NULL CHECK(status IN('pending','earned','cancelled','reversed')));
  CREATE INDEX IF NOT EXISTS p_loyalty_pending ON p_loyalty_accruals(status,available_at);
  CREATE TABLE IF NOT EXISTS p_loyalty_levels(id TEXT PRIMARY KEY,name TEXT NOT NULL,threshold INTEGER NOT NULL UNIQUE CHECK(threshold>=0),benefits TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1)));
  CREATE TABLE IF NOT EXISTS p_access_roles(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,permissions TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1)),updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_access_assignments(user_id TEXT NOT NULL REFERENCES p_users(id),role_id TEXT NOT NULL REFERENCES p_access_roles(id),created_at TEXT NOT NULL,PRIMARY KEY(user_id,role_id));
  CREATE TABLE IF NOT EXISTS p_merchant_contracts(merchant_id TEXT PRIMARY KEY REFERENCES p_merchants(id),owner_id TEXT NOT NULL REFERENCES p_users(id),share_bps INTEGER NOT NULL CHECK(share_bps BETWEEN 0 AND 10000),reference TEXT NOT NULL,starts_on TEXT NOT NULL,ends_on TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1)),updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_product_merchants(product_id TEXT PRIMARY KEY REFERENCES p_products(id) ON DELETE CASCADE,merchant_id TEXT NOT NULL REFERENCES p_merchants(id));
  CREATE TABLE IF NOT EXISTS p_merchant_sales(order_id TEXT PRIMARY KEY REFERENCES p_orders(id),merchant_id TEXT NOT NULL REFERENCES p_merchants(id),amount INTEGER NOT NULL CHECK(amount>=0),contract_reference TEXT NOT NULL,available_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('pending','available','reversed')));
  CREATE TABLE IF NOT EXISTS p_merchant_ledger(id TEXT PRIMARY KEY,merchant_id TEXT NOT NULL REFERENCES p_merchants(id),amount INTEGER NOT NULL,event_key TEXT NOT NULL UNIQUE,reference TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_merchant_ledger_owner ON p_merchant_ledger(merchant_id,created_at);
  CREATE TRIGGER IF NOT EXISTS p_merchant_no_update BEFORE UPDATE ON p_merchant_ledger BEGIN SELECT RAISE(ABORT,'immutable merchant ledger'); END;
  CREATE TRIGGER IF NOT EXISTS p_merchant_no_delete BEFORE DELETE ON p_merchant_ledger BEGIN SELECT RAISE(ABORT,'immutable merchant ledger'); END;
  CREATE TABLE IF NOT EXISTS p_merchant_payments(id TEXT PRIMARY KEY,merchant_id TEXT NOT NULL REFERENCES p_merchants(id),amount INTEGER NOT NULL CHECK(amount>0),bank_reference TEXT NOT NULL UNIQUE,idem_key TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES p_users(id),reason TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_announcements(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES p_users(id),payload TEXT NOT NULL,created_at TEXT NOT NULL);
  INSERT OR IGNORE INTO p_migrations VALUES(10,datetime('now'));

  CREATE TABLE IF NOT EXISTS p_tickets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),subject TEXT NOT NULL,category TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('waiting_support','waiting_user','closed')),order_id TEXT REFERENCES p_orders(id),assignee_id TEXT REFERENCES p_users(id),version INTEGER NOT NULL DEFAULT 1,idem_key TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,idem_key));
  CREATE INDEX IF NOT EXISTS p_tickets_owner ON p_tickets(user_id,updated_at);
  CREATE INDEX IF NOT EXISTS p_tickets_queue ON p_tickets(status,updated_at);
  CREATE TABLE IF NOT EXISTS p_ticket_messages(id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL REFERENCES p_tickets(id),actor_id TEXT NOT NULL REFERENCES p_users(id),body TEXT NOT NULL,internal INTEGER NOT NULL CHECK(internal IN(0,1)),idem_key TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(ticket_id,actor_id,idem_key));
  CREATE INDEX IF NOT EXISTS p_ticket_messages_thread ON p_ticket_messages(ticket_id,created_at);
  CREATE TABLE IF NOT EXISTS p_withdrawal_reviews(withdrawal_id TEXT PRIMARY KEY REFERENCES p_withdrawals(id),first_actor TEXT NOT NULL REFERENCES p_users(id),approved_at TEXT NOT NULL,second_actor TEXT REFERENCES p_users(id),paid_at TEXT);
  CREATE TABLE IF NOT EXISTS p_merchant_payment_reviews(id TEXT PRIMARY KEY,merchant_id TEXT NOT NULL REFERENCES p_merchants(id),owner_id TEXT NOT NULL REFERENCES p_users(id),amount INTEGER NOT NULL CHECK(amount>0),bank_reference TEXT NOT NULL,idem_key TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,first_actor TEXT NOT NULL REFERENCES p_users(id),second_actor TEXT REFERENCES p_users(id),status TEXT NOT NULL CHECK(status IN ('pending','confirmed','rejected')),reason TEXT NOT NULL,review_reason TEXT NOT NULL DEFAULT '',payment_id TEXT REFERENCES p_merchant_payments(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS p_merchant_review_reference ON p_merchant_payment_reviews(bank_reference) WHERE status!='rejected';
  CREATE TABLE IF NOT EXISTS p_binary_scheduled_orders(order_id TEXT PRIMARY KEY REFERENCES p_orders(id),schedule TEXT NOT NULL,paid_at TEXT NOT NULL,last_cycle TEXT);
  CREATE TABLE IF NOT EXISTS p_binary_order_cycles(order_id TEXT NOT NULL REFERENCES p_orders(id),cycle_key TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>=0),matches INTEGER NOT NULL CHECK(matches>=0),created_at TEXT NOT NULL,PRIMARY KEY(order_id,cycle_key));
  INSERT OR IGNORE INTO p_migrations VALUES(11,datetime('now'));

  CREATE TABLE IF NOT EXISTS p_card_orders(order_id TEXT PRIMARY KEY REFERENCES p_orders(id),user_id TEXT NOT NULL REFERENCES p_users(id),amount INTEGER NOT NULL CHECK(amount>0),counted_cutoff TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_card_orders_user ON p_card_orders(user_id);
  CREATE TABLE IF NOT EXISTS p_card_members(user_id TEXT PRIMARY KEY REFERENCES p_users(id),total INTEGER NOT NULL CHECK(total>=0),level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 7),desks INTEGER NOT NULL CHECK(desks BETWEEN 0 AND 7),updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_card_lots(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES p_orders(id),user_id TEXT NOT NULL REFERENCES p_users(id),leg TEXT NOT NULL CHECK(leg IN ('left','right')),volume INTEGER NOT NULL CHECK(volume>0),remaining INTEGER NOT NULL CHECK(remaining>=0),void INTEGER NOT NULL DEFAULT 0 CHECK(void IN (0,1)),created_at TEXT NOT NULL,UNIQUE(order_id,user_id));
  CREATE INDEX IF NOT EXISTS p_card_lots_pool ON p_card_lots(user_id,leg,void,remaining);
  CREATE TABLE IF NOT EXISTS p_card_desks(user_id TEXT NOT NULL REFERENCES p_users(id),desk INTEGER NOT NULL CHECK(desk BETWEEN 1 AND 7),matches INTEGER NOT NULL CHECK(matches>=0),PRIMARY KEY(user_id,desk));
  CREATE TABLE IF NOT EXISTS p_card_matches(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),desk INTEGER NOT NULL,week TEXT NOT NULL,sequence INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('cash','voucher')),amount INTEGER NOT NULL CHECK(amount>0),void INTEGER NOT NULL DEFAULT 0 CHECK(void IN (0,1)),created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_card_matches_user ON p_card_matches(user_id,week);
  CREATE TABLE IF NOT EXISTS p_card_match_allocations(match_id TEXT NOT NULL REFERENCES p_card_matches(id),lot_id TEXT NOT NULL REFERENCES p_card_lots(id),volume INTEGER NOT NULL CHECK(volume>0),PRIMARY KEY(match_id,lot_id));
  CREATE INDEX IF NOT EXISTS p_card_allocations_lot ON p_card_match_allocations(lot_id);
  CREATE TABLE IF NOT EXISTS p_card_weeks(week TEXT PRIMARY KEY,cutoff TEXT NOT NULL,sales INTEGER NOT NULL,budget INTEGER NOT NULL,matches INTEGER NOT NULL,cash INTEGER NOT NULL,voucher INTEGER NOT NULL,settled_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS p_card_voucher_ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),event_key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,amount INTEGER NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_card_voucher_user ON p_card_voucher_ledger(user_id,created_at);
  CREATE TRIGGER IF NOT EXISTS p_card_voucher_no_update BEFORE UPDATE ON p_card_voucher_ledger BEGIN SELECT RAISE(ABORT,'immutable voucher ledger'); END;
  CREATE TRIGGER IF NOT EXISTS p_card_voucher_no_delete BEFORE DELETE ON p_card_voucher_ledger BEGIN SELECT RAISE(ABORT,'immutable voucher ledger'); END;
  CREATE TABLE IF NOT EXISTS p_card_cashbacks(order_id TEXT PRIMARY KEY REFERENCES p_orders(id),user_id TEXT NOT NULL REFERENCES p_users(id),amount INTEGER NOT NULL CHECK(amount>0),reversed INTEGER NOT NULL DEFAULT 0 CHECK(reversed IN (0,1)),created_at TEXT NOT NULL);
  INSERT OR IGNORE INTO p_migrations VALUES(12,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_card_payouts(id TEXT PRIMARY KEY,match_id TEXT NOT NULL REFERENCES p_card_matches(id),user_id TEXT NOT NULL REFERENCES p_users(id),week TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('cash','voucher')),amount INTEGER NOT NULL CHECK(amount>0),created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_card_payouts_match ON p_card_payouts(match_id);
  CREATE TABLE IF NOT EXISTS p_order_vouchers(order_id TEXT PRIMARY KEY REFERENCES p_orders(id),user_id TEXT NOT NULL REFERENCES p_users(id),amount INTEGER NOT NULL CHECK(amount>0),created_at TEXT NOT NULL);
  INSERT OR IGNORE INTO p_migrations VALUES(13,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_payout_profiles(user_id TEXT PRIMARY KEY REFERENCES p_users(id),data TEXT NOT NULL,national_hash TEXT NOT NULL UNIQUE,iban_last4 TEXT NOT NULL,card_last4 TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','verified','rejected')),reason TEXT NOT NULL DEFAULT '',reviewed_by TEXT REFERENCES p_users(id),reviewed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_payout_profiles_status ON p_payout_profiles(status,updated_at);
  INSERT OR IGNORE INTO p_migrations VALUES(14,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_referral_aliases(code TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES p_users(id),retired_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_referral_aliases_user ON p_referral_aliases(user_id,retired_at);
  INSERT OR IGNORE INTO p_migrations VALUES(15,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_wishlist(user_id TEXT NOT NULL REFERENCES p_users(id),product_id TEXT NOT NULL REFERENCES p_products(id),created_at TEXT NOT NULL,PRIMARY KEY(user_id,product_id));
  INSERT OR IGNORE INTO p_migrations VALUES(16,datetime('now'));
  CREATE TABLE IF NOT EXISTS p_gateway_transactions(id TEXT PRIMARY KEY,gateway TEXT NOT NULL,authority TEXT UNIQUE,ref_kind TEXT NOT NULL CHECK(ref_kind IN ('order','checkout')),ref_id TEXT NOT NULL,user_id TEXT REFERENCES p_users(id),amount INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('requested','request_failed','paid','failed','cancelled')),bank_reference TEXT,card_pan TEXT,fee INTEGER,code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS p_gateway_transactions_user ON p_gateway_transactions(user_id,created_at);
  CREATE INDEX IF NOT EXISTS p_gateway_transactions_status ON p_gateway_transactions(status,created_at);
  INSERT OR IGNORE INTO p_migrations VALUES(17,datetime('now'));

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
