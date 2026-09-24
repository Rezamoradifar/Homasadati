import { loadEnvConfig } from "@next/env";
import { createBackup } from "../src/platform/backup";
import { platformDb } from "../src/platform/schema";
import { recordServiceFailure } from "../src/platform/readiness";
loadEnvConfig(process.cwd());
createBackup(process.argv[2] || "backups")
  .then((directory) => console.log("Backup completed:", directory))
  .catch(() => {
    recordServiceFailure("backup", "backup_failed");
    console.error("Backup failed; inspect configuration and storage.");
    process.exitCode = 1;
  })
  .finally(() => platformDb().close());
