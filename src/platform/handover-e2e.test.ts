// @vitest-environment node
/**
 * Handover scenario: the whole business path through the real API, database
 * and settlement engine. Only the outside providers (email, payment gateway)
 * are simulated. Run it before any release that touches money or the plan.
 */
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handle } from "./api";
import { platformDb, run, one, now } from "./schema";
import { saveSetting } from "./providers";
import { passwordHash, session, SESSION_COOKIE, totp } from "./security";
import { runCardSettlement, memberCardStatus, voucherBalance } from "./seven-card-engine";
import { wallet } from "./finance";
import { db } from "../server/db";

const directory = mkdtempSync(join(tmpdir(), "homay-handover-"));
const DAY = 86400_000;
const M = 1_000_000;
let admin = "", payer = "", productId = "", lastCode = "", authority = "";

function request(path: string, method = "GET", payload?: unknown, cookie = "") {
  return handle(
    new Request("https://homay.test/api/platform/" + path, {
      method,
      headers: { origin: "https://homay.test", host: "homay.test", "Content-Type": "application/json", cookie },
      ...(method !== "GET" ? { body: JSON.stringify(payload || {}) } : {}),
    }),
    path.split("?")[0].split("/"),
  );
}
async function ok(res: Response | Promise<Response>, status = 200) {
  const r = await res;
  const body = await r.json().catch(() => ({}));
  if (r.status !== status) throw new Error(`HTTP ${r.status}: ${JSON.stringify(body)}`);
  return body;
}
function staff(role: string) {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,email,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?)",
    id, id.slice(0, 8) + "@staff.test", "کارمند " + role, passwordHash("staff-strong-password"), role,
    "staff-" + id.slice(0, 6), now(), now(), "fixture",
  );
  run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
  return SESSION_COOKIE + "=" + session(id, "test");
}
/** Sign-up exactly as a member does it: email code and details only. */
async function signUp(email: string, referral?: string) {
  const sent = await ok(request("auth/otp", "POST", { target: email, purpose: "register" }));
  const verified = await ok(request("auth/verify-email", "POST", { target: email, challenge: sent.challenge, code: lastCode }));
  const r = await request("auth/register", "POST", {
    target: email,
    verificationToken: verified.verificationToken,
    invitationMode: referral ? "with-code" : "without-code",
    referral: referral || "",
    details: { firstName: email.split("@")[0], lastName: "آزمون", country: "ایران", city: "تهران" },
    termsAccepted: true,
    privacyAccepted: true,
    adultConfirmed: true,
    termsVersion: "2026-09-20-v1",
  });
  const body = await r.json();
  if (r.status !== 200) throw new Error("register " + JSON.stringify(body));
  return { cookie: r.headers.get("set-cookie")!.split(";")[0], user: body.user };
}
/** Buy through the payment gateway, as a member would. */
async function buy(cookie: string, quantity: number) {
  const order = await ok(request("orders", "POST", { productId, quantity, method: "zarinpal", idempotencyKey: randomUUID() }, cookie), 201);
  await ok(request("orders/" + order.id + "/payment", "POST", {}, cookie));
  const back = await request("payment/callback?Authority=" + authority + "&Status=OK");
  expect(back.status).toBe(303);
  expect(back.headers.get("location")).toContain("payment=paid");
  return order.id as string;
}

beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "handover.sqlite");
  process.env.PLATFORM_MASTER_KEY = "c".repeat(64);
  process.env.APP_ORIGIN = "https://homay.test";
  admin = staff("superadmin");
  payer = staff("finance");
  saveSetting("resend_key", "test-provider-key", true);
  saveSetting("email_from", "no-reply@homay.test");
  saveSetting("zarinpal_merchant", "test-merchant", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body));
      if (url.includes("resend")) {
        lastCode = String(payload.text).match(/^\d{6}$/m)![0];
        return Response.json({ id: randomUUID() });
      }
      if (url.includes("request.json")) {
        authority = "A" + randomUUID().replaceAll("-", "");
        return Response.json({ data: { code: 100, authority } });
      }
      if (url.includes("verify.json")) return Response.json({ data: { code: 100, ref_id: Date.now(), card_pan: "603799******7893", fee: 0 } });
      throw new Error("unexpected provider " + url);
    }),
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});

it("runs the business end to end: setup, sign-ups, purchases, settlement, withdrawal, refund", async () => {
  // 1. Admin setup: finance policy, a product, plan rules, activation without a budget cap.
  await ok(request("admin/policy", "POST", {
    policy: { directBps: 0, levels: [], binaryBps: 0, maxPayoutBps: 3000, warningBps: 5000, criticalBps: 8000, withdrawMin: M, withdrawMax: 500 * M, paused: false },
    reason: "handover setup",
  }, admin));
  productId = (await ok(request("admin/products", "POST", {
    title: "قندان مسی فیروزه‌کوب", description: "ساخت اصفهان", vertical: "craft", subtype: "copper",
    price: 10 * M, stock: 10000, images: [], taxonomy: [], published: true, duration_days: 30, cancel_hours: 0,
  }, admin))).id;
  const plan = await ok(request("admin/seven-card-plan", "GET", undefined, admin));
  await ok(request("admin/seven-card-plan", "POST", {
    decisions: { overflow: "split-reward", counterScope: "member", voucherCountsTowardCap: true, topology: "own-desks", purchaseCredit: "purchase-value", weekStart: 6 },
    revision: plan.revision ?? 0,
    reason: "owner decisions",
  }, admin));
  await ok(request("admin/seven-card-live", "POST", { live: true, unlimitedBudget: true, reason: "go live" }, admin));
  const since = Date.now();
  while (Date.now() <= since + 2);

  // 2. Sign-ups and placement: company → A (left), B (right); C under A.
  const company = await signUp("company@homay.test");
  const code = company.user.referral_code;
  const a = await signUp("ali@homay.test", code);
  const b = await signUp("bita@homay.test", code);
  const c = await signUp("cyrus@homay.test", a.user.referral_code);
  expect(one("SELECT leg,parent_id FROM p_users WHERE id=?", a.user.id)).toEqual({ leg: "left", parent_id: company.user.id });
  expect(one("SELECT leg,parent_id FROM p_users WHERE id=?", b.user.id)).toEqual({ leg: "right", parent_id: company.user.id });
  expect(one("SELECT otp_secret FROM p_users WHERE id=?", a.user.id)!.otp_secret).toBeNull();

  // 3. Purchases through the gateway.
  await buy(company.cookie, 1); // 10m: Javaneh
  await buy(a.cookie, 3); // 30m on the company's left
  const bOrder = await buy(b.cookie, 3); // 30m on the company's right
  await buy(c.cookie, 7); // 70m single purchase: Simurgh cashback; also left volume
  expect(one("SELECT COUNT(*) n FROM p_gateway_transactions WHERE status='paid'")!.n).toBe(4);

  // 4. Weekly settlement.
  const weeks = runCardSettlement(Date.now() + 8 * DAY);
  expect(weeks.length).toBeGreaterThan(0);
  expect(memberCardStatus(company.user.id)).toMatchObject({ level: 1, desks: 1, leftVolume: 70 * M, rightVolume: 0 });
  expect(wallet(company.user.id).available).toBe(5_400_000);
  expect(memberCardStatus(c.user.id).level).toBe(7);
  expect(wallet(c.user.id).available).toBe(6 * M); // Simurgh cashback
  expect(voucherBalance(company.user.id)).toBe(0);

  // 5. What members see: tree, referral, dashboard.
  const tree = await ok(request("network-tree", "GET", undefined, company.cookie));
  expect(tree.tree.left).toMatchObject({ members: 2, volume: 100 * M });
  expect(tree.tree.right).toMatchObject({ members: 1, volume: 30 * M });
  expect(await ok(request("referral", "GET", undefined, company.cookie))).toMatchObject({ active: true, directMembers: 2, directBuyers: 2 });
  await ok(request("dashboard", "GET", undefined, company.cookie));

  // 6. Withdrawal: authenticator via email code (no password), bank details, approval, payment.
  const waitAMinute = () => db().prepare("DELETE FROM limits").run(); // one code per email per minute
  waitAMinute();
  const sec = await ok(request("security/code", "POST", {}, company.cookie));
  const setup = await ok(request("security", "POST", { action: "totp-setup", emailChallenge: sec.challenge, emailCode: lastCode }, company.cookie));
  const step = Math.floor(Date.now() / 30000);
  await ok(request("security", "POST", { action: "totp-enable", code: totp(setup.secret, step) }, company.cookie));
  // Enabling signs every device out; sign back in with an email code and the authenticator.
  waitAMinute();
  const login = await ok(request("auth/otp", "POST", { target: "company@homay.test", purpose: "login" }));
  run("UPDATE p_users SET otp_last=? WHERE id=?", step - 2, company.user.id); // time passes
  const signedIn = await request("auth/login", "POST", { target: "company@homay.test", challenge: login.challenge, code: lastCode, totp: totp(setup.secret, step - 1) });
  expect(signedIn.status).toBe(200);
  const cookie = signedIn.headers.get("set-cookie")!.split(";")[0];
  run("UPDATE p_users SET otp_last=? WHERE id=?", step - 2, company.user.id);
  await ok(request("payout-profile", "POST", {
    holderName: "شرکت هما نت", nationalId: "0012345679", cardNumber: "6037991234567893", iban: "IR062960000000100324200001",
    totp: totp(setup.secret, step - 1),
  }, cookie));
  await ok(request("admin/payout-profiles", "PATCH", { userId: company.user.id, status: "verified", reason: "" }, admin));
  run("UPDATE p_users SET otp_last=? WHERE id=?", step - 2, company.user.id);
  const w = await ok(request("withdrawals", "POST", { amount: 5 * M, idempotencyKey: randomUUID(), totp: totp(setup.secret, step - 1) }, cookie), 201);
  expect(w.iban).toBe("IR062960000000100324200001");
  await ok(request("admin/withdrawals", "PATCH", { id: w.id, status: "approved", reason: "checked" }, admin));
  await ok(request("admin/withdrawals", "PATCH", { id: w.id, status: "paid", reason: "transferred", reference: "PAYA-" + Date.now() }, payer));
  expect(wallet(company.user.id)).toMatchObject({ available: 400_000, held: 0 });

  // 7. Refund of B's order reverses the match behind the paid reward: the rest becomes debt.
  await ok(request("admin/orders", "PATCH", { id: bOrder, action: "refund", reason: "customer returned the item" }, admin));
  expect(wallet(company.user.id)).toMatchObject({ available: 0, debt: 5_000_000 });
  expect(memberCardStatus(company.user.id)).toMatchObject({ rightVolume: 0 });
});
