// @vitest-environment node
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
  vi,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handle } from "./api";
import { platformDb, run, now } from "./schema";
import { passwordHash, encrypt, totp } from "./security";
import { temporaryAdminPasswordLogin } from "./admin-login-window";
const dir = mkdtempSync(join(tmpdir(), "homay-admin-window-"));
const password = "temporary-test-password-123";
const secret = "JBSWY3DPEHPK3PXP";
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  process.env.PLATFORM_MASTER_KEY = "b".repeat(64);
  for (const [name, role, blocked, twoFactor] of [
    ["admin", "superadmin", 0, false],
    ["member", "user", 0, false],
    ["blocked", "superadmin", 1, false],
    ["secure", "superadmin", 0, true],
  ] as const) {
    run(
      "INSERT INTO p_users(id,email,name,password,role,blocked,otp_secret,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      randomUUID(),
      name + "@example.test",
      name,
      passwordHash(password),
      role,
      blocked,
      twoFactor ? encrypt(secret) : null,
      name,
      now(),
      now(),
      "test",
    );
  }
});
beforeEach(() => {
  run("DELETE FROM limits");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_ORIGIN", "https://homay.test");
  vi.stubEnv("TURNSTILE_SITE_KEY", "");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  vi.stubEnv(
    "TEMP_ADMIN_PASSWORD_LOGIN_UNTIL",
    new Date(Date.now() + 7200000).toISOString(),
  );
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
function request(
  action = "login",
  payload: Record<string, unknown> = {},
  origin = "https://homay.test",
) {
  return handle(
    new Request("https://homay.test/api/platform/auth/" + action, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "admin@example.test",
        password,
        adminPasswordLogin: true,
        ...payload,
      }),
    }),
    ["auth", action],
  );
}
it("permits the superadmin password route while preserving secure session cookies", async () => {
  const r = await request();
  expect(r.status).toBe(200);
  expect((await r.json()).user.role).toBe("superadmin");
  expect(r.headers.get("set-cookie")).toContain("HttpOnly");
  expect(r.headers.get("set-cookie")).toContain("Secure");
});
it("rejects wrong credentials, ordinary members and blocked administrators", async () => {
  for (const payload of [
    { password: "incorrect-password" },
    { target: "member@example.test" },
    { target: "blocked@example.test" },
    { target: "unknown@example.test" },
  ])
    expect((await request("login", payload)).status).toBe(401);
});
it("retains second-factor verification for an administrator with an authenticator", async () => {
  expect(
    (await request("login", { target: "secure@example.test" })).status,
  ).toBe(401);
  expect(
    (
      await request("login", {
        target: "secure@example.test",
        totp: totp(secret),
      })
    ).status,
  ).toBe(200);
});
it("expires automatically and rejects unset, invalid or excessively distant deadlines", async () => {
  for (const value of [
    "",
    "invalid",
    new Date(Date.now() - 1).toISOString(),
    new Date(Date.now() + 25 * 3600000).toISOString(),
  ]) {
    vi.stubEnv("TEMP_ADMIN_PASSWORD_LOGIN_UNTIL", value);
    expect(temporaryAdminPasswordLogin()).toBe(false);
    expect((await request()).status).toBe(503);
  }
});
it("keeps captcha on public login, email-code login and OTP sending", async () => {
  for (const [action, payload] of [
    ["login", { adminPasswordLogin: false }],
    ["login", { password: undefined }],
    ["otp", { purpose: "register" }],
  ] as const)
    expect((await request(action, payload)).status).toBe(503);
});
it("retains origin checks and login attempt limits", async () => {
  expect((await request("login", {}, "https://evil.test")).status).toBe(403);
  for (let i = 0; i < 8; i++)
    expect(
      (await request("login", { password: "incorrect-password" })).status,
    ).toBe(401);
  expect((await request()).status).toBe(429);
});
it("only enables the administrator password widget during the window", async () => {
  for (const [action, ready] of [
    ["admin-password-login", true],
    ["login", false],
    ["reset", false],
    ["otp", false],
  ]) {
    const r = await handle(
      new Request(
        "https://homay.test/api/platform/auth/config?action=" + action,
      ),
      ["auth", "config"],
    );
    expect((await r.json()).ready).toBe(ready);
  }
  vi.stubEnv("TEMP_ADMIN_PASSWORD_LOGIN_UNTIL", "");
  const r = await handle(
    new Request(
      "https://homay.test/api/platform/auth/config?action=admin-password-login",
    ),
    ["auth", "config"],
  );
  expect((await r.json()).ready).toBe(false);
});
