import { mkdtempSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
// Recovery rehearsal only. Never writes to the application's configured database.
async function main() {
  const backup = process.argv[2];
  if (!backup)
    throw new Error(
      "Usage: npm run platform:restore-drill -- /absolute/backup/directory",
    );
  const source = resolve(backup),
    manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || manifest.database !== "homay.sqlite")
    throw new Error("Invalid backup manifest");
  const bytes = readFileSync(join(source, "homay.sqlite"));
  if (
    createHash("sha256").update(bytes).digest("hex") !== manifest.databaseSha256
  )
    throw new Error("Backup checksum mismatch");
  const key = readFileSync(join(source, "master-key.private"), "utf8").trim();
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new Error("Backup encryption key missing or invalid");
  const directory = mkdtempSync(join(tmpdir(), "homay-restore-drill-"));
  let restored: Database.Database | undefined;
  try {
    const file = join(directory, "restored.sqlite");
    copyFileSync(join(source, "homay.sqlite"), file);
    process.env.DATABASE_PATH = file;
    process.env.PLATFORM_MASTER_KEY = key;
    const { platformDb, all, one } = await import("../src/platform/schema");
    const { decrypt } = await import("../src/platform/security");
    restored = platformDb();
    if (
      restored.pragma("integrity_check", { simple: true }) !== "ok" ||
      (restored.pragma("foreign_key_check") as unknown[]).length
    )
      throw new Error("Restored database integrity check failed");
    for (const item of all("SELECT value FROM p_settings WHERE secret=1"))
      decrypt(item.value);
    for (const user of all(
      "SELECT otp_secret FROM p_users WHERE otp_secret IS NOT NULL",
    ))
      decrypt(user.otp_secret);
    for (const w of all("SELECT * FROM p_wallets")) {
      const sum = one(
        "SELECT COALESCE(SUM(available_delta),0) available,COALESCE(SUM(pending_delta),0) pending,COALESCE(SUM(held_delta),0) held,COALESCE(SUM(debt_delta),0) debt FROM p_ledger WHERE user_id=?",
        w.user_id,
      )!;
      for (const field of ["available", "pending", "held", "debt"])
        if (sum[field] !== w[field])
          throw new Error("Wallet ledger reconciliation failed");
    }
    console.log(
      JSON.stringify({
        recovery: "verified",
        migrations: one("SELECT MAX(version) n FROM p_migrations")!.n,
        users: one("SELECT COUNT(*) n FROM p_users")!.n,
        orders: one("SELECT COUNT(*) n FROM p_orders")!.n,
        checks: [
          "checksum",
          "migration",
          "integrity",
          "foreign_keys",
          "decryption",
          "wallet_ledger",
        ],
        liveFilesChanged: false,
      }),
    );
  } finally {
    restored?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(() => {
  console.error("Recovery drill failed; live files were not changed.");
  process.exitCode = 1;
});
