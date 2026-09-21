// @vitest-environment node
import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handle } from "./api";
import { run, one, now, platformDb } from "./schema";
import { hash } from "../server/http";
import { TERMS_VERSION, registrationSchema } from "./registration-model";
import { saveSetting, sendOtp } from "./providers";
import { totp, decrypt, checkPassword } from "./security";
const dir = mkdtempSync(join(tmpdir(), "homay-registration-"));
let sponsor: string;
const pw = "a-test-password-123";
function request(
  path: string,
  method = "POST",
  payload?: unknown,
  cookie = "",
) {
  return handle(
    new Request("https://homay.test/api/platform/" + path, {
      method,
      headers: {
        origin: "https://homay.test",
        host: "homay.test",
        "Content-Type": "application/json",
        cookie,
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(payload || {}) }),
    }),
    path.split("/"),
  );
}
function emailOtp(target: string, purpose = "register") {
  const challenge = randomUUID();
  run(
    "INSERT INTO p_otp VALUES(?,?,?,?,?,0,0,?)",
    challenge,
    target,
    purpose,
    hash(challenge + ":123456"),
    Date.now() + 300000,
    now(),
  );
  return { target, challenge, code: "123456" };
}
async function payload(
  target = randomUUID() + "@example.test",
  referral = "sponsor-code",
) {
  const verification = await request(
    "auth/verify-email",
    "POST",
    emailOtp(target),
  );
  expect(verification.status).toBe(200);
  const e = await verification.json();
  return {
    target,
    password: pw,
    verificationToken: e.verificationToken,
    totp: totp(e.secret),
    details: {
      firstName: "عضو",
      lastName: "آزمون",
      country: "ایران",
      city: "شیراز",
      occupation: "هنرمند",
      language: "fa",
      interests: ["craft"],
    },
    termsAccepted: true,
    privacyAccepted: true,
    adultConfirmed: true,
    termsVersion: TERMS_VERSION,
    marketingConsent: false,
    invitationMode: referral ? "with-code" : "without-code",
    referral,
  };
}
async function account() {
  const d = await payload();
  const r = await request("auth/register", "POST", d);
  expect(r.status).toBe(200);
  const result = await r.json();
  return { d, ...result, cookie: r.headers.get("set-cookie")!.split(";")[0] };
}
function nextCode(user: string) {
  return totp(
    decrypt(one("SELECT otp_secret FROM p_users WHERE id=?", user)!.otp_secret),
    Math.floor(Date.now() / 30000) + 1,
  );
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  process.env.APP_ORIGIN = "https://homay.test";
  process.env.PLATFORM_MASTER_KEY = "b".repeat(64);
  sponsor = randomUUID();
  run(
    "INSERT INTO p_users(id,name,password,referral_code,created_at,last_seen,signup_ip) VALUES(?,'معرف','unused','sponsor-code',?,?,'test')",
    sponsor,
    now(),
    now(),
  );
});
beforeEach(() => {
  run("DELETE FROM limits");
});
afterAll(() => {
  vi.unstubAllGlobals();
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
it("requires verified contact; unconfigured SMS, fabricated tickets and wrong mailbox cannot create a session", async () => {
  expect(
    (
      await request("auth/otp", "POST", {
        target: "+989121234567",
        purpose: "register",
      })
    ).status,
  ).toBe(503);
  const d = await payload();
  const before = one("SELECT COUNT(*) n FROM p_users")!.n;
  for (const bad of [
    { ...d, verificationToken: "0".repeat(64) },
    { ...d, target: "someone-else@example.test" },
  ]) {
    const r = await request("auth/register", "POST", bad);
    expect(r.status).toBe(401);
    expect(r.headers.get("set-cookie")).toBeNull();
  }
  expect(one("SELECT COUNT(*) n FROM p_users")!.n).toBe(before);
});
it("locks email codes after five failures and rejects expired or reused codes", async () => {
  const d = emailOtp("otp@example.test");
  for (let i = 0; i < 5; i++)
    expect(
      (await request("auth/verify-email", "POST", { ...d, code: "999999" }))
        .status,
    ).toBe(401);
  expect(
    one("SELECT attempts FROM p_otp WHERE id=?", d.challenge)!.attempts,
  ).toBe(5);
  expect((await request("auth/verify-email", "POST", d)).status).toBe(401);
  const expired = emailOtp("expired@example.test");
  run(
    "UPDATE p_otp SET expires=? WHERE id=?",
    Date.now() - 1,
    expired.challenge,
  );
  expect((await request("auth/verify-email", "POST", expired)).status).toBe(
    401,
  );
  const once = emailOtp("once@example.test");
  expect((await request("auth/verify-email", "POST", once)).status).toBe(200);
  expect((await request("auth/verify-email", "POST", once)).status).toBe(401);
});
it("validates both invitation paths, required details and consents without consuming the verified ticket", async () => {
  const d = await payload();
  expect(
    registrationSchema.safeParse({ ...d, termsAccepted: false }).success,
  ).toBe(false);
  for (const bad of [
    { ...d, privacyAccepted: false },
    { ...d, details: { ...d.details, city: "" } },
    { ...d, invitationMode: "with-code", referral: "" },
    { ...d, invitationMode: "without-code" },
    { ...d, referral: "unknown-code" },
  ])
    expect((await request("auth/register", "POST", bad)).status).toBe(400);
  expect(
    one(
      "SELECT used FROM p_enrollments WHERE token_hash=?",
      hash(d.verificationToken),
    )!.used,
  ).toBe(0);
  run("UPDATE p_users SET blocked=1 WHERE id=?", sponsor);
  expect(
    await (
      await request("referrals/check", "POST", { code: "sponsor-code" })
    ).json(),
  ).toEqual({ valid: false });
  expect((await request("auth/register", "POST", d)).status).toBe(400);
  run("UPDATE p_users SET blocked=0 WHERE id=?", sponsor);
});
it("atomically creates an invited member with mandatory 2FA, hashed recovery codes and immutable consent", async () => {
  const d = await payload();
  const r = await request("auth/register", "POST", d);
  expect(r.status).toBe(200);
  expect(r.headers.get("set-cookie")).toContain("HttpOnly");
  const { user: u, recoveryCodes } = await r.json();
  expect(u.twoFactor).toBe(true);
  expect(u.preferences.email).toBe(false);
  expect(u.otp_secret).toBeUndefined();
  expect(recoveryCodes).toHaveLength(10);
  expect(new Set(recoveryCodes).size).toBe(10);
  const stored = one("SELECT * FROM p_users WHERE id=?", u.id)!;
  expect(stored.sponsor_id).toBe(sponsor);
  expect(stored.password).not.toContain(pw);
  expect(checkPassword(pw, stored.password)).toBe(true);
  expect(stored.otp_secret).not.toBe(decrypt(stored.otp_secret));
  expect(
    one("SELECT code_hash FROM p_recovery_codes WHERE user_id=?", u.id)!
      .code_hash,
  ).not.toBe(recoveryCodes[0]);
  const consent = one("SELECT * FROM p_consents WHERE user_id=?", u.id)!;
  expect(consent.version).toBe(TERMS_VERSION);
  expect(consent.marketing).toBe(0);
  expect(() =>
    run("UPDATE p_consents SET marketing=1 WHERE user_id=?", u.id),
  ).toThrow();
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  expect((await request("member-details", "GET")).status).toBe(401);
  const profile = await (
    await request("member-details", "GET", undefined, cookie)
  ).json();
  expect(profile.profile.contact_verified_at).toBeTruthy();
  expect(
    (
      await request(
        "member-details",
        "PATCH",
        { ...d.details, city: "تهران" },
        cookie,
      )
    ).status,
  ).toBe(200);
  expect(
    JSON.parse(
      one("SELECT details FROM p_member_details WHERE user_id=?", u.id)!
        .details,
    ).city,
  ).toBe("تهران");
  expect((await request("auth/register", "POST", d)).status).toBe(401);
});
it("supports direct registration without inventing a sponsor", async () => {
  const d = await payload(undefined, "");
  const r = await request("auth/register", "POST", d);
  expect(r.status).toBe(200);
  const { user } = await r.json();
  expect(
    one("SELECT sponsor_id,parent_id,leg FROM p_users WHERE id=?", user.id),
  ).toEqual({ sponsor_id: null, parent_id: null, leg: null });
});
it("rejects expired enrollment and exhausts the TOTP attempt budget", async () => {
  const expired = await payload();
  run(
    "UPDATE p_enrollments SET expires=? WHERE token_hash=?",
    Date.now() - 1,
    hash(expired.verificationToken),
  );
  expect((await request("auth/register", "POST", expired)).status).toBe(401);
  const d = await payload();
  const secret = decrypt(
    one(
      "SELECT secret FROM p_enrollments WHERE token_hash=?",
      hash(d.verificationToken),
    )!.secret,
  );
  const accepted = [-1, 0, 1].map((n) =>
    totp(secret, Math.floor(Date.now() / 30000) + n),
  );
  const invalid = accepted.includes("000000") ? "111111" : "000000";
  for (let i = 0; i < 5; i++)
    expect(
      (await request("auth/register", "POST", { ...d, totp: invalid })).status,
    ).toBe(401);
  expect((await request("auth/register", "POST", d)).status).toBe(401);
  expect(one("SELECT id FROM p_users WHERE email=?", d.target)).toBeUndefined();
});
it("enforces the second factor on password login and rejects replay, with single-use recovery as an alternative", async () => {
  const a = await account();
  const login = { target: a.d.target, password: pw };
  expect((await request("auth/login", "POST", login)).status).toBe(401);
  expect(
    (await request("auth/login", "POST", { ...login, totp: a.d.totp })).status,
  ).toBe(401);
  const code = nextCode(a.user.id);
  expect(
    (await request("auth/login", "POST", { ...login, totp: code })).status,
  ).toBe(200);
  expect(
    (await request("auth/login", "POST", { ...login, totp: code })).status,
  ).toBe(401);
  const recovery = { ...login, recoveryCode: a.recoveryCodes[0] };
  expect(
    (
      await request("auth/login", "POST", {
        ...recovery,
        password: "incorrect",
      })
    ).status,
  ).toBe(401);
  expect((await request("auth/login", "POST", recovery)).status).toBe(200);
  expect((await request("auth/login", "POST", recovery)).status).toBe(401);
});
it("email login and password reset cannot bypass 2FA; reset with recovery revokes existing sessions", async () => {
  const a = await account();
  const otp = emailOtp(a.d.target, "login");
  expect((await request("auth/login", "POST", otp)).status).toBe(401);
  const reset = emailOtp(a.d.target, "reset");
  expect(
    (
      await request("auth/reset", "POST", {
        ...reset,
        password: "another-strong-password",
      })
    ).status,
  ).toBe(401);
  expect(
    checkPassword(
      pw,
      one("SELECT password FROM p_users WHERE id=?", a.user.id)!.password,
    ),
  ).toBe(true);
  const valid = emailOtp(a.d.target, "reset");
  expect(
    (
      await request("auth/reset", "POST", {
        ...valid,
        password: "another-strong-password",
        recoveryCode: a.recoveryCodes[1],
      })
    ).status,
  ).toBe(200);
  expect((await request("me", "GET", undefined, a.cookie)).status).toBe(401);
});
it("requires reauthentication for contact and security changes; regenerating recovery revokes old codes and sessions", async () => {
  const a = await account();
  const d = { action: "recovery-regenerate", currentPassword: pw };
  expect((await request("security", "POST", d, a.cookie)).status).toBe(401);
  const change = { ...emailOtp("new@example.test", "contact"), password: pw };
  expect((await request("contact", "POST", change, a.cookie)).status).toBe(401);
  const result = await request(
    "security",
    "POST",
    { ...d, code: nextCode(a.user.id) },
    a.cookie,
  );
  expect(result.status).toBe(200);
  const codes = (await result.json()).recoveryCodes;
  expect(codes).toHaveLength(10);
  expect((await request("me", "GET", undefined, a.cookie)).status).toBe(401);
  expect(
    (
      await request("auth/login", "POST", {
        target: a.d.target,
        password: pw,
        recoveryCode: a.recoveryCodes[0],
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await request("auth/login", "POST", {
        target: a.d.target,
        password: pw,
        recoveryCode: codes[0],
      })
    ).status,
  ).toBe(200);
});
it("rate limits OTP delivery, invalidates old codes on resend, and never returns codes", async () => {
  saveSetting("resend_key", "test-key", true);
  saveSetting("email_from", "test@homay.test");
  const delivered: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      delivered.push(JSON.parse(init.body).text.match(/\d{6}/)[0]);
      return Response.json({ id: randomUUID() });
    }),
  );
  const first = await sendOtp("send@example.test", "register");
  expect(first).not.toHaveProperty("code");
  await expect(sendOtp("send@example.test", "register")).rejects.toMatchObject({
    status: 429,
  });
  run(
    "DELETE FROM limits WHERE key=?",
    "otp-cooldown:" + hash("send@example.test"),
  );
  const second = await sendOtp("send@example.test", "register");
  expect(second.challenge).not.toBe(first.challenge);
  expect(one("SELECT used FROM p_otp WHERE id=?", first.challenge)!.used).toBe(
    1,
  );
  expect(
    one("SELECT code_hash FROM p_otp WHERE id=?", second.challenge)!.code_hash,
  ).not.toBe(delivered[1]);
  vi.unstubAllGlobals();
});
it("rejects cross-origin signup and does not expose financial health internals", async () => {
  const evil = new Request("https://homay.test/api/platform/auth/register", {
    method: "POST",
    headers: {
      origin: "https://evil.test",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  expect((await handle(evil, ["auth", "register"])).status).toBe(403);
  expect(await (await request("income-plan", "GET")).json()).toEqual({
    configured: false,
  });
  saveSetting(
    "commission_policy",
    JSON.stringify({
      directBps: 500,
      levels: [],
      binaryBps: 0,
      maxPayoutBps: 1000,
      warningBps: 4000,
      criticalBps: 6000,
      withdrawMin: 1000,
      withdrawMax: 1000000,
      paused: false,
    }),
  );
  const d = await (await request("income-plan", "GET")).json();
  expect(d.directBps).toBe(500);
  expect(d.criticalBps).toBeUndefined();
});
it("expires authenticator setup and enables a replacement only after proving the new secret", async () => {
  const a = await account();
  const setupPayload = {
    action: "totp-setup",
    currentPassword: pw,
    recoveryCode: a.recoveryCodes[0],
  };
  const setup = await request("security", "POST", setupPayload, a.cookie);
  expect(setup.status).toBe(200);
  const first = await setup.json();
  expect(first.secret).toMatch(/^[A-Z2-7]{32}$/);
  run(
    "UPDATE p_totp_setups SET expires=? WHERE user_id=?",
    Date.now() - 1,
    a.user.id,
  );
  expect(
    (
      await request(
        "security",
        "POST",
        {
          action: "totp-enable",
          currentPassword: pw,
          code: totp(first.secret),
        },
        a.cookie,
      )
    ).status,
  ).toBe(409);
  const second = await (
    await request(
      "security",
      "POST",
      { ...setupPayload, recoveryCode: a.recoveryCodes[1] },
      a.cookie,
    )
  ).json();
  expect(second.secret).not.toBe(first.secret);
  const enabled = await request(
    "security",
    "POST",
    { action: "totp-enable", currentPassword: pw, code: totp(second.secret) },
    a.cookie,
  );
  expect(enabled.status).toBe(200);
  expect((await enabled.json()).recoveryCodes).toHaveLength(10);
  expect(
    decrypt(
      one("SELECT otp_secret FROM p_users WHERE id=?", a.user.id)!.otp_secret,
    ),
  ).toBe(second.secret);
  expect((await request("me", "GET", undefined, a.cookie)).status).toBe(401);
});

it("registers a verified phone using the same invitation, consent and mandatory authenticator flow", async()=>{
 const d=await payload();const target="+989131112233";
 const r=await request("auth/verify-contact","POST",emailOtp(target));expect(r.status).toBe(200);const e=await r.json();
 const input={...d,target,verificationToken:e.verificationToken,totp:totp(e.secret)};
 const result=await request("auth/register","POST",input);expect(result.status).toBe(200);
 const member=one("SELECT email,phone,otp_secret FROM p_users WHERE phone=?",target)!;expect(member.email).toBeNull();expect(member.phone).toBe(target);expect(member.otp_secret).toBeTruthy();
 expect((await request("auth/register","POST",input)).status).toBe(401);
});
