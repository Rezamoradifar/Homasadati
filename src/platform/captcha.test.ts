// @vitest-environment node
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowedHostnames, captchaConfig, verifyCaptcha } from "./captcha";
import { platformDb, run } from "./schema";
import { handle } from "./api";
const dir = mkdtempSync(join(tmpdir(), "homay-captcha-"));
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
});
beforeEach(() => {
  run("DELETE FROM limits");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TURNSTILE_SITE_KEY", "real-site-key");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "real-secret-key");
  vi.stubEnv("APP_ORIGIN", "https://homay.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
const good = () => ({
  success: true,
  action: "register",
  hostname: "homay.test",
  challenge_ts: new Date().toISOString(),
});
it("fails closed if configuration is missing in production and does not disclose the secret", async () => {
  expect(captchaConfig()).toEqual({
    siteKey: "real-site-key",
    required: true,
    ready: true,
  });
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  expect(captchaConfig().ready).toBe(false);
  await expect(verifyCaptcha("anything", "register")).rejects.toMatchObject({
    status: 503,
  });
});
it("requires a nonempty bounded token before any provider request", async () => {
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  for (const token of [undefined, "", "x".repeat(2049)])
    await expect(verifyCaptcha(token, "register")).rejects.toMatchObject({
      code: "captcha_required",
    });
  expect(mock).not.toHaveBeenCalled();
});
it("validates server-side success, exact action and hostname, and timestamp freshness", async () => {
  for (const result of [
    { ...good(), success: false },
    { ...good(), action: "login" },
    { ...good(), hostname: "evil.test" },
    { ...good(), challenge_ts: "invalid" },
    { ...good(), challenge_ts: new Date(Date.now() - 301000).toISOString() },
    { ...good(), challenge_ts: new Date(Date.now() + 60000).toISOString() },
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(result)),
    );
    await expect(verifyCaptcha("token", "register")).rejects.toMatchObject({
      code: "captcha_invalid",
    });
  }
  const mock = vi.fn(async () => Response.json(good()));
  vi.stubGlobal("fetch", mock);
  await expect(verifyCaptcha("token", "register")).resolves.toBeUndefined();
  const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
  expect(JSON.parse(String(init.body))).toEqual({
    secret: "real-secret-key",
    response: "token",
  });
  expect(init.redirect).toBe("error");
});
it("honors a provider duplicate rejection and never bypasses an outage", async () => {
  const used = new Set();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const t = JSON.parse(init.body).response;
      const result = used.has(t)
        ? { success: false, "error-codes": ["timeout-or-duplicate"] }
        : good();
      used.add(t);
      return Response.json(result);
    }),
  );
  await verifyCaptcha("one-use-token", "register");
  await expect(
    verifyCaptcha("one-use-token", "register"),
  ).rejects.toMatchObject({ code: "captcha_invalid" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
  await expect(verifyCaptcha("token", "register")).rejects.toMatchObject({
    code: "captcha_unavailable",
  });
});
it("protects public OTP and login routes before sending email or checking credentials", async () => {
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  for (const [action, payload] of [
    ["otp", { target: "member@example.test", purpose: "register" }],
    [
      "login",
      { target: "member@example.test", password: "a-long-password-123" },
    ],
  ] as const) {
    const r = await handle(
      new Request("https://homay.test/api/platform/auth/" + action, {
        method: "POST",
        headers: {
          origin: "https://homay.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }),
      ["auth", action],
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "captcha_required" });
  }
  expect(mock).not.toHaveBeenCalled();
});
it("rejects provider testing keys on production instead of silently weakening the gate", async () => {
  vi.stubEnv("TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
  expect(captchaConfig().ready).toBe(false);
  await expect(verifyCaptcha("token", "register")).rejects.toMatchObject({
    code: "captcha_not_configured",
  });
});

it("accepts the site host and its www twin only", () => {
  expect(allowedHostnames("https://homanets.com")).toEqual(["homanets.com", "www.homanets.com"]);
  expect(allowedHostnames("https://www.homanets.com")).toEqual(["www.homanets.com", "homanets.com"]);
});
