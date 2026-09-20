import Database from 'better-sqlite3';
import {mkdirSync, chmodSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
let connection: Database.Database | undefined;
export function db() {
 if(connection) return connection;
 const path=resolve(process.env.DATABASE_PATH || './data/homay.sqlite');
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 connection=new Database(path); chmodSync(path,0o600);
 connection.pragma('journal_mode = WAL'); connection.pragma('busy_timeout = 5000');
 connection.exec(`CREATE TABLE IF NOT EXISTS requests (
 id TEXT PRIMARY KEY, idem_hash TEXT UNIQUE NOT NULL, payload_hash TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('enquiry','club')), name TEXT NOT NULL, email TEXT NOT NULL,
 interest TEXT NOT NULL, message TEXT NOT NULL, locale TEXT NOT NULL, currency TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','closed')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS subscribers (
 id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, locale TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','unsubscribed')),
 unsubscribe_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS requests_created ON requests(created_at);
 CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);`);
 return connection;
}
