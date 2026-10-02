// @vitest-environment node
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { testIdentity } from "./test-identity";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { handle } from "./api";
import { run, one, now, platformDb } from "./schema";
import { saveSetting } from "./providers";
import { hash } from "../server/http";
import { totp, session, passwordHash } from "./security";
import { TERMS_VERSION } from "./registration-model";
const directory = mkdtempSync(join(tmpdir(), "homa-google-")),
  audience = "123-test.apps.googleusercontent.com",
  password = "long-google-password-123";
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
function request(path: string, data: any = {}, cookie = "") {
  return handle(
    new Request("https://homa.test/api/platform/" + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://homa.test",
        host: "homa.test",
        cookie,
      },
      body: JSON.stringify(data),
    }),
    path.split("/"),
  );
}
function jwt(
  nonce: string,
  sub: string,
  email: string,
  overrides: any = {},
  key = pair.privateKey,
) {
  const timestamp = Math.floor(Date.now() / 1000),
    head = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test" })).toString(
      "base64url",
    ),
    body = Buffer.from(
      JSON.stringify({
        iss: "https://accounts.google.com",
        aud: audience,
        sub,
        email,
        email_verified: true,
        nonce,
        iat: timestamp,
        exp: timestamp + 300,
        ...overrides,
      }),
    ).toString("base64url"),
    signed = head + "." + body;
  return (
    signed +
    "." +
    sign("RSA-SHA256", Buffer.from(signed), key).toString("base64url")
  );
}
async function challenge(intent = "register", cookie = "") {
  const r = await request("auth/google-challenge", { intent }, cookie);
  expect(r.status).toBe(200);
  return r.json();
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "db.sqlite");
  process.env.APP_ORIGIN = "https://homa.test";
  process.env.PLATFORM_MASTER_KEY = "d".repeat(64);
  saveSetting("google_client_id", audience);
  vi.spyOn(
    OAuth2Client.prototype,
    "getFederatedSignonCertsAsync",
  ).mockResolvedValue({
    certs: {
      test: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    },
    format: "PEM" as any,
  });
});
beforeEach(() => run("DELETE FROM limits"));
afterAll(() => {
  vi.restoreAllMocks();
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});
it("uses real signature verification and rejects wrong audience, issuer, nonce, expiry and signature", async () => {
  for (const overrides of [
    { aud: "another-client" },
    { iss: "https://evil.test" },
    { nonce: "wrong" },
    { exp: 1 },
    { email_verified: false },
  ]) {
    const c = await challenge();
    expect(
      (
        await request("auth/google", {
          intent: "register",
          challenge: c.challenge,
          credential: jwt(c.nonce, randomUUID(), "member@gmail.com", overrides),
        })
      ).status,
    ).toBe(401);
  }
  const c = await challenge();
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  expect(
    (
      await request("auth/google", {
        intent: "register",
        challenge: c.challenge,
        credential: jwt(
          c.nonce,
          randomUUID(),
          "member@gmail.com",
          {},
          other.privateKey,
        ),
      })
    ).status,
  ).toBe(401);
});
it("does not auto-link an existing email or trust a third-party email as a registration factor", async () => {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,email,name,password,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",
    id,
    "existing@gmail.com",
    "Existing",
    passwordHash(password),
    id,
    now(),
    now(),
    "test",
  );
  for (const [email, status] of [
    ["existing@gmail.com", 409],
    ["external@example.test", 400],
  ] as const) {
    const c = await challenge();
    expect(
      (
        await request("auth/google", {
          intent: "register",
          challenge: c.challenge,
          credential: jwt(c.nonce, randomUUID(), email),
        })
      ).status,
    ).toBe(status);
  }
});
it("requires consent and authenticator enrollment, then requires second factor on Google login and rejects replay", async () => {
  const subject = randomUUID(),
    email = randomUUID() + "@gmail.com",
    c = await challenge(),
    credential = jwt(c.nonce, subject, email);
  const verification = await request("auth/google", {
    intent: "register",
    challenge: c.challenge,
    credential,
  });
  expect(verification.status).toBe(200);
  const e = await verification.json();
  expect(
    (
      await request("auth/google", {
        intent: "register",
        challenge: c.challenge,
        credential,
      })
    ).status,
  ).toBe(401);
  const payload = {
    target: email,
    password,
    verificationToken: e.verificationToken,
    totp: totp(e.secret),
    details: {
      firstName: "Member",
      lastName: "Test",
      country: "Iran",
      city: "Tehran",
      language: "fa",
      interests: [],
    },
    invitationMode: "without-code",
    ...testIdentity(),
    termsAccepted: true,
    privacyAccepted: true,
    adultConfirmed: true,
    termsVersion: TERMS_VERSION,
  };
  expect(
    (await request("auth/register", { ...payload, termsAccepted: false }))
      .status,
  ).toBe(400);
  const registered = await request("auth/register", payload);
  expect(registered.status).toBe(200);
  const result = await registered.json();
  expect(
    one("SELECT user_id FROM p_google_identities WHERE subject=?", subject)
      ?.user_id,
  ).toBe(result.user.id);
  const login = await challenge("login"),
    r = await request("auth/google", {
      intent: "login",
      challenge: login.challenge,
      credential: jwt(login.nonce, subject, email),
    }),
    t = await r.json();
  expect(t.twoFactor).toBe(true);
  expect(
    (await request("auth/google-login", { ticket: t.googleTicket })).status,
  ).toBe(401);
  const signed = await request("auth/google-login", {
    ticket: t.googleTicket,
    recoveryCode: result.recoveryCodes[0],
  });
  expect(signed.status).toBe(200);
  expect(signed.headers.get("set-cookie")).toBeTruthy();
  expect(
    (
      await request("auth/google-login", {
        ticket: t.googleTicket,
        recoveryCode: result.recoveryCodes[1],
      })
    ).status,
  ).toBe(401);
});
it("binds linking to the authenticated account and password; unlink revokes pending Google login tickets", async () => {
  const id = randomUUID(),
    sub = randomUUID();
  run(
    "INSERT INTO p_users(id,email,name,password,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",
    id,
    "link-" + id + "@gmail.com",
    "Member",
    passwordHash(password),
    id,
    now(),
    now(),
    "test",
  );
  const token = session(id, "test"),
    cookie = "homay_session=" + token;
  const { SESSION_COOKIE } = await import("./security");
  const correctCookie = SESSION_COOKIE + "=" + token;
  const c = await challenge("link", correctCookie);
  expect(
    (
      await request(
        "auth/google",
        {
          intent: "link",
          challenge: c.challenge,
          credential: jwt(c.nonce, sub, "controlled@gmail.com"),
          password: "wrong",
        },
        correctCookie,
      )
    ).status,
  ).toBe(401);
  const next = await challenge("link", correctCookie);
  expect(
    (
      await request(
        "auth/google",
        {
          intent: "link",
          challenge: next.challenge,
          credential: jwt(next.nonce, sub, "controlled@gmail.com"),
          password,
        },
        correctCookie,
      )
    ).status,
  ).toBe(200);
  expect(
    one("SELECT * FROM p_sessions WHERE token_hash=?", hash(token)),
  ).toBeUndefined();
  const pending = await challenge("login"),
    res = await request("auth/google", {
      intent: "login",
      challenge: pending.challenge,
      credential: jwt(pending.nonce, sub, "controlled@gmail.com"),
    }),
    ticket = await res.json();
  const cookie2 = SESSION_COOKIE + "=" + session(id, "test");
  expect(
    (
      await request(
        "security",
        { action: "google-unlink", currentPassword: password },
        cookie2,
      )
    ).status,
  ).toBe(200);
  expect(
    (await request("auth/google-login", { ticket: ticket.googleTicket }))
      .status,
  ).toBe(401);
});
