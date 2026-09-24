// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { platformDb, run, one, now, atomic } from "./schema";
import { saveSetting } from "./providers";
import {
  createOrder,
  settleOrder,
  refundOrder,
  requestWithdrawal,
  reviewWithdrawal,
  wallet,
  mature,
  moveMember,
  health,
} from "./finance";
const directory = mkdtempSync(join(tmpdir(), "homay-finance-"));
let root: string,
  left: string,
  right: string,
  product: string,
  financeA: string,
  financeB: string;
const config = {
  directBps: 1000,
  levels: [500],
  binaryBps: 1000,
  maxPayoutBps: 3000,
  warningBps: 5000,
  criticalBps: 8000,
  withdrawMin: 1,
  withdrawMax: 1000000000,
  paused: false,
};
function member(
  sponsor: string | null = null,
  parent: string | null = null,
  leg: string | null = null,
) {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,name,password,referral_code,sponsor_id,parent_id,leg,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?)",
    id,
    "Fixture",
    "unused",
    id.slice(0, 8),
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
function buy(user: string, amount = 100000) {
  run("UPDATE p_products SET price=? WHERE id=?", amount, product);
  const o = createOrder(user, product, 1, "zarinpal", randomUUID());
  return settleOrder(o.id, "test-bank-" + randomUUID());
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "finance.sqlite");
});
afterAll(() => {
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});
beforeEach(() => {
  run("DELETE FROM p_ranks");
  saveSetting("commission_policy", JSON.stringify(config));
  financeA = member();
  financeB = member();
  run(
    "UPDATE p_users SET role='finance' WHERE id IN (?,?)",
    financeA,
    financeB,
  );
  root = member();
  left = member(root, root, "left");
  right = member(root, root, "right");
  product = randomUUID();
  run(
    "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,duration_days,cancel_hours,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    product,
    "Fixture product",
    "Only test DB",
    "craft",
    "product",
    100000,
    100,
    30,
    0,
    now(),
    now(),
  );
  run("UPDATE p_products SET published=1 WHERE id=?", product);
});
describe("Financial invariants", () => {
  it("simple sale awards direct percentage from paid toman only and is idempotent", () => {
    const order = buy(left);
    expect(wallet(root).pending).toBe(10000);
    settleOrder(order.id, order.payment_ref);
    expect(wallet(root).pending).toBe(10000);
    expect(one("SELECT stock FROM p_products WHERE id=?", product)!.stock).toBe(
      99,
    );
  });
  it("pays different direct and level percentages through multiple sponsors", () => {
    const child = member(left);
    buy(child);
    expect(wallet(left).pending).toBe(10000);
    expect(wallet(root).pending).toBe(5000);
  });
  it("matches binary legs once and carries excess actual sales", () => {
    buy(left, 200000);
    buy(right, 100000);
    expect(wallet(root).pending + wallet(root).available).toBe(40000);
    expect(
      one(
        "SELECT SUM(remaining) n FROM p_binary_lots WHERE user_id=? AND leg='left'",
        root,
      )!.n,
    ).toBe(100000);
  });
  it("awards attained rank within the order payout ceiling", () => {
    run(
      "INSERT INTO p_ranks VALUES(?,?,?,?,?)",
      randomUUID(),
      "Fixture rank",
      0,
      100000,
      1000,
    );
    const order = buy(left);
    expect(
      one(
        "SELECT SUM(amount) n FROM p_commissions WHERE order_id=? AND kind='rank'",
        order.id,
      )!.n,
    ).toBeGreaterThan(0);
  });
  it("never exceeds the configured cap with levels rank and binary", () => {
    saveSetting(
      "commission_policy",
      JSON.stringify({ ...config, maxPayoutBps: 1500 }),
    );
    buy(left);
    const o = buy(right);
    expect(
      one("SELECT SUM(amount) n FROM p_commissions WHERE order_id=?", o.id)!.n,
    ).toBeLessThanOrEqual(15000);
  });
  it("reserves withdrawals, rejects a competing debit and approves atomically", () => {
    buy(left);
    atomic(mature);
    const w = requestWithdrawal(root, 9000, "test-iban", randomUUID());
    expect(wallet(root).available).toBeLessThan(9000);
    expect(() =>
      requestWithdrawal(root, 9000, "test-iban", randomUUID()),
    ).toThrow("insufficient_balance");
    reviewWithdrawal(w.id, financeA, "approved", "reviewed");
    expect(wallet(root).held).toBe(0);
    expect(
      one("SELECT status FROM p_withdrawals WHERE id=?", w.id)!.status,
    ).toBe("approved");
    reviewWithdrawal(w.id, financeA, "approved", "retry");
    expect(wallet(root).held).toBe(0);
  });
  it("serializes competing processes sharing the same SQLite file", async () => {
    buy(left);
    atomic(mature);
    const child = () =>
      new Promise<string>((resolve, reject) => {
        const p = spawn(
          process.execPath,
          ["--import", "tsx", "tests/withdraw-race.ts", root],
          { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test" } },
        );
        let out = "";
        let err = "";
        p.stdout.on("data", (b) => (out += b));
        p.stderr.on("data", (b) => (err += b));
        p.on("error", reject);
        p.on("exit", (code) =>
          code === 0 ? resolve(out) : reject(new Error(err)),
        );
      });
    const results = await Promise.all([child(), child()]);
    expect(results.sort()).toEqual(["accepted", "rejected"]);
    expect(wallet(root).held).toBe(9000);
    expect(wallet(root).available).toBe(1000);
  });
  it("rolls back wallet deduction when audit insertion fails", () => {
    buy(left);
    atomic(mature);
    const w = requestWithdrawal(root, 1000, "test", randomUUID());
    expect(() =>
      reviewWithdrawal(w.id, "missing-user", "approved", "bad actor"),
    ).toThrow();
    expect(wallet(root).held).toBe(1000);
    expect(
      one("SELECT status FROM p_withdrawals WHERE id=?", w.id)!.status,
    ).toBe("pending");
  });
  it("refunds once, reverses direct and binary, restores remaining leg", () => {
    const l = buy(left);
    buy(right);
    refundOrder(l.id, root, true, "test");
    expect(
      one(
        "SELECT SUM(remaining) n FROM p_binary_lots WHERE user_id=? AND leg='right'",
        root,
      )!.n,
    ).toBe(100000);
    expect(wallet(left).available).toBe(100000);
    refundOrder(l.id, root, true, "retry");
    expect(wallet(left).available).toBe(100000);
  });
  it("refunds a late verified payment exactly once after order expiry", () => {
    const order = createOrder(left, product, 1, "zarinpal", randomUUID());
    run(
      "UPDATE p_orders SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?",
      order.id,
    );
    refundOrder(order.id, root, true, "expired");
    settleOrder(order.id, "late-" + order.id);
    settleOrder(order.id, "late-" + order.id);
    expect(wallet(left).available).toBe(100000);
    expect(wallet(root).pending).toBe(0);
    expect(one("SELECT stock FROM p_products WHERE id=?", product)!.stock).toBe(
      100,
    );
  });
  it("blocks debt-bearing approved payouts and nets debt when rejected", () => {
    const order = buy(left);
    atomic(mature);
    const request = requestWithdrawal(root, 10000, "test", randomUUID());
    reviewWithdrawal(request.id, financeA, "approved", "verified");
    refundOrder(order.id, root, true, "return after approval");
    expect(wallet(root).debt).toBe(10000);
    expect(() =>
      reviewWithdrawal(request.id, financeB, "paid", "bank", "bank-ref"),
    ).toThrow();
    reviewWithdrawal(
      request.id,
      financeA,
      "rejected",
      "returned before transfer",
    );
    expect(wallet(root).debt).toBe(0);
    expect(wallet(root).available).toBe(0);
  });
  it("uses actual cash payouts as well as commissions for financial health", () => {
    const order = buy(left);
    atomic(mature);
    const request = requestWithdrawal(root, 10000, "test", randomUUID());
    reviewWithdrawal(request.id, financeA, "approved", "checked");
    reviewWithdrawal(
      request.id,
      financeB,
      "paid",
      "bank transfer",
      "paid-" + request.id,
    );
    refundOrder(order.id, root, true, "return after transfer");
    const day = now().slice(0, 10);
    const h = health(day, "9999");
    expect(h.paid).toBeGreaterThanOrEqual(10000);
    // Set threshold below real cash ratio but above the reversed sale's zero liability.
    saveSetting(
      "commission_policy",
      JSON.stringify({ ...config, warningBps: 0, criticalBps: 1 }),
    );
    expect(health().status).toBe("red");
  });
  it("enforces critical payout freeze and prevents network cycles", () => {
    buy(left);
    saveSetting(
      "commission_policy",
      JSON.stringify({ ...config, paused: true }),
    );
    expect(() => requestWithdrawal(root, 1, "test", randomUUID())).toThrow(
      "payouts_paused",
    );
    expect(() => moveMember(root, left, null, null, root, "cycle")).toThrow(
      "network_cycle",
    );
  });
});
