// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import { platformDb, run, now } from "./schema";
import { saveSetting } from "./providers";
import { ledger } from "./finance";
import { encrypt } from "./security";
import { backupFingerprint, verifyBackupFiles } from "./backup-manifest";

const root = mkdtempSync(join(tmpdir(), "homay-recovery-test-"));
const project = resolve("."),
  live = join(root, "data", "live.sqlite");
const loader = createRequire(import.meta.url).resolve("tsx");
let backup: string;
function command(script: string, directory: string) {
  return spawnSync(
    process.execPath,
    ["--import", loader, join(project, "scripts", script), directory],
    {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      timeout: 30000,
    },
  );
}
function copy() {
  const directory = join(root, randomUUID());
  cpSync(backup, directory, { recursive: true });
  return directory;
}
function manifest(directory: string) {
  return JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
}
beforeAll(() => {
  process.env.DATABASE_PATH = live;
  process.env.PLATFORM_MASTER_KEY = "e".repeat(64);
  mkdirSync(join(root, "data", "media", "originals"), { recursive: true });
  writeFileSync(
    join(root, "data", "media", "originals", "image.webp"),
    "fixture-image",
  );
  writeFileSync(
    join(root, ".env.local"),
    "FIXTURE_ONLY=private-fixture-setting\n",
    { mode: 0o600 },
  );
  const user = randomUUID();
  run(
    "INSERT INTO p_users(id,name,password,referral_code,created_at,last_seen,signup_ip,otp_secret) VALUES(?,?,?,?,?,?,?,?)",
    user,
    "Recovery fixture",
    "unused",
    user,
    now(),
    now(),
    "fixture",
    encrypt("test-totp-secret"),
  );
  run("INSERT INTO p_wallets(user_id) VALUES(?)", user);
  ledger(user, randomUUID(), "fixture", "fixture", 4000, 300, 20, 1);
  saveSetting("recovery_fixture", "encrypted-fixture", true);
  const result = command("platform-backup.ts", join(root, "backups"));
  expect(result.status, result.stderr).toBe(0);
  backup = join(root, "backups", readdirSync(join(root, "backups"))[0]);
}, 30000);
afterAll(() => {
  platformDb().close();
  rmSync(root, { recursive: true, force: true });
});

it("rehearses a complete backup including encrypted settings, TOTP, media, environment and all wallet balances", () => {
  const inventory = manifest(backup);
  expect(inventory.version).toBe(2);
  expect(Object.keys(inventory.files).sort()).toEqual([
    "environment.private",
    "homay.sqlite",
    "master-key.private",
    "media/originals/image.webp",
  ]);
  expect(statSync(backup).mode & 0o077).toBe(0);
  expect(statSync(join(backup, "manifest.json")).mode & 0o077).toBe(0);
  const before = backupFingerprint(live);
  const verified = command("platform-verify-backup.ts", backup);
  expect(verified.status, verified.stderr).toBe(0);
  const restored = command("platform-restore-drill.ts", backup);
  expect(restored.status, restored.stderr).toBe(0);
  expect(JSON.parse(restored.stdout)).toMatchObject({
    recovery: "verified",
    assets: "verified",
    users: 1,
    liveFilesChanged: false,
  });
  expect(restored.stdout).not.toContain("private-fixture-setting");
  expect(backupFingerprint(live)).toEqual(before);
});

it.each([
  "homay.sqlite",
  "master-key.private",
  "environment.private",
  "media/originals/image.webp",
])("rejects altered %s before rehearsing recovery", (file) => {
  const directory = copy();
  appendFileSync(join(directory, file), "changed");
  expect(command("platform-restore-drill.ts", directory).status).toBe(1);
});
it("rejects missing or extra media, private files and manifest paths outside the backup", () => {
  for (const file of [
    "media/originals/image.webp",
    "environment.private",
    "master-key.private",
  ]) {
    const directory = copy();
    rmSync(join(directory, file));
    expect(() => verifyBackupFiles(directory)).toThrow();
  }
  const extra = copy();
  writeFileSync(join(extra, "media", "extra.webp"), "extra");
  expect(() => verifyBackupFiles(extra)).toThrow();
  const escape = copy(),
    data = manifest(escape);
  data.files["../../outside.private"] = { bytes: 1, sha256: "a".repeat(64) };
  writeFileSync(join(escape, "manifest.json"), JSON.stringify(data));
  expect(() => verifyBackupFiles(escape)).toThrow();
});
it("rejects symbolic links even when they point to identical bytes", () => {
  const directory = copy(),
    file = "media/originals/image.webp";
  rmSync(join(directory, file));
  symlinkSync(join(backup, file), join(directory, file));
  expect(() => verifyBackupFiles(directory)).toThrow();
});
it("still checks wallet reconciliation when a database has a matching checksum", () => {
  const directory = copy(),
    file = join(directory, "homay.sqlite"),
    data = manifest(directory);
  const db = new Database(file);
  db.prepare("UPDATE p_wallets SET available=available+1").run();
  db.close();
  data.files["homay.sqlite"] = backupFingerprint(file);
  data.databaseSha256 = data.files["homay.sqlite"].sha256;
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(data));
  expect(command("platform-restore-drill.ts", directory).status).toBe(1);
});
it("accepts legacy database backups while explicitly marking media and private-file integrity unverified", () => {
  const directory = copy(),
    data = manifest(directory);
  data.version = 1;
  delete data.files;
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(data));
  const restored = command("platform-restore-drill.ts", directory);
  expect(restored.status, restored.stderr).toBe(0);
  expect(JSON.parse(restored.stdout).assets).toBe("legacy-unverified");
});
it("creates and rehearses a new backup with one command", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/platform-backup.ts",
      join(root, "verified-backups"),
      "--verify",
    ],
    { cwd: project, env: process.env, encoding: "utf8", timeout: 30000 },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('"recovery":"verified"');
  expect(result.stdout).toContain('"assets":"verified"');
  expect(result.stdout).toContain("Backup completed:");
});
