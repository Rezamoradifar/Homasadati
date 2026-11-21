// @vitest-environment node
import { beforeEach, afterAll, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { platformDb, now, run } from "./schema";
import { saveSetting, setting } from "./providers";
import { operationalStatus, sendOperationalAlert } from "./monitoring";
import { GET } from "../../app/api/health/ready/route";
const root = mkdtempSync(join(tmpdir(), "homay-monitor-test-"));
let database: ReturnType<typeof platformDb> | undefined;
beforeEach(() => {
  vi.stubEnv("DATABASE_PATH", join(root, "data.sqlite"));
  vi.stubEnv("PLATFORM_MASTER_KEY", "a".repeat(64));
  vi.stubEnv("MONITOR_TOKEN", "test-only-".repeat(5));
  database = platformDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => {
  database?.close();
  rmSync(root, { recursive: true, force: true });
});
it("protects operational status and detects stale jobs without leaking private settings", async () => {
  vi.stubEnv("MONITOR_MIN_FREE_BYTES", String(1024 * 1024));
  saveSetting("kavenegar_key", "private-monitor-test", true);
  const request = (token?: string) =>
    new Request("http://localhost/api/health/ready", {
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
  expect((await GET(request())).status).toBe(401);
  expect((await GET(request("invalid"))).status).toBe(401);
  let result = await GET(request(process.env.MONITOR_TOKEN));
  expect(result.status).toBe(503);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  for (const key of [
    "worker_last_success",
    "backup_last_success",
    "offsite_last_success",
  ])
    saveSetting(key, now());
  result = await GET(request(process.env.MONITOR_TOKEN));
  const healthy = await result.json();
  expect(result.status, JSON.stringify(healthy.checks)).toBe(200);
  expect(JSON.stringify(healthy)).not.toContain("private-monitor-test");
  vi.stubEnv("MONITOR_MIN_FREE_BYTES", String(Number.MAX_SAFE_INTEGER));
  const lowDisk = await GET(request(process.env.MONITOR_TOKEN));
  expect(lowDisk.status).toBe(503);
  expect((await lowDisk.json()).checks.disk).toBe(false);
  saveSetting(
    "worker_last_success",
    new Date(Date.now() - 181000).toISOString(),
  );
  expect(operationalStatus().checks.worker).toBe(false);
  saveSetting(
    "worker_last_success",
    new Date(Date.now() + 60000).toISOString(),
  );
  expect(operationalStatus().checks.worker).toBe(false);
});
it("deduplicates successful alerts, retries failures and rejects unsafe webhook URLs", async () => {
  vi.stubEnv("ALERT_WEBHOOK_URL", "");
  saveSetting("kavenegar_key", "private-monitor-test", true);
  run("DELETE FROM p_settings WHERE key='worker_last_success'");
  const report = operationalStatus();
  expect(report.checks.worker).toBe(false);
  expect(await sendOperationalAlert(report)).toEqual({
    sent: false,
    configured: false,
  });
  vi.stubEnv("ALERT_WEBHOOK_URL", "http://alerts.invalid");
  await expect(sendOperationalAlert(report)).rejects.toThrow("HTTPS");
  vi.stubEnv("ALERT_WEBHOOK_URL", "https://alerts.invalid/receiver");
  const mocked = vi
    .fn()
    .mockResolvedValueOnce(new Response("failed", { status: 500 }))
    .mockResolvedValue(new Response("ok"));
  vi.stubGlobal("fetch", mocked);
  await expect(sendOperationalAlert(report)).rejects.toThrow("rejected");
  expect(setting("monitor_last_alert")).toBeFalsy();
  expect((await sendOperationalAlert(report)).sent).toBe(true);
  expect((await sendOperationalAlert(report)).sent).toBe(false);
  expect(mocked).toHaveBeenCalledTimes(2);
  saveSetting("worker_last_success", now());
  const recovered = operationalStatus();
  expect(recovered.checks.worker).toBe(true);
  expect((await sendOperationalAlert(recovered)).sent).toBe(true);
  expect(mocked.mock.calls[0][1].body).not.toContain("private-monitor-test");
  expect(mocked.mock.calls[0][1].redirect).toBe("error");
});
it("requires a completed Restic snapshot and does not mark a rehearsal or partial upload healthy", () => {
  const password = join(root, "restic-password"),
    binary = join(root, "restic-fixture");
  writeFileSync(password, "test-only-restic-password-".repeat(3), {
    mode: 0o600,
  });
  // Contract fixture only: exercises subprocess orchestration, real database backup
  // and restore drill. It intentionally does not claim to test Restic encryption.
  writeFileSync(
    binary,
    `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[0]==='backup'){if(process.env.RESTIC_TEST_PARTIAL){console.error('private-provider-diagnostic');process.exit(3)}console.log(JSON.stringify({message_type:'summary',snapshot_id:'a'.repeat(64)}))}else if(a[0]==='snapshots')console.log(JSON.stringify([{id:'a'.repeat(64)}]));else console.log('{}');\n`,
    { mode: 0o700 },
  );
  const execute = (extra: Record<string, string> = {}, args: string[] = []) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/platform-offsite-backup.ts", ...args],
      {
        cwd: resolve("."),
        env: {
          ...process.env,
          RESTIC_BIN: binary,
          RESTIC_PASSWORD_FILE: password,
          RESTIC_REPOSITORY: "s3:https://fixture.invalid/test",
          BACKUP_DIRECTORY: join(root, "backups"),
          ...extra,
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );
  run("DELETE FROM p_settings WHERE key='offsite_last_success'");
  const failed = execute({ RESTIC_TEST_PARTIAL: "1" });
  expect(failed.status).toBe(1);
  expect(failed.stderr).not.toContain("private-provider-diagnostic");
  expect(setting("offsite_last_success")).toBeFalsy();
  const rehearsal = execute({ RESTIC_REPOSITORY: join(root, "rehearsal") }, [
    "--local-rehearsal",
  ]);
  expect(rehearsal.status, rehearsal.stderr).toBe(0);
  expect(setting("offsite_last_success")).toBeFalsy();
  const success = execute();
  expect(success.status, success.stderr).toBe(0);
  expect(setting("offsite_last_success")).toBeTruthy();
  chmodSync(password, 0o644);
  expect(execute().status).toBe(1);
}, 90000);
