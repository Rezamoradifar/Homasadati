// @vitest-environment node
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { platformDb, one, all, run, now, atomic, Row } from "./schema";
import { session, SESSION_COOKIE } from "./security";
import { handle } from "./api";
import { saveSetting } from "./providers";
import {
  createOrder,
  settleOrder,
  refundOrder,
  mature,
  requestWithdrawal,
  reviewWithdrawal,
  wallet,
  ledger,
  moveMember,
} from "./finance";
import { runBinaryCycles } from "./binary-schedule";
import { binaryCycle } from "./operations-model";
import { legacyBinaryRules } from "./network-rules-model";
import { saveMerchant } from "./club";
import {
  saveContract,
  linkMerchantProduct,
  matureMerchantSales,
  recordMerchantPayment,
  reviewMerchantPayment,
  merchantBalance,
  merchantReserved,
} from "./merchant-operations";
const dir = mkdtempSync(join(tmpdir(), "homa-operations-"));
const policy = {
  directBps: 1000,
  levels: [],
  binaryBps: 1000,
  maxPayoutBps: 3000,
  warningBps: 7000,
  criticalBps: 9000,
  withdrawMin: 1,
  withdrawMax: 1e9,
  paused: false,
};
let admin: string,
  staff: string,
  second: string,
  customer: string,
  outsider: string;
function member(
  role = "user",
  parent: string | null = null,
  leg: string | null = null,
  sponsor: string | null = parent,
) {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,email,name,password,role,referral_code,parent_id,leg,sponsor_id,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    id,
    id + "@fixture.test",
    "Fixture",
    "unused",
    role,
    id,
    parent,
    leg,
    sponsor,
    now(),
    now(),
    "test",
  );
  run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
  return id;
}
function product(cancel = 0) {
  const id = randomUUID();
  run(
    "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,cancel_hours,created_at,updated_at) VALUES(?,?,?,'craft','product',1000,1000,1,?,?,?)",
    id,
    "Fixture",
    "Test",
    cancel,
    now(),
    now(),
  );
  return id;
}
function buy(user: string, p: string) {
  return settleOrder(
    createOrder(user, p, 1, "zarinpal", randomUUID()).id,
    randomUUID(),
  );
}
async function request(
  path: string,
  actor: string | null = customer,
  method = "GET",
  data: unknown = {},
) {
  return handle(
    new Request("https://operations.test/api/platform/" + path, {
      method,
      headers: {
        origin: "https://operations.test",
        host: "operations.test",
        "content-type": "application/json",
        cookie: actor ? SESSION_COOKIE + "=" + session(actor, "test") : "",
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(data) }),
    }),
    path.split("?")[0].split("/"),
  );
}
async function ok(
  path: string,
  actor: string,
  method = "POST",
  data: unknown = {},
) {
  const r = await request(path, actor, method, data);
  const body = await r.json();
  expect(r.status, JSON.stringify(body)).toBe(200);
  return body;
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  process.env.APP_ORIGIN = "https://operations.test";
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-21T22:00:00Z"));
  run("DELETE FROM p_settings WHERE key IN ('binary_schedule','binary_rules')");
  saveSetting("commission_policy", JSON.stringify(policy));
  admin = member("superadmin");
  staff = member("support");
  second = member("finance");
  customer = member();
  outsider = member();
});
afterEach(() => vi.useRealTimers());
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
const ticket = () => ({
  subject: "Help with order",
  body: "Private customer message",
  category: "order",
  priority: "normal",
  orderId: null,
  idempotencyKey: randomUUID(),
});
describe("Private support workflow", () => {
  it("creates once, enforces ownership, and never exposes internal notes", async () => {
    const input = ticket(),
      t = await ok("tickets", customer, "POST", input);
    expect((await ok("tickets", customer, "POST", input)).id).toBe(t.id);
    expect(
      (
        await request("tickets", customer, "POST", {
          ...input,
          body: "Changed",
        })
      ).status,
    ).toBe(409);
    expect((await request("tickets/" + t.id, outsider)).status).toBe(404);
    expect((await request("admin/tickets", outsider)).status).toBe(403);
    expect((await request("tickets/" + t.id, null)).status).toBe(401);
    const note = {
      body: "Staff confidential note",
      internal: true,
      idempotencyKey: randomUUID(),
    };
    expect(
      (await request("tickets/" + t.id + "/replies", customer, "POST", note))
        .status,
    ).toBe(403);
    await ok("admin/tickets/" + t.id + "/replies", staff, "POST", note);
    await ok("admin/tickets/" + t.id + "/replies", staff, "POST", note);
    const publicView = await ok("tickets/" + t.id, customer, "GET");
    expect(publicView.rows).toHaveLength(1);
    expect(JSON.stringify(publicView)).not.toContain(note.body);
    expect((await ok("admin/tickets/" + t.id, staff, "GET")).rows).toHaveLength(
      2,
    );
    expect(
      one("SELECT COUNT(*) n FROM p_notifications WHERE user_id=?", customer)!
        .n,
    ).toBe(0);
    await ok("admin/tickets/" + t.id + "/replies", staff, "POST", {
      body: "Public answer",
      idempotencyKey: randomUUID(),
    });
    expect(one("SELECT status FROM p_tickets WHERE id=?", t.id)!.status).toBe(
      "waiting_user",
    );
    expect(
      one("SELECT COUNT(*) n FROM p_notifications WHERE user_id=?", customer)!
        .n,
    ).toBe(1);
  });
  it("checks order ownership, assignment access, and concurrent edits", async () => {
    const order = buy(outsider, product());
    expect(
      (
        await request("tickets", customer, "POST", {
          ...ticket(),
          orderId: order.id,
        })
      ).status,
    ).toBe(404);
    const t = await ok("tickets", customer, "POST", ticket());
    const edit = {
      status: "waiting_user",
      priority: "high",
      assigneeId: outsider,
      expectedVersion: 1,
      reason: "Review",
    };
    expect(
      (await request("admin/tickets/" + t.id, staff, "PATCH", edit)).status,
    ).toBe(403);
    await ok("admin/tickets/" + t.id, staff, "PATCH", {
      ...edit,
      assigneeId: staff,
    });
    expect(
      (
        await request("admin/tickets/" + t.id, staff, "PATCH", {
          ...edit,
          assigneeId: staff,
        })
      ).status,
    ).toBe(409);
    await ok("tickets/" + t.id, customer, "PATCH", {
      expectedVersion: 2,
      reason: "Solved",
    });
    await ok("tickets/" + t.id + "/replies", customer, "POST", {
      body: "Follow-up",
      idempotencyKey: randomUUID(),
    });
    expect(one("SELECT status FROM p_tickets WHERE id=?", t.id)!.status).toBe(
      "waiting_support",
    );
    expect(
      (
        await request("tickets/" + t.id, customer, "PATCH", {
          expectedVersion: 4,
          reason: "Admin injection",
          status: "waiting_user",
        })
      ).status,
    ).toBe(400);
  });
  it("does not expose internal messages across paginated history", async () => {
    const t = await ok("tickets", customer, "POST", ticket());
    for (let i = 0; i < 35; i++)
      run(
        "INSERT INTO p_ticket_messages VALUES(?,?,?,?,1,?,?,?)",
        randomUUID(),
        t.id,
        staff,
        "private-" + i,
        randomUUID(),
        "{}",
        now(),
      );
    const view = await ok("tickets/" + t.id, customer, "GET");
    expect(view.rows).toHaveLength(1);
    expect(view.hasMore).toBe(false);
    const page = await ok("admin/tickets/" + t.id, staff, "GET");
    expect(page.rows).toHaveLength(30);
    expect(page.hasMore).toBe(true);
  });
});
function fundWithdrawal() {
  const buyer = member("user", null, null, customer);
  buy(buyer, product());
  atomic(mature);
  return requestWithdrawal(customer, 50, "fixture-iban", randomUUID());
}
describe("Independent payment authorization", () => {
  it("rejects self review and same-person payment; retries never debit twice", async () => {
    const w = fundWithdrawal();
    run("UPDATE p_users SET role='finance' WHERE id=?", customer);
    expect(() => reviewWithdrawal(w.id, customer, "approved", "Self")).toThrow(
      "self_payment_review",
    );
    reviewWithdrawal(w.id, admin, "approved", "Checked");
    expect(() =>
      reviewWithdrawal(w.id, admin, "paid", "Same actor", "bank-1"),
    ).toThrow("second_approver_required");
    reviewWithdrawal(w.id, second, "paid", "Verified", "bank-" + w.id);
    reviewWithdrawal(w.id, second, "paid", "Retry", "bank-" + w.id);
    expect(() =>
      reviewWithdrawal(w.id, second, "paid", "Conflict", "different"),
    ).toThrow("idempotency_conflict");
    expect(wallet(customer).held).toBe(0);
    expect(
      one(
        "SELECT COUNT(*) n FROM p_ledger WHERE event_key=?",
        "approve:" + w.id,
      )!.n,
    ).toBe(1);
    const listing = await ok("admin/withdrawals", admin, "GET");
    expect(listing.rows.find((r: Row) => r.id === w.id).first_actor).toBe(
      admin,
    );
  });
  it("rechecks revoked approvers and permits return of reserved money", () => {
    const w = fundWithdrawal();
    reviewWithdrawal(w.id, admin, "approved", "Checked");
    run("UPDATE p_users SET blocked=1 WHERE id=?", admin);
    expect(() =>
      reviewWithdrawal(w.id, second, "paid", "Revoked", "ref-" + w.id),
    ).toThrow("forbidden");
    reviewWithdrawal(w.id, second, "rejected", "Return funds");
    expect(wallet(customer).available).toBe(100);
  });
  it("rolls back the review and held balance when audit storage rejects a write", () => {
    const w = fundWithdrawal();
    platformDb().exec(
      `CREATE TEMP TRIGGER fail_review BEFORE INSERT ON p_audit WHEN NEW.entity_id='${w.id}' BEGIN SELECT RAISE(ABORT,'audit test failure'); END;`,
    );
    try {
      expect(() =>
        reviewWithdrawal(w.id, admin, "approved", "Rollback"),
      ).toThrow();
      expect(wallet(customer).held).toBe(50);
      expect(
        one("SELECT * FROM p_withdrawal_reviews WHERE withdrawal_id=?", w.id),
      ).toBeUndefined();
    } finally {
      platformDb().exec("DROP TRIGGER fail_review");
    }
  });
  it("requires a fresh first approver for previously approved legacy requests", () => {
    const w = fundWithdrawal();
    atomic(() => {
      ledger(
        customer,
        "legacy-" + w.id,
        "withdrawal_approved",
        w.id,
        0,
        0,
        -50,
      );
      run("UPDATE p_withdrawals SET status='approved' WHERE id=?", w.id);
    });
    expect(() =>
      reviewWithdrawal(w.id, second, "paid", "Missing approver", "legacy-ref"),
    ).toThrow("first_approval_required");
    reviewWithdrawal(w.id, admin, "approved", "Legacy review");
    reviewWithdrawal(
      w.id,
      second,
      "paid",
      "Checked transfer",
      "legacy-" + w.id,
    );
    expect(wallet(customer).held).toBe(0);
  });
  it("reserves merchant payments, blocks same-person confirmation and handles refund before confirmation", () => {
    const merchant = saveMerchant(admin, {
      name: "Merchant",
      category: "craft",
      city: "Tehran",
      address: "Fixture",
      phone: "",
      website: "",
      description: "Fixture",
      active: true,
      reason: "Test",
    }).id;
    saveContract(admin, {
      merchantId: merchant,
      ownerId: customer,
      shareBps: 5000,
      reference: "contract",
      startsOn: "2026-01-01",
      endsOn: "2027-12-31",
      active: true,
      reason: "Test",
    });
    const p = product();
    linkMerchantProduct(admin, {
      merchantId: merchant,
      productId: p,
      reason: "Test",
    });
    const order = buy(outsider, p);
    run("UPDATE p_orders SET status='delivered' WHERE id=?", order.id);
    atomic(matureMerchantSales);
    const input = {
      merchantId: merchant,
      amount: 400,
      bankReference: randomUUID(),
      idempotencyKey: randomUUID(),
      reason: "Recorded transfer",
    };
    const review = recordMerchantPayment(admin, input);
    expect(merchantReserved(merchant)).toBe(400);
    expect(merchantBalance(merchant)).toBe(500);
    expect(() =>
      recordMerchantPayment(second, {
        ...input,
        amount: 101,
        idempotencyKey: randomUUID(),
        bankReference: randomUUID(),
      }),
    ).toThrow("insufficient_balance");
    expect(() =>
      reviewMerchantPayment(admin, {
        id: review.id,
        action: "confirm",
        reason: "Same",
      }),
    ).toThrow("second_approver_required");
    refundOrder(order.id, admin, true, "Returned before review");
    expect(() =>
      reviewMerchantPayment(second, {
        id: review.id,
        action: "confirm",
        reason: "No balance",
      }),
    ).toThrow("insufficient_balance");
    reviewMerchantPayment(second, {
      id: review.id,
      action: "reject",
      reason: "Refund",
    });
    expect(merchantReserved(merchant)).toBe(0);
    expect(merchantBalance(merchant)).toBe(0);
  });
});
function scheduledPair(cancel = 0) {
  saveSetting(
    "binary_schedule",
    JSON.stringify({ mode: "daily", hour: 3, weekday: 6 }),
  );
  const root = member(),
    left = member("user", root, "left"),
    right = member("user", root, "right"),
    p = product(cancel);
  const a = buy(left, p),
    b = buy(right, p);
  return { root, left, right, p, a, b };
}
describe("Funded periodic binary cycles", () => {
  it("runs after the Tehran boundary without a new purchase and carries a daily cap forward", () => {
    saveSetting(
      "binary_rules",
      JSON.stringify({ ...legacyBinaryRules, dailyCap: 50 }),
    );
    const pair = scheduledPair();
    expect(
      one(
        "SELECT COUNT(*) n FROM p_commissions WHERE user_id=? AND kind='binary'",
        pair.root,
      )!.n,
    ).toBe(0);
    runBinaryCycles();
    expect(
      one(
        "SELECT COUNT(*) n FROM p_binary_order_cycles WHERE order_id IN (?,?)",
        pair.a.id,
        pair.b.id,
      )!.n,
    ).toBe(0);
    vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
    runBinaryCycles();
    runBinaryCycles();
    expect(
      one(
        "SELECT SUM(amount) n FROM p_commissions WHERE user_id=? AND kind='binary'",
        pair.root,
      )!.n,
    ).toBe(50);
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));
    runBinaryCycles();
    expect(
      one(
        "SELECT SUM(amount) n FROM p_commissions WHERE user_id=? AND kind='binary'",
        pair.root,
      )!.n,
    ).toBe(100);
    for (const order of [pair.a, pair.b])
      expect(
        one(
          "SELECT COALESCE(SUM(amount),0) n FROM p_commissions WHERE order_id=? AND status!='reversed'",
          order.id,
        )!.n,
      ).toBeLessThanOrEqual(300);
  });
  it("does not pay expired volume and preserves original placement and maturity", () => {
    const pair = scheduledPair(48);
    moveMember(pair.left, null, null, null, admin, "Move future placement");
    vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
    runBinaryCycles();
    const c = one(
      "SELECT * FROM p_commissions WHERE user_id=? AND kind='binary'",
      pair.root,
    )!;
    expect(c.amount).toBe(100);
    expect(c.available_at >= pair.a.cancel_until).toBe(true);
    atomic(mature);
    expect(wallet(pair.root).available).toBe(0);
    refundOrder(pair.a.id, admin, true, "Funding or source refund");
    expect(
      one("SELECT status FROM p_commissions WHERE id=?", c.id)!.status,
    ).toBe("reversed");
    const other = scheduledPair();
    run(
      "UPDATE p_binary_lot_terms SET expires_at=? WHERE lot_id IN (SELECT id FROM p_binary_lots WHERE user_id=?)",
      now(),
      other.root,
    );
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));
    runBinaryCycles();
    expect(
      one(
        "SELECT COUNT(*) n FROM p_commissions WHERE user_id=? AND kind='binary'",
        other.root,
      )!.n,
    ).toBe(0);
  });
  it("does not consume future-period volume or bypass a manual payout pause", () => {
    saveSetting(
      "binary_schedule",
      JSON.stringify({ mode: "daily", hour: 3, weekday: 6 }),
    );
    const root = member(),
      l = member("user", root, "left"),
      r = member("user", root, "right"),
      p = product();
    buy(l, p);
    vi.setSystemTime(new Date("2026-09-22T01:00:00Z"));
    buy(r, p);
    runBinaryCycles();
    expect(
      one(
        "SELECT COUNT(*) n FROM p_commissions WHERE user_id=? AND kind='binary'",
        root,
      )!.n,
    ).toBe(0);
    vi.setSystemTime(new Date("2026-09-23T01:00:00Z"));
    saveSetting(
      "commission_policy",
      JSON.stringify({ ...policy, paused: true }),
    );
    expect(runBinaryCycles().paused).toBe(true);
    saveSetting("commission_policy", JSON.stringify(policy));
    runBinaryCycles();
    expect(
      one(
        "SELECT SUM(amount) n FROM p_commissions WHERE user_id=? AND kind='binary'",
        root,
      )!.n,
    ).toBe(100);
  });
  it("uses snapshotted schedule and stops unrelated members changing it", async () => {
    const pair = scheduledPair();
    await ok("admin/binary-schedule", admin, "POST", {
      schedule: { mode: "immediate", hour: 12, weekday: 0 },
      reason: "Future orders",
    });
    expect(
      (
        await request("admin/binary-schedule", customer, "POST", {
          schedule: { mode: "daily", hour: 0, weekday: 0 },
          reason: "Forbidden",
        })
      ).status,
    ).toBe(403);
    vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
    runBinaryCycles();
    expect(
      one(
        "SELECT COUNT(*) n FROM p_binary_order_cycles WHERE order_id=?",
        pair.a.id,
      )!.n,
    ).toBe(1);
  });
  it("selects weekly boundaries across Tehran midnight correctly", () => {
    expect(
      binaryCycle(
        { mode: "weekly", hour: 3, weekday: 6 },
        new Date("2026-09-26T00:00:00Z"),
      )?.cutoff,
    ).toBe("2026-09-25T23:30:00.000Z");
    expect(
      binaryCycle(
        { mode: "daily", hour: 0, weekday: 0 },
        new Date("2026-09-21T21:00:00Z"),
      )?.cutoff,
    ).toBe("2026-09-21T20:30:00.000Z");
    expect(binaryCycle({ mode: "immediate", hour: 0, weekday: 0 })).toBeNull();
  });
});
