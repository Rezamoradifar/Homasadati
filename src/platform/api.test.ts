// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handle } from "./api";
import { platformDb, run, one, now } from "./schema";
import { saveSetting } from "./providers";
import { passwordHash, session, SESSION_COOKIE } from "./security";
const directory = mkdtempSync(join(tmpdir(), "homay-platform-e2e-"));
let admin: string,
  adminId: string,
  buyer: string,
  sponsor: string,
  sponsorId: string,
  productId: string,
  orderId: string,
  challenge: string,
  code: string,
  authority: string;
const pw = "test-strong-password-2026";
function request(path: string, method = "GET", payload?: unknown, cookie = "") {
  return handle(
    new Request("https://homay.test/api/platform/" + path, {
      method,
      headers: {
        origin: "https://homay.test",
        host: "homay.test",
        "Content-Type": "application/json",
        cookie,
      },
      ...(method !== "GET" ? { body: JSON.stringify(payload || {}) } : {}),
    }),
    path.split("?")[0].split("/"),
  );
}
async function register(target: string, referral?: string) {
  const sent = await request("auth/otp", "POST", {
    target,
    purpose: "register",
  });
  expect(sent.status).toBe(200);
  const d = await sent.json();
  expect(d.code).toBeUndefined();
  const response = await request("auth/register", "POST", {
    target,
    password: pw,
    name: "عضو آزمون",
    challenge: d.challenge,
    code,
    referral,
  });
  expect(response.status).toBe(200);
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    user: (await response.json()).user,
  };
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "e2e.sqlite");
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
  process.env.APP_ORIGIN = "https://homay.test";
  adminId = randomUUID();
  run(
    "INSERT INTO p_users(id,email,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,'superadmin',?,?,?,?)",
    adminId,
    "admin@test.example",
    "مدیر آزمون",
    passwordHash(pw),
    "admin-code",
    now(),
    now(),
    "fixture",
  );
  run("INSERT INTO p_wallets(user_id) VALUES(?)", adminId);
  admin = SESSION_COOKIE + "=" + session(adminId, "test");
  saveSetting("resend_key", "test-provider-key", true);
  saveSetting("email_from", "test@homay.test");
  saveSetting("zarinpal_merchant", "test-merchant", true);
  // Only the provider boundary is simulated. Auth, APIs, RBAC, ledger and SQLite are real.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body));
      if (url.includes("resend")) {
        code = payload.text.match(/\d{6}/)[0];
        return Response.json({ id: randomUUID() });
      }
      if (url.includes("request.json")) {
        authority = "A" + randomUUID().replaceAll("-", "");
        return Response.json({ data: { code: 100, authority } });
      }
      if (url.includes("verify.json")) {
        expect(payload.amount).toBe(1000000);
        return Response.json({ data: { code: 100, ref_id: 123456789 } });
      }
      throw new Error("Unexpected provider endpoint");
    }),
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});
describe("User/admin API end-to-end with real isolated SQLite", () => {
  it("requires admin RBAC and stores encrypted provider secrets", async () => {
    expect((await request("admin/users")).status).toBe(401);
    const r = await request("admin/settings", "GET", undefined, admin);
    const d = await r.json();
    expect(d.rows.find((x: any) => x.key === "resend_key").value).toBe("");
    expect(
      one("SELECT value FROM p_settings WHERE key='resend_key'")!.value,
    ).not.toContain("test-provider-key");
  });
  it("registers verified sponsor and buyer using actual hashed OTP challenges", async () => {
    const s = await register("sponsor@test.example");
    sponsor = s.cookie;
    sponsorId = s.user.id;
    const b = await register("buyer@test.example", s.user.referral_code);
    buyer = b.cookie;
    expect(
      (await request("admin/products", "GET", undefined, buyer)).status,
    ).toBe(403);
    const dashboard = await (
      await request("dashboard", "GET", undefined, buyer)
    ).json();
    expect(dashboard.wallet.available).toBe(0);
  });
  it("configures policy and creates a published real product through admin API", async () => {
    const p = await request(
      "admin/policy",
      "POST",
      {
        policy: {
          directBps: 1000,
          levels: [],
          binaryBps: 0,
          maxPayoutBps: 3000,
          warningBps: 5000,
          criticalBps: 8000,
          withdrawMin: 1000,
          withdrawMax: 1000000,
          paused: false,
        },
        reason: "Test policy",
      },
      admin,
    );
    expect(p.status).toBe(200);
    const r = await request(
      "admin/products",
      "POST",
      {
        title: "محصول آزمون",
        description: "فقط در دیتابیس موقت تست",
        vertical: "craft",
        subtype: "product",
        price: 100000,
        stock: 5,
        images: [],
        taxonomy: [],
        published: true,
        duration_days: 30,
        cancel_hours: 0,
      },
      admin,
    );
    expect(r.status).toBe(200);
    productId = (await r.json()).id;
  });
  it("purchases, verifies payment server-side, calculates commission and downloads PDF", async () => {
    const order = await request(
      "orders",
      "POST",
      {
        productId,
        quantity: 1,
        method: "zarinpal",
        idempotencyKey: randomUUID(),
      },
      buyer,
    );
    expect(order.status).toBe(201);
    orderId = (await order.json()).id;
    const payment = await request(
      "orders/" + orderId + "/payment",
      "POST",
      {},
      buyer,
    );
    expect(payment.status).toBe(200);
    const callback = await request("payment/callback?Authority=" + authority);
    expect(callback.status).toBe(303);
    expect(
      (await request("payment/callback?Authority=" + authority)).status,
    ).toBe(303);
    expect(
      one("SELECT COUNT(*) n FROM p_commissions WHERE order_id=?", orderId)!.n,
    ).toBe(1);
    const pdf = await request(
      "orders/" + orderId + "/invoice",
      "GET",
      undefined,
      buyer,
    );
    expect(pdf.status).toBe(200);
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
  });
  it("requests withdrawal and admin approval debits the held wallet atomically", async () => {
    const r = await request(
      "withdrawals",
      "POST",
      {
        amount: 9000,
        iban: "IR062960000000100324200001",
        idempotencyKey: randomUUID(),
      },
      sponsor,
    );
    expect(r.status).toBe(201);
    const w = await r.json();
    expect(
      one("SELECT available,held FROM p_wallets WHERE user_id=?", sponsorId),
    ).toEqual({ available: 1000, held: 9000 });
    const approval = await request(
      "admin/withdrawals",
      "PATCH",
      { id: w.id, status: "approved", reason: "Verified account" },
      admin,
    );
    expect(approval.status).toBe(200);
    expect(
      one("SELECT available,held FROM p_wallets WHERE user_id=?", sponsorId),
    ).toEqual({ available: 1000, held: 0 });
    expect(
      one("SELECT status FROM p_withdrawals WHERE id=?", w.id)!.status,
    ).toBe("approved");
    expect(
      one(
        "SELECT COUNT(*) n FROM p_audit WHERE action='withdrawal.approved' AND actor_id=?",
        adminId,
      )!.n,
    ).toBe(1);
  });
  it("blocks IDOR, malicious amounts, insufficient roles, invalid input and cross-origin mutation", async () => {
    expect(
      (await request("orders/" + orderId, "GET", undefined, sponsor)).status,
    ).toBe(404);
    expect(
      (
        await request(
          "withdrawals",
          "POST",
          { amount: -1, iban: "bad", idempotencyKey: randomUUID() },
          sponsor,
        )
      ).status,
    ).toBe(400);
    run("UPDATE p_users SET role='content' WHERE id=?", sponsorId);
    expect(
      (await request("admin/withdrawals", "GET", undefined, sponsor)).status,
    ).toBe(403);
    expect(
      (
        await request(
          "admin/settings",
          "POST",
          { key: "resend_key", value: "hack", reason: "bad" },
          sponsor,
        )
      ).status,
    ).toBe(403);
    const evil = new Request("https://homay.test/api/platform/profile", {
      method: "PATCH",
      headers: {
        origin: "https://evil.test",
        "Content-Type": "application/json",
        cookie: buyer,
      },
      body: "{}",
    });
    expect((await handle(evil, ["profile"])).status).toBe(403);
  });
  it("exports real report data to CSV and Excel and revokes all sessions", async () => {
    const csv = await request(
      "admin/reports?format=csv",
      "GET",
      undefined,
      admin,
    );
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain("100000");
    const excel = await request(
      "admin/reports?format=xlsx",
      "GET",
      undefined,
      admin,
    );
    expect(excel.headers.get("Content-Type")).toContain("spreadsheetml");
    const revoke = await request(
      "security",
      "POST",
      { action: "revoke", currentPassword: pw },
      buyer,
    );
    expect(revoke.status).toBe(200);
    expect((await request("me", "GET", undefined, buyer)).status).toBe(401);
  });
});
