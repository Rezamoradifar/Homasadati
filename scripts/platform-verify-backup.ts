import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
const directory = process.argv[2];
if (!directory) {
  console.error(
    "Usage: npx tsx scripts/platform-verify-backup.ts /absolute/backup/directory",
  );
  process.exitCode = 1;
} else {
  try {
    const root = resolve(directory),
      manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
    if (manifest.version !== 1 || manifest.database !== "homay.sqlite")
      throw Error("manifest");
    const file = join(root, "homay.sqlite"),
      hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (hash !== manifest.databaseSha256) throw Error("checksum");
    const db = new Database(file, { readonly: true });
    try {
      if (db.pragma("quick_check", { simple: true }) !== "ok")
        throw Error("integrity");
    } finally {
      db.close();
    }
    if (
      manifest.masterKeyCaptured &&
      !/^[a-f0-9]{64}$/i.test(
        readFileSync(join(root, "master-key.private"), "utf8").trim(),
      )
    )
      throw Error("key");
    console.log(
      "Backup checksum and SQLite integrity verified. No live files changed.",
    );
  } catch {
    console.error("Backup verification failed. No live files changed.");
    process.exitCode = 1;
  }
}
