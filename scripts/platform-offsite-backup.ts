import { loadEnvConfig } from "@next/env";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createBackup } from "../src/platform/backup";
import { saveSetting } from "../src/platform/providers";
import { platformDb, now } from "../src/platform/schema";
import { recordServiceFailure } from "../src/platform/readiness";
loadEnvConfig(process.cwd());
process.umask(0o077);
const exec = promisify(execFile);
async function main() {
  const rehearsal = process.argv.includes("--local-rehearsal");
  const config = process.env.RESTIC_REPOSITORY_FILE;
  if (config && statSync(config).mode & 0o077)
    throw new Error("Repository configuration must be private");
  const repository =
    process.env.RESTIC_REPOSITORY ||
    (config ? readFileSync(config, "utf8").trim() : "");
  if (
    !repository ||
    (!rehearsal &&
      !/^(s3:|sftp:|rest:https:\/\/|b2:|azure:|gs:|swift:)/.test(repository))
  )
    throw new Error("A remote Restic repository is required");
  const passwordFile = process.env.RESTIC_PASSWORD_FILE;
  if (
    !passwordFile ||
    !statSync(passwordFile).isFile() ||
    statSync(passwordFile).mode & 0o077 ||
    readFileSync(passwordFile, "utf8").trim().length < 32
  )
    throw new Error(
      "A private password file of at least 32 characters is required",
    );
  if (process.env.RESTIC_PASSWORD_COMMAND || process.env.RESTIC_PASSWORD)
    throw new Error("Use RESTIC_PASSWORD_FILE only");
  const binary = process.env.RESTIC_BIN || "restic";
  const options = {
    timeout: 1800000,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  };
  // The repository must be explicitly initialized by its owner. Never create,
  // prune, unlock or overwrite a remote repository as a recovery side effect.
  await exec(binary, ["cat", "config"], options);
  const directory = await createBackup(
    process.env.BACKUP_DIRECTORY || "backups",
  );
  await exec(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve("scripts/platform-restore-drill.ts"),
      directory,
    ],
    options,
  );
  const uploaded = await exec(
    binary,
    ["backup", "--json", "--tag", "homay-saadat", directory],
    options,
  );
  const summary = uploaded.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .findLast((item) => item.message_type === "summary");
  if (summary?.dry_run || !/^[a-f0-9]{8,64}$/.test(summary?.snapshot_id || ""))
    throw new Error("No completed Restic snapshot");
  const listed = await exec(
    binary,
    ["snapshots", "--json", summary.snapshot_id],
    options,
  );
  if (
    !JSON.parse(listed.stdout).some((s: { id: string }) =>
      s.id.startsWith(summary.snapshot_id),
    )
  )
    throw new Error("Uploaded snapshot not found");
  writeFileSync(
    join(directory, "offsite-receipt.json"),
    JSON.stringify(
      { snapshot: summary.snapshot_id, completedAt: now(), rehearsal },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  if (!rehearsal) {
    saveSetting("offsite_last_success", now());
    saveSetting("offsite_snapshot", summary.snapshot_id);
  }
  console.log(
    JSON.stringify({
      backup: "verified",
      destination: rehearsal ? "local-rehearsal" : "configured-remote",
      snapshot: summary.snapshot_id,
      restoreDrill: "passed",
    }),
  );
}
main()
  .catch(() => {
    recordServiceFailure("offsite", "backup_failed");
    console.error(
      "Offsite backup failed. Check private repository settings, credentials, Restic availability and disk space; provider output is withheld to protect secrets.",
    );
    process.exitCode = 1;
  })
  .finally(() => platformDb().close());
