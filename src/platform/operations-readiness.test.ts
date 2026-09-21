// @vitest-environment node
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { handle } from "./api";
import { run, one, now, platformDb } from "./schema";
import { session, SESSION_COOKIE } from "./security";
import { saveSetting, setting } from "./providers";
import { recordServiceFailure } from "./readiness";
const root = mkdtempSync(join(tmpdir(), "homay-operations-"));
let admin: string, editor: string;
function request(path: string, cookie = "") {
  return handle(
    new Request("https://ops.test/api/platform/" + path, {
      headers: { cookie },
    }),
    path.split("?")[0].split("/"),
  );
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(root, "homay.sqlite");
  process.env.PLATFORM_MASTER_KEY = "e".repeat(64);
  process.env.APP_ORIGIN = "https://ops.test";
  for (const role of ["superadmin", "content"]) {
    const id = randomUUID();
    run(
      "INSERT INTO p_users(id,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",
      id,
      role,
      "unused",
      role,
      id,
      now(),
      now(),
      "fixture",
    );
    const cookie = SESSION_COOKIE + "=" + session(id, "test");
    if (role === "superadmin") admin = cookie;
    else editor = cookie;
  }
});
afterAll(() => {
  platformDb().close();
  rmSync(root, { recursive: true, force: true });
});
it("restricts readiness to the owner and reports configuration and stale jobs without disclosing credentials", async () => {
  saveSetting("kavenegar_key", "private-sms-fixture", true);
  saveSetting("sms_template", "fixture-template");
  saveSetting("google_client_id", "123-fixture.apps.googleusercontent.com");
  saveSetting("worker_last_success", now());
  saveSetting("backup_last_success", "2000-01-01T00:00:00.000Z");
  const id = randomUUID();
  run(
    "INSERT INTO p_products(id,vertical,subtype,title,description,price,stock,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    id,
    "leather",
    "bag",
    "Bag",
    "Description",
    1000,
    1,
    1,
    now(),
    now(),
  );
  for (let i = 0; i < 205; i++)
    recordServiceFailure("worker", "delivery_failed");
  expect((await request("admin/readiness")).status).toBe(401);
  expect((await request("admin/readiness", editor)).status).toBe(403);
  const result = await request("admin/readiness", admin);
  expect(result.status).toBe(200);
  const data = await result.json();
  expect(data.worker.healthy).toBe(true);
  expect(data.backup.healthy).toBe(false);
  expect(data.missingTranslations).toBe(1);
  expect(data.events).toHaveLength(20);
  expect(one("SELECT COUNT(*) n FROM p_service_events")!.n).toBe(200);
  expect(JSON.stringify(data)).not.toContain("private-sms-fixture");
  const publicConfig = await (await request("auth/config")).json();
  expect(publicConfig.smsRegistration).toBe(true);
  expect(publicConfig.googleEnabled).toBe(true);
  expect(JSON.stringify(publicConfig)).not.toContain("private-sms-fixture");
});
it("serves real resized upload variants, caches them and rejects unsupported widths and paths", async () => {
  const name = randomUUID() + ".webp";
  mkdirSync(join(root, "media"), { recursive: true });
  writeFileSync(
    join(root, "media", name),
    await sharp({
      create: { width: 1800, height: 1200, channels: 3, background: "#734921" },
    })
      .webp()
      .toBuffer(),
  );
  const path = "media/" + name + "?w=320",
    first = await request(path),
    bytes = Buffer.from(await first.arrayBuffer());
  expect(first.status).toBe(200);
  const meta = await sharp(bytes).metadata();
  expect([meta.width, meta.height]).toEqual([320, 213]);
  expect(first.headers.get("cache-control")).toContain("immutable");
  expect(
    Buffer.from(await (await request(path)).arrayBuffer()).equals(bytes),
  ).toBe(true);
  expect(readdirSync(join(root, "media", "variants"))).toEqual([
    name + "-320.webp",
  ]);
  expect((await request("media/" + name + "?w=999999")).status).toBe(400);
  expect((await request("media/invalid.webp")).status).toBe(404);
  const original = await sharp(
    Buffer.from(await (await request("media/" + name)).arrayBuffer()),
  ).metadata();
  expect(original.width).toBe(1800);
});
it("creates a private, verifiable backup with the original master key and detects tampering without touching live data", () => {
  const destination = join(root, "backups");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/platform-backup.ts", destination],
    { cwd: resolve("."), env: process.env, encoding: "utf8", timeout: 30000 },
  );
  expect(result.status, result.stderr).toBe(0);
  const directory = join(destination, readdirSync(destination)[0]);
  expect(
    readFileSync(join(directory, "master-key.private"), "utf8").trim(),
  ).toBe(process.env.PLATFORM_MASTER_KEY);
  expect(setting("backup_last_success")).toBeTruthy();
  const verify = () =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/platform-verify-backup.ts", directory],
      { cwd: resolve("."), env: process.env, encoding: "utf8", timeout: 30000 },
    );
  expect(verify().status).toBe(0);
  appendFileSync(join(directory, "homay.sqlite"), "tampered");
  expect(verify().status).toBe(1);
  expect(platformDb().pragma("quick_check", { simple: true })).toBe("ok");
}, 60000);
