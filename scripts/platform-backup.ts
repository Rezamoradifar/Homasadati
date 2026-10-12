import { loadEnvConfig } from "@next/env";
import { createBackup } from "../src/platform/backup";
import { platformDb } from "../src/platform/schema";
import { recordServiceFailure } from "../src/platform/readiness";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
loadEnvConfig(process.cwd());
process.umask(0o077);
const destinations = process.argv
  .slice(2)
  .filter((argument) => argument !== "--verify");
createBackup(destinations[0] || "backups")
  .then(async (directory) => {
    if (process.argv.includes("--verify")) {
      const result = await promisify(execFile)(
        process.execPath,
        [
          "--import",
          "tsx",
          resolve("scripts/platform-restore-drill.ts"),
          directory,
        ],
        { timeout: 1800000, maxBuffer: 1024 * 1024 },
      );
      console.log(result.stdout.trim());
    }
    console.log("Backup completed:", directory);
  })
  .catch(() => {
    recordServiceFailure("backup", "backup_failed");
    console.error("Backup failed; inspect configuration and storage.");
    process.exitCode = 1;
  })
  .finally(() => platformDb().close());
