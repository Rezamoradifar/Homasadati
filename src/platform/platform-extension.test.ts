// @vitest-environment node
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { all, one, run, platformDb, now, atomic } from "./schema";
import { handle } from "./api";
import { session, SESSION_COOKIE } from "./security";
import { saveSetting } from "./providers";
import { createOrder, settleOrder, refundOrder } from "./finance";
import { legacyBinaryRules, binaryQuote } from "./network-rules-model";
import { binaryReport } from "./binary-report";
import {
  clubSummary,
  redeemReward,
  reviewRedemption,
  saveReward,
} from "./club";
import { matureLoyalty, loyaltyStatus, pointsNet } from "./loyalty-engine";
import { matureMerchantSales, merchantBalance } from "./merchant-operations";
const dir = mkdtempSync(join(tmpdir(), "homa-complete-"));
let admin: string;
const commissionPolicy = {
  directBps: 0,
  levels: [],
  binaryBps: 1000,
  maxPayoutBps: 3000,
  warningBps: 7000,
  criticalBps: 9000,
  withdrawMin: 1,
  withdrawMax: 1e9,
  paused: false,
};
function member(
  role = "user",
  sponsor: string | null = null,
  parent: string | null = null,
  leg: string | null = null,
) {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,name,password,role,referral_code,sponsor_id,parent_id,leg,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    id,
    "Test " + role,
    "unused",
    role,
    id,
    sponsor,
    parent,
    leg,
    now(),
    now(),
    "test",
  );
  run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
  return id;
}
function product(cancelHours = 0) {
  const id = randomUUID();
  run(
    "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,cancel_hours,created_at,updated_at) VALUES(?,?,?,'craft','product',1000,100,1,?,?,?)",
    id,
    "Product",
    "Only test",
    cancelHours,
    now(),
    now(),
  );
  return id;
}
function buy(user: string, p: string, quantity = 1) {
  return settleOrder(
    createOrder(user, p, quantity, "zarinpal", randomUUID()).id,
    "test-" + randomUUID(),
  );
}
async function request(
  path: string,
  actor: string | null = admin,
  method = "GET",
  data: unknown = {},
) {
  return handle(
    new Request("https://complete.test/api/platform/" + path, {
      method,
      headers: {
        origin: "https://complete.test",
        host: "complete.test",
        "content-type": "application/json",
        cookie: actor ? SESSION_COOKIE + "=" + session(actor, "test") : "",
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(data) }),
    }),
    path.split("?")[0].split("/"),
  );
}
async function post(path: string, data: unknown, actor = admin) {
  const res = await request(path, actor, "POST", data);
  const body = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body;
}
const enablePoints = () =>
  saveSetting(
    "loyalty_policy",
    JSON.stringify({
      enabled: true,
      spendUnit: 100,
      pointsPerUnit: 2,
      expiryDays: 1,
    }),
  );
function reward(points = 10) {
  return saveReward(admin, {
    title: "Reward",
    description: "Test",
    points,
    stock: 10,
    active: true,
    reason: "Test",
  }).id;
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  process.env.APP_ORIGIN = "https://complete.test";
  admin = member("superadmin");
});
beforeEach(() => {
  run("DELETE FROM p_settings WHERE key IN ('binary_rules','loyalty_policy')");
  saveSetting("commission_policy", JSON.stringify(commissionPolicy));
});
afterEach(() => vi.useRealTimers());
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
describe("Binary plan configuration and execution", () => {
  it("combines small FIFO fragments and reverses every source allocation", async () => {
    saveSetting(
      "commission_policy",
      JSON.stringify({
        ...commissionPolicy,
        binaryBps: 10000,
        maxPayoutBps: 10000,
      }),
    );
    await post("admin/binary-rules", {
      rules: { ...legacyBinaryRules, leftRatio: 2 },
      reason: "Fragment test",
    });
    const root = member(),
      l = member("user", root, root, "left"),
      r = member("user", root, root, "right"),
      p = product();
    run("UPDATE p_products SET price=1 WHERE id=?", p);
    buy(l, p);
    const second = buy(l, p);
    buy(r, p);
    const report = binaryReport(root);
    expect(report.matches[0].amount).toBe(1);
    expect(report.left.remaining).toBe(0);
    expect(
      one(
        "SELECT COUNT(*) n FROM p_binary_match_allocations WHERE match_id=?",
        report.matches[0].id,
      )!.n,
    ).toBe(3);
    refundOrder(second.id, admin, true, "Refund non-leading source");
    const after = binaryReport(root);
    expect(after.matches[0].void).toBe(1);
    expect(after.left.remaining).toBe(1);
    expect(after.right.remaining).toBe(1);
  });

  it("uses the simulator formula in live asymmetric matching and enforces a daily cap", async () => {
    const rules = { ...legacyBinaryRules, leftRatio: 2, dailyCap: 60 };
    await post("admin/binary-rules", { rules, reason: "Approved test" });
    const root = member(),
      left = member("user", root, root, "left"),
      right = member("user", root, root, "right"),
      p = product();
    buy(left, p, 2);
    const o = buy(right, p);
    const r = binaryReport(root);
    expect(r.left.remaining).toBe(800);
    expect(r.right.remaining).toBe(400);
    expect(r.dailyEarned).toBe(60);
    const sim = await post("admin/binary-simulate", {
      rules,
      left: 2000,
      right: 1000,
      budget: 300,
      alreadyEarned: 0,
      rateBps: 1000,
      eligible: true,
    });
    expect(sim.amount).toBe(r.matches[0].amount);
    buy(right, p);
    expect(binaryReport(root).dailyEarned).toBe(60);
    refundOrder(o.id, admin, true, "Test");
    const reverted = binaryReport(root);
    expect(reverted.left.remaining).toBe(2000);
    expect(reverted.matches[0].void).toBe(1);
  });
  it("keeps pending orders on their snapshotted rules", async () => {
    const root = member(),
      l = member("user", root, root, "left"),
      r = member("user", root, root, "right"),
      p = product();
    buy(l, p);
    const order = createOrder(r, p, 1, "zarinpal", randomUUID());
    await post("admin/binary-rules", {
      rules: { ...legacyBinaryRules, dailyCap: 1 },
      reason: "New orders only",
    });
    settleOrder(order.id, "snapshot-" + randomUUID());
    expect(binaryReport(root).commissions!.pending).toBe(100);
  });
  it("retains expired volume in history while excluding it from new matches", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    await post("admin/binary-rules", {
      rules: { ...legacyBinaryRules, carryDays: 1 },
      reason: "Expiry test",
    });
    const root = member(),
      l = member("user", root, root, "left"),
      r = member("user", root, root, "right"),
      p = product();
    buy(l, p);
    vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
    buy(r, p);
    const report = binaryReport(root);
    expect(report.left.expired).toBe(1000);
    expect(report.left.remaining).toBe(0);
    expect(report.matches).toHaveLength(0);
    expect(report.rows).toHaveLength(2);
  });
  it("applies activity eligibility without destroying carry and never pays beyond available budget", async () => {
    await post("admin/binary-rules", {
      rules: { ...legacyBinaryRules, personalMinimum: 1000, directMinimum: 2 },
      reason: "Activity test",
    });
    const root = member(),
      l = member("user", root, root, "left"),
      r = member("user", root, root, "right"),
      p = product();
    buy(l, p);
    buy(r, p);
    expect(binaryReport(root).matches).toHaveLength(0);
    buy(root, p);
    buy(r, p);
    expect(binaryReport(root).matches).toHaveLength(1);
    for (const rateBps of [0, 1, 997, 10000]) {
      const q = binaryQuote({
        rules: {
          ...legacyBinaryRules,
          leftRatio: 3,
          rightRatio: 2,
          dailyCap: 37,
        },
        left: 12345,
        right: 6789,
        budget: 29,
        alreadyEarned: 15,
        rateBps,
        eligible: true,
      });
      expect(q.amount).toBeLessThanOrEqual(22);
      expect(q.leftConsumed + q.leftCarry).toBe(12345);
      expect(q.rightConsumed + q.rightCarry).toBe(6789);
    }
  });
  it("rejects invalid rules and never lets simulation create accounting entries", async () => {
    expect(
      (
        await request("admin/binary-rules", admin, "POST", {
          rules: { ...legacyBinaryRules, leftRatio: 0 },
          reason: "Invalid",
        })
      ).status,
    ).toBe(400);
    const before = one("SELECT COUNT(*) n FROM p_ledger")!.n;
    await post("admin/binary-simulate", {
      rules: legacyBinaryRules,
      left: 1000,
      right: 1000,
      budget: 100,
      alreadyEarned: 0,
      rateBps: 1000,
      eligible: true,
    });
    expect(one("SELECT COUNT(*) n FROM p_ledger")!.n).toBe(before);
  });
});
describe("Points lifecycle", () => {
  it("does not award retroactive or unconfigured points and locks rates to each order", () => {
    const u = member(),
      p = product(),
      old = createOrder(u, p, 1, "zarinpal", randomUUID());
    enablePoints();
    settleOrder(old.id, "no-points-" + randomUUID());
    expect(clubSummary(u).balance).toBe(0);
    const o = createOrder(u, p, 1, "zarinpal", randomUUID());
    saveSetting(
      "loyalty_policy",
      JSON.stringify({
        enabled: true,
        spendUnit: 1,
        pointsPerUnit: 100,
        expiryDays: 0,
      }),
    );
    settleOrder(o.id, "points-" + randomUUID());
    expect(clubSummary(u).balance).toBe(20);
  });
  it("holds points until the cancellation window closes and cancels them on an early refund", () => {
    enablePoints();
    const u = member(),
      o = buy(u, product(24));
    expect(clubSummary(u).loyalty.pending).toBe(20);
    expect(clubSummary(u).balance).toBe(0);
    refundOrder(o.id, admin, true, "Refund");
    expect(clubSummary(u).loyalty.pending).toBe(0);
    expect(pointsNet(u)).toBe(0);
  });
  it("reverses spent purchase points into a visible debt and offsets future accruals once", () => {
    enablePoints();
    const u = member(),
      p = product(),
      o = buy(u, p);
    clubSummary(u);
    const redemption = redeemReward(u, {
      rewardId: reward(15),
      idempotencyKey: randomUUID(),
    });
    reviewRedemption(admin, {
      id: redemption.id,
      status: "fulfilled",
      reason: "Delivered",
    });
    refundOrder(o.id, admin, true, "Refund");
    refundOrder(o.id, admin, true, "Retry");
    expect(clubSummary(u).balance).toBe(0);
    expect(clubSummary(u).loyalty.debt).toBe(15);
    buy(u, p);
    expect(clubSummary(u).balance).toBe(5);
    expect(clubSummary(u).loyalty.debt).toBe(0);
    expect(
      one("SELECT available FROM p_wallets WHERE user_id=?", u)!.available,
    ).toBe(1000);
  });
  it("cancels pending rewards funded by a refunded sale without creating point debt", () => {
    enablePoints();
    const u = member(),
      o = buy(u, product());
    const rewardId = reward(15),
      r = redeemReward(u, { rewardId, idempotencyKey: randomUUID() });
    refundOrder(o.id, admin, true, "Refund");
    expect(
      one("SELECT status FROM p_redemptions WHERE id=?", r.id)!.status,
    ).toBe("cancelled");
    expect(clubSummary(u).loyalty.debt).toBe(0);
    expect(clubSummary(u).balance).toBe(0);
    expect(one("SELECT stock FROM p_rewards WHERE id=?", rewardId)!.stock).toBe(
      10,
    );
  });
  it("preserves expiry through reward cancellation and does not charge expired points twice on refund", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    enablePoints();
    const u = member(),
      o = buy(u, product());
    clubSummary(u);
    const r = redeemReward(u, {
      rewardId: reward(10),
      idempotencyKey: randomUUID(),
    });
    vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
    expect(clubSummary(u).balance).toBe(0);
    reviewRedemption(admin, {
      id: r.id,
      status: "cancelled",
      reason: "Expired return",
    });
    expect(clubSummary(u).balance).toBe(0);
    refundOrder(o.id, admin, true, "Expired refund");
    expect(clubSummary(u).loyalty.debt).toBe(0);
  });
  it("expires restored reward lots on the original date and reconciles their order source", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    enablePoints();
    const u = member(),
      o = buy(u, product());
    clubSummary(u);
    const r = redeemReward(u, {
      rewardId: reward(10),
      idempotencyKey: randomUUID(),
    });
    reviewRedemption(admin, {
      id: r.id,
      status: "cancelled",
      reason: "Cancel",
    });
    expect(clubSummary(u).balance).toBe(20);
    vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
    expect(clubSummary(u).balance).toBe(0);
    refundOrder(o.id, admin, true, "Refund");
    expect(clubSummary(u).loyalty.debt).toBe(0);
  });
  it("updates loyalty level on verified purchase and refund, independently of redemption", async () => {
    enablePoints();
    const level = await post("admin/loyalty-levels", {
      name: "Test level",
      threshold: 20,
      benefits: "Test benefit",
      active: true,
      reason: "Test",
    });
    const u = member(),
      o = buy(u, product());
    expect(clubSummary(u).loyalty.current!.id).toBe(level.id);
    redeemReward(u, { rewardId: reward(), idempotencyKey: randomUUID() });
    expect(loyaltyStatus(u).current!.id).toBe(level.id);
    refundOrder(o.id, admin, true, "Refund");
    expect(loyaltyStatus(u).current).toBe(null);
  });
  it("restricts member cancellation to their own open requests", async () => {
    enablePoints();
    const u = member(),
      other = member();
    buy(u, product());
    const r = redeemReward(u, {
      rewardId: reward(),
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await request("loyalty/cancel", other, "POST", {
          id: r.id,
          reason: "Forbidden",
        })
      ).status,
    ).toBe(404);
    await post("loyalty/cancel", { id: r.id, reason: "Cancel my reward" }, u);
    expect(clubSummary(u).balance).toBe(20);
  });
});
describe("Delegated access and sessions", () => {
  it("applies and revokes read-only resource access at the API boundary", async () => {
    const u = member(),
      r = await post("admin/access", {
        name: "Read binary",
        permissions: ["binary:read"],
        active: true,
        reason: "Delegate",
      });
    await post("admin/access/assign", {
      userId: u,
      roleId: r.id,
      assigned: true,
      reason: "Assign",
    });
    expect((await request("admin/binary", u)).status).toBe(200);
    expect((await request("admin/loyalty", u)).status).toBe(403);
    expect((await request("admin/binary", u, "POST")).status).toBe(403);
    expect((await request("admin/access", u)).status).toBe(403);
    expect((await (await request("me", u)).json()).user.permissions).toContain(
      "binary:read",
    );
    await post("admin/access/assign", {
      userId: u,
      roleId: r.id,
      assigned: false,
      reason: "Revoke",
    });
    expect((await request("admin/binary", u)).status).toBe(403);
  });
  it("does not permit wildcard or credential permissions in delegated roles", async () => {
    for (const permissions of [["*"], ["settings:write"], ["access:write"]])
      expect(
        (
          await request("admin/access", admin, "POST", {
            name: randomUUID(),
            permissions,
            active: true,
            reason: "Invalid",
          })
        ).status,
      ).toBe(400);
  });
  it("separates order management from permission to refund money", async () => {
    const u = member(),
      r = await post("admin/access", {
        name: "Orders only",
        permissions: ["orders:read", "orders:write"],
        active: true,
        reason: "Delegate",
      });
    await post("admin/access/assign", {
      userId: u,
      roleId: r.id,
      assigned: true,
      reason: "Assign",
    });
    const o = buy(member(), product());
    expect(
      (
        await request("admin/orders", u, "POST", {
          id: o.id,
          action: "refund",
          reason: "Forbidden",
        })
      ).status,
    ).toBe(403);
  });
  it("rotates the secure session and invalidates the old token atomically", async () => {
    const u = member(),
      token = session(u, "test");
    const req = new Request("https://complete.test/api/platform/auth/refresh", {
      method: "POST",
      headers: {
        origin: "https://complete.test",
        host: "complete.test",
        "content-type": "application/json",
        cookie: SESSION_COOKIE + "=" + token,
      },
      body: "{}",
    });
    const response = await handle(req, ["auth", "refresh"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const old = await handle(
      new Request("https://complete.test/api/platform/me", {
        headers: { cookie: SESSION_COOKIE + "=" + token },
      }),
      ["me"],
    );
    expect(old.status).toBe(401);
  });
});
describe("Merchant accounting and notifications", () => {
  async function setupMerchant() {
    const owner = member(),
      other = member();
    const m = await post("admin/merchants", {
      name: "Merchant",
      category: "Craft",
      city: "Yazd",
      address: "",
      phone: "",
      website: "",
      description: "",
      active: true,
      reason: "Test",
    });
    await post("admin/merchant-operations", {
      merchantId: m.id,
      ownerId: owner,
      shareBps: 6000,
      reference: randomUUID(),
      startsOn: "2020-01-01",
      endsOn: "2099-12-31",
      active: true,
      reason: "Test",
    });
    const p = product();
    await post("admin/merchant-operations/products", {
      merchantId: m.id,
      productId: p,
      reason: "Link",
    });
    return { owner, other, m: m.id, p };
  }
  it("restricts merchant orders by ownership and requires delivery before release", async () => {
    const { owner, other, m, p } = await setupMerchant(),
      o = buy(member(), p);
    atomic(() => matureMerchantSales());
    expect(merchantBalance(m)).toBe(0);
    expect(
      (await (await request("merchant", other)).json()).orders,
    ).toHaveLength(0);
    expect(
      (
        await request("merchant/orders", other, "POST", {
          id: o.id,
          status: "delivered",
          reason: "Forbidden",
        })
      ).status,
    ).toBe(404);
    await post(
      "merchant/orders",
      { id: o.id, status: "delivered", reason: "Delivery" },
      owner,
    );
    atomic(() => matureMerchantSales());
    expect(merchantBalance(m)).toBe(600);
    atomic(() => matureMerchantSales());
    expect(merchantBalance(m)).toBe(600);
  });
  it("records a payment once and carries refund debt into future merchant sales", async () => {
    const { owner, m, p } = await setupMerchant(),
      o = buy(member(), p);
    await post(
      "merchant/orders",
      { id: o.id, status: "delivered", reason: "Delivered" },
      owner,
    );
    atomic(() => matureMerchantSales());
    const payload = {
      merchantId: m,
      amount: 600,
      bankReference: randomUUID(),
      idempotencyKey: randomUUID(),
      reason: "Already paid",
    };
    const first = await post("admin/merchant-settlements", payload);
    expect((await post("admin/merchant-settlements", payload)).id).toBe(
      first.id,
    );
    expect(merchantBalance(m)).toBe(600);
    const checker = member("finance");
    await post(
      "admin/merchant-settlements/review",
      { id: first.id, action: "confirm", reason: "Verified transfer" },
      checker,
    );
    expect(merchantBalance(m)).toBe(0);
    refundOrder(o.id, admin, true, "Refund after settlement");
    expect(merchantBalance(m)).toBe(-600);
    expect(
      (
        await request("admin/merchant-settlements", admin, "POST", {
          ...payload,
          idempotencyKey: randomUUID(),
          bankReference: randomUUID(),
          amount: 1,
        })
      ).status,
    ).toBe(409);
    const next = buy(member(), p);
    await post(
      "merchant/orders",
      { id: next.id, status: "delivered", reason: "Delivered" },
      owner,
    );
    atomic(() => matureMerchantSales());
    expect(merchantBalance(m)).toBe(0);
    expect(() =>
      run("DELETE FROM p_merchant_ledger WHERE merchant_id=?", m),
    ).toThrow();
  });
  it("blocks inactive contracts and combined merchant/network allocation above sale value", async () => {
    const { m, p } = await setupMerchant();
    run(
      "UPDATE p_merchant_contracts SET share_bps=9000 WHERE merchant_id=?",
      m,
    );
    expect(() => buy(member(), p)).toThrow();
    run("UPDATE p_merchant_contracts SET active=0 WHERE merchant_id=?", m);
    expect(() => buy(member(), p)).toThrow();
  });
  it("queues a targeted announcement only once and validates all recipients atomically", async () => {
    const u = member(),
      payload = {
        userIds: [u],
        title: "News",
        body: "Message",
        reason: "Test",
        idempotencyKey: randomUUID(),
      };
    await post("admin/notifications", payload);
    await post("admin/notifications", payload);
    expect(
      one("SELECT COUNT(*) n FROM p_notifications WHERE user_id=?", u)!.n,
    ).toBe(1);
    expect(
      (
        await request("admin/notifications", admin, "POST", {
          ...payload,
          body: "Changed",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request("admin/notifications", admin, "POST", {
          ...payload,
          userIds: [u, randomUUID()],
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe(404);
    expect(
      one("SELECT COUNT(*) n FROM p_notifications WHERE user_id=?", u)!.n,
    ).toBe(1);
  });
});
