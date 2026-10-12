// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { platformDb, now } from "../src/platform/schema";
import { saveSetting } from "../src/platform/providers";
const root = mkdtempSync(join(tmpdir(), "homay-monitor-cli-"));
const server = createServer((_request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ status: "ok" }));
});
beforeAll(async () => {
  process.env.DATABASE_PATH = join(root, "database.sqlite");
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
  for (const key of [
    "worker_last_success",
    "backup_last_success",
    "offsite_last_success",
  ])
    saveSetting(key, now());
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  platformDb().close();
  rmSync(root, { recursive: true, force: true });
});
function execute(notify: boolean) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (done, reject) => {
      const port = (server.address() as { port: number }).port;
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/platform-monitor.ts",
          ...(notify ? ["--notify"] : []),
        ],
        {
          cwd: resolve("."),
          env: {
            ...process.env,
            ALERT_WEBHOOK_URL: "",
            HTTP_PORT: String(port),
          },
          timeout: 15000,
        },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (part) => {
        stdout += part;
      });
      child.stderr.on("data", (part) => {
        stderr += part;
      });
      child.on("error", reject);
      child.on("close", (code) => done({ code, stdout, stderr }));
    },
  );
}
it("checks healthy services without sending an alert in diagnostic mode", async () => {
  const result = await execute(false);
  expect(result.code, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).status).toBe("ok");
});
it("fails the notifying service when no alert destination is configured even if the application is healthy", async () => {
  const result = await execute(true);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("not configured");
});
