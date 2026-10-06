// @vitest-environment node
import Database from 'better-sqlite3';
import {expect,it} from 'vitest';
import {migrateCompanyCredit} from './migrate-company-credit';
it('preserves existing payment rows, foreign keys and indexes while allowing company credit',()=>{
 const d=new Database(':memory:');d.pragma('foreign_keys=ON');d.exec("CREATE TABLE p_orders(id TEXT PRIMARY KEY,payment_method TEXT CHECK(payment_method IN ('wallet','zarinpal','zibal','bale'))); CREATE INDEX order_method ON p_orders(payment_method); CREATE TABLE p_checkouts(id TEXT PRIMARY KEY,method TEXT CHECK(method IN ('wallet','zarinpal','zibal','bale'))); CREATE TABLE links(order_id TEXT REFERENCES p_orders(id)); INSERT INTO p_orders VALUES('old','zibal'); INSERT INTO links VALUES('old'); INSERT INTO p_checkouts VALUES('old','wallet');");
 migrateCompanyCredit(d);migrateCompanyCredit(d);expect(d.prepare('SELECT payment_method FROM p_orders WHERE id=?').get('old')).toEqual({payment_method:'zibal'});expect(d.pragma('foreign_key_check')).toEqual([]);expect(d.prepare("SELECT name FROM sqlite_master WHERE name='order_method'").get()).toBeTruthy();d.exec("INSERT INTO p_orders VALUES('new','company_credit');INSERT INTO p_checkouts VALUES('new','company_credit');");d.close();
});
