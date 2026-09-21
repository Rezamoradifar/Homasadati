import { loadEnvConfig } from "@next/env";
import {
  mkdirSync,
  chmodSync,
  copyFileSync,
  existsSync,
  cpSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { mediaDirectory } from "../src/platform/media";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { saveSetting } from "../src/platform/providers";
import { recordServiceFailure } from "../src/platform/readiness";
import { platformDb } from "../src/platform/schema";
loadEnvConfig(process.cwd());
async function main() {
  const directory = resolve(
    process.argv[2] || "backups",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, "homay.sqlite");
  await platformDb().backup(file);
  chmodSync(file, 0o600);
  const snapshot = new Database(file, { readonly: true });
  try {
    if (snapshot.pragma("quick_check", { simple: true }) !== "ok")
      throw new Error("BackupIntegrity");
  } finally {
    snapshot.close();
  }
  const master = process.env.PLATFORM_MASTER_KEY;
  if (master && !/^[a-f0-9]{64}$/i.test(master))
    throw new Error("InvalidMasterKey");
  if (!master) throw new Error("MissingMasterKey");
  if (master)
    writeFileSync(join(directory, "master-key.private"), master + "\n", {
      mode: 0o600,
    });
  if (existsSync(".env.local")) {
    const env = join(directory, "environment.private");
    copyFileSync(".env.local", env);
    chmodSync(env, 0o600);
  }
  if (existsSync(mediaDirectory()))
    cpSync(mediaDirectory(), join(directory, "media"), { recursive: true });
  writeFileSync(
    join(directory, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        createdAt: new Date().toISOString(),
        database: "homay.sqlite",
        databaseSha256: createHash("sha256")
          .update(readFileSync(file))
          .digest("hex"),
        masterKeyCaptured: !!master,
        mediaIncluded: existsSync(mediaDirectory()),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  saveSetting("backup_last_success", new Date().toISOString());
  console.log("Backup completed:", directory);
  platformDb().close();
}
main().catch((e) => {
  recordServiceFailure("backup", "backup_failed");
  console.error("Backup failed:", e instanceof Error ? e.name : "unknown");
  process.exitCode = 1;
});
