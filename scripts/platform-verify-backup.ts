import Database from "better-sqlite3";
import { verifyBackupFiles } from "../src/platform/backup-manifest";
const directory = process.argv[2];
if (!directory) {
  console.error(
    "Usage: npx tsx scripts/platform-verify-backup.ts /absolute/backup/directory",
  );
  process.exitCode = 1;
} else {
  try {
    const verified = verifyBackupFiles(directory);
    const db = new Database(verified.database, { readonly: true });
    try {
      if (db.pragma("quick_check", { simple: true }) !== "ok")
        throw Error("integrity");
    } finally {
      db.close();
    }
    console.log(
      JSON.stringify({
        backup: "verified",
        assets: verified.assets,
        liveFilesChanged: false,
      }),
    );
  } catch {
    console.error("Backup verification failed. No live files changed.");
    process.exitCode = 1;
  }
}
