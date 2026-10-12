import {
  mkdirSync,
  mkdtempSync,
  lstatSync,
  chmodSync,
  copyFileSync,
  existsSync,
  cpSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { mediaDirectory } from "./media";
import Database from "better-sqlite3";
import { backupInventory, verifyBackupFiles } from "./backup-manifest";
import { saveSetting } from "./providers";
import { platformDb } from "./schema";
export async function createBackup(destination = "backups") {
  const parent = resolve(destination);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(
    join(parent, new Date().toISOString().replace(/[:.]/g, "-") + "-"),
  );
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
    cpSync(mediaDirectory(), join(directory, "media"), {
      recursive: true,
      filter: (source) => {
        const info = lstatSync(source);
        if (!info.isFile() && !info.isDirectory())
          throw Error("Unsupported media file");
        return true;
      },
    });
  const files = backupInventory(directory);
  writeFileSync(
    join(directory, "manifest.json"),
    JSON.stringify(
      {
        version: 2,
        createdAt: new Date().toISOString(),
        database: "homay.sqlite",
        databaseSha256: files["homay.sqlite"].sha256,
        masterKeyCaptured: !!master,
        mediaIncluded: existsSync(join(directory, "media")),
        environmentIncluded: existsSync(join(directory, "environment.private")),
        files,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  verifyBackupFiles(directory);
  saveSetting("backup_last_success", new Date().toISOString());
  return directory;
}
