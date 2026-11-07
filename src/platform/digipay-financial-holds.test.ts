// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { all, now, one, platformDb, run, type Row } from "./schema";
import { saveSetting } from "./providers";
import { calculateCommissions, ledger, matchBinaryForOrder, mature, rankProgress, wallet } from "./finance";
import { accrueOrderPoints, matureLoyalty, pointsNet } from "./loyalty-engine";
import { matureMerchantSales, merchantBalance } from "./merchant-operations";
import { binaryEligible } from "./network-rules";
import { legacyBinaryRules } from "./network-rules-model";
import { runBinaryCycles } from "./binary-schedule";
import { companyPositionStatus } from "./company-members";
import { positionDesks } from "./card-positions";
import { memberCardStatus, releaseCardRewards, runCardSettlement, voucherBalance, weekStartAt } from "./seven-card-engine";

const directory = mkdtempSync(join(tmpdir(), "homa-digipay-holds-"));
const DAY = 86400_000, WEEK = 7 * DAY, M = 1_000_000;
const CLOCK = Date.UTC(2026, 10, 6, 12);
const PAST = new Date(CLOCK - 3 * DAY).toISOString();
const CANCELLED_WINDOW = new Date(CLOCK - 2 * DAY).toISOString();
const decisions = { overflow: "carry-whole", counterScope: "desk", voucherCountsTowardCap: true, topology: "own-desks", purchaseCredit: "purchase-value", weekStart: 1 };
const policy = { directBps: 0, levels: [], binaryBps: 1000, maxPayoutBps: 3000, warningBps: 5000, criticalBps: 8000, withdrawMin: 1, withdrawMax: 1_000_000_000, paused: false, binaryRules: legacyBinaryRules, loyaltyPolicy: { enabled: true, spendUnit: 10_000, pointsPerUnit: 1, expiryDays: 365 } };
let beneficiary: string, buyer: string, product: string;

function member(sponsor: string | null = null) {
  const id = randomUUID();
  run("INSERT INTO p_users(id,name,password,referral_code,sponsor_id,preferences,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?)", id, "Financial fixture", "unused", id, sponsor, '{"email":false,"sms":false,"inApp":true}', PAST, PAST, "test");
  run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
  return id;
}

/** Paid records are fixtures only; provider verification is tested separately. */
function paidOrder(user = buyer, amount = 100_000, snapshot: object = policy) {
  const id = randomUUID();
  run("INSERT INTO p_orders(id,user_id,product_id,title,vertical,quantity,unit_price,amount,status,payment_method,policy,cancel_until,expires_at,created_at,paid_at,idem_key) VALUES(?,?,?,?,?,1,?,?,'delivered','digipay',?,?,?,?,?,?)", id, user, product, "Fixture", "craft", amount, amount, JSON.stringify(snapshot), CANCELLED_WINDOW, now(), PAST, PAST, id);
  return one("SELECT * FROM p_orders WHERE id=?", id)!;
}

/** Model the immutable card-engine snapshot recorded during real settlement. */
function paidCardOrder(user: string, amount: number) {
  const earlier = one("SELECT COUNT(*) n FROM p_orders WHERE user_id=? AND paid_at IS NOT NULL", user)!.n;
  return paidOrder(user, amount, { ...policy, binaryEngine: "cards-v1", initialPaidPurchase: earlier === 0 });
}

function hold(order: Row, status = "pending") {
  const checkout = randomUUID(), payment = randomUUID(), refund = randomUUID();
  run("INSERT INTO p_checkouts(id,user_id,amount,method,status,payload,created_at,expires_at,idem_key) VALUES(?,?,?,'digipay','paid','{}',?,?,?)", checkout, order.user_id, order.amount, PAST, now(), checkout);
  run("INSERT INTO p_checkout_items VALUES(?,?)", checkout, order.id);
  run("INSERT INTO p_digipay_payments(id,checkout_id,user_id,environment,amount,amount_rial,status,basket,tracking_code,payment_type,created_at,updated_at,verified_at) VALUES(?,?,?,'sandbox',?,?,'paid','{}',?,5,?,?,?)", payment, checkout, order.user_id, order.amount, order.amount * 10, payment, PAST, now(), PAST);
  run("INSERT INTO p_digipay_refunds(id,payment_id,order_id,actor_id,reason,amount_rial,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", refund, payment, order.id, order.user_id, "Fixture refund", order.amount * 10, status, now(), now());
  return refund;
}

function rejectRefund(refund: string) {
  run("UPDATE p_digipay_refunds SET status='failed',updated_at=? WHERE id=?", now(), refund);
}

function commission(order: Row, kind = "direct", amount = 10_000) {
  const id = randomUUID();
  run("INSERT INTO p_commissions VALUES(?,?,?,?,?,'pending',?,?,?)", id, beneficiary, order.id, kind, amount, CANCELLED_WINDOW, PAST, id);
  ledger(beneficiary, "earn:" + id, "commission", id, 0, amount);
  return id;
}

function lot(table: "p_binary_lots" | "p_card_lots" | "p_card_position_lots", order: Row, leg: "left" | "right", amount = order.amount) {
  const id = randomUUID();
  if (table === "p_card_position_lots")
    run("INSERT INTO p_card_position_lots VALUES(?,?,?,1,?,?,?,0,?)", id, order.id, beneficiary, leg, amount, amount, PAST);
  else run(`INSERT INTO ${table} VALUES(?,?,?,?,?,?,0,?)`, id, order.id, beneficiary, leg, amount, amount, PAST);
  return id;
}

function counted(order: Row) {
  run("INSERT INTO p_card_orders VALUES(?,?,?,?,?)", order.id, order.user_id, order.amount, CANCELLED_WINDOW, PAST);
}

function enroll(position = false) {
  saveSetting("seven_card_live", "1");
  saveSetting("seven_card_live_since", String(weekStartAt(CLOCK, 1)));
  saveSetting("seven_card_budget_unlimited", "1");
  saveSetting("seven_card_plan_draft", JSON.stringify({ decisions, revision: 1 }));
  if (position) {
    saveSetting("seven_card_schedule_version", "2026-10-06");
    saveSetting("seven_card_position_version", "seven-level-manual-2026-10-07");
  }
  const qualifying = paidOrder(beneficiary, 10 * M);
  counted(qualifying);
  run("INSERT INTO p_card_members VALUES(?,?,1,1,?)", beneficiary, 10 * M, PAST);
  return qualifying;
}

const settleWeek = (week = 1) => runCardSettlement(weekStartAt(CLOCK, 1) + week * WEEK + 3600_000);

beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "holds.sqlite");
  platformDb();
});
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(CLOCK);
  platformDb().exec("BEGIN");
  saveSetting("commission_policy", JSON.stringify(policy));
  beneficiary = member(); buyer = member(beneficiary); product = randomUUID();
  run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at) VALUES(?,?,?,'craft','product',100000,100,1,?,?)", product, "Fixture", "Only test database", PAST, PAST);
});
afterEach(() => {
  if (platformDb().inTransaction) platformDb().exec("ROLLBACK");
  vi.useRealTimers();
});
afterAll(() => { platformDb().close(); rmSync(directory, { recursive: true, force: true }); });

describe("refund financial holds", () => {
  it.each(["requesting", "pending", "review", "succeeded"])("keeps commission, loyalty and merchant proceeds pending for %s", (status) => {
    const order = paidOrder(); hold(order, status); const c = commission(order);
    accrueOrderPoints(order);
    const merchant = randomUUID();
    run("INSERT INTO p_merchants VALUES(?,?,?,?,?,?,?,?,1,?,?)", merchant, "Fixture", "craft", "city", "address", "phone", "", "test", PAST, PAST);
    run("INSERT INTO p_merchant_sales VALUES(?,?,50000,'fixture',?,'pending')", order.id, merchant, CANCELLED_WINDOW);
    const before = one("SELECT COUNT(*) n FROM p_ledger")!.n;
    mature(); matureLoyalty(buyer); matureMerchantSales();
    expect(one("SELECT status FROM p_commissions WHERE id=?", c)!.status).toBe("pending");
    expect(wallet(beneficiary)).toMatchObject({ available: 0, pending: 10_000, debt: 0 });
    expect(pointsNet(buyer)).toBe(0); expect(merchantBalance(merchant)).toBe(0);
    expect(one("SELECT status FROM p_loyalty_accruals WHERE order_id=?", order.id)!.status).toBe("pending");
    expect(one("SELECT status FROM p_merchant_sales WHERE order_id=?", order.id)!.status).toBe("pending");
    expect(one("SELECT COUNT(*) n FROM p_ledger")!.n).toBe(before);
    expect(one("SELECT refunded_at FROM p_orders WHERE id=?", order.id)!.refunded_at).toBeNull();
  });

  it("resumes once after provider rejection while unrelated purchases mature normally", () => {
    const heldOrder = paidOrder(), normalOrder = paidOrder();
    const refund = hold(heldOrder); commission(heldOrder); commission(normalOrder);
    accrueOrderPoints(heldOrder); accrueOrderPoints(normalOrder);
    mature(); matureLoyalty();
    expect(wallet(beneficiary)).toMatchObject({ available: 10_000, pending: 10_000 });
    expect(pointsNet(buyer)).toBe(10);
    rejectRefund(refund); mature(); matureLoyalty(); mature(); matureLoyalty();
    expect(wallet(beneficiary)).toMatchObject({ available: 20_000, pending: 0 });
    expect(pointsNet(buyer)).toBe(20);
  });

  it.each([false, true])("holds binary commissions funded by a different order (multi-allocation=%s)", (multi) => {
    const source = paidOrder(), trigger = paidOrder(), other = paidOrder();
    const heldLot = lot("p_binary_lots", source, "left");
    const leftLot = multi ? lot("p_binary_lots", other, "left") : heldLot;
    const rightLot = lot("p_binary_lots", trigger, "right");
    const c = commission(trigger, "binary"), match = randomUUID();
    run("INSERT INTO p_binary_matches VALUES(?,?,?,?,?,0)", match, leftLot, rightLot, 100_000, c);
    if (multi) run("INSERT INTO p_binary_match_allocations VALUES(?,?,?)", match, heldLot, 50_000);
    const refund = hold(source);
    mature(); expect(wallet(beneficiary).available).toBe(0);
    rejectRefund(refund); mature(); mature();
    expect(wallet(beneficiary)).toMatchObject({ available: 10_000, pending: 0 });
  });

  it("skips held FIFO lots without consuming them or starving a later eligible source", () => {
    const heldOrder = paidOrder(), goodOrder = paidOrder(), trigger = paidOrder();
    const heldLot = lot("p_binary_lots", heldOrder, "left"), goodLot = lot("p_binary_lots", goodOrder, "left");
    lot("p_binary_lots", trigger, "right"); hold(heldOrder);
    run("UPDATE p_binary_lots SET created_at=? WHERE id=?", new Date(CLOCK - 4 * DAY).toISOString(), heldLot);
    expect(matchBinaryForOrder(trigger, beneficiary, 10_000)).toEqual({ matches: 1, budget: 0 });
    expect(one("SELECT remaining FROM p_binary_lots WHERE id=?", heldLot)!.remaining).toBe(100_000);
    expect(one("SELECT remaining FROM p_binary_lots WHERE id=?", goodLot)!.remaining).toBe(0);
  });

  it("does not consume any lots or complete a scheduled cycle for a held trigger", () => {
    const schedule = { mode: "daily", hour: 3, weekday: 1 };
    const trigger = paidOrder(buyer, 100_000, { ...policy, binarySchedule: schedule });
    const leftLot = lot("p_binary_lots", paidOrder(), "left"), rightLot = lot("p_binary_lots", trigger, "right");
    run("INSERT INTO p_binary_scheduled_orders(order_id,schedule,paid_at) VALUES(?,?,?)", trigger.id, JSON.stringify(schedule), PAST);
    const refund = hold(trigger);
    expect(matchBinaryForOrder(trigger, beneficiary, 10_000)).toEqual({ matches: 0, budget: 10_000 });
    expect(runBinaryCycles().processed).toBe(0);
    expect(one("SELECT last_cycle FROM p_binary_scheduled_orders WHERE order_id=?", trigger.id)!.last_cycle).toBeNull();
    expect(one("SELECT COUNT(*) n FROM p_binary_order_cycles")!.n).toBe(0);
    expect(all("SELECT remaining FROM p_binary_lots WHERE id IN (?,?)", leftLot, rightLot).map(l => l.remaining)).toEqual([100_000, 100_000]);
    rejectRefund(refund); expect(runBinaryCycles().processed).toBe(1);
  });

  it("holds personal/direct binary qualification without changing the thresholds", () => {
    const personal = paidOrder(beneficiary), direct = paidOrder(buyer);
    const personalRefund = hold(personal), directRefund = hold(direct);
    const rules = { ...legacyBinaryRules, personalMinimum: 100_000, directMinimum: 1 };
    expect(binaryEligible(beneficiary, rules)).toBe(false);
    rejectRefund(personalRefund); expect(binaryEligible(beneficiary, rules)).toBe(false);
    rejectRefund(directRefund); expect(binaryEligible(beneficiary, rules)).toBe(true);
  });

  it("defers new card volume and Simurgh cashback until the refund is rejected", () => {
    enroll(); const order = paidCardOrder(buyer, 70 * M), refund = hold(order);
    settleWeek();
    expect(one("SELECT order_id FROM p_card_orders WHERE order_id=?", order.id)).toBeUndefined();
    expect(wallet(buyer).available).toBe(0);
    rejectRefund(refund); settleWeek(2);
    expect(one("SELECT order_id FROM p_card_orders WHERE order_id=?", order.id)).toBeDefined();
    expect(wallet(buyer).available).toBe(6 * M);
    settleWeek(2); expect(wallet(buyer).available).toBe(6 * M);
  });

  it("does not make a later purchase the first purchase while an earlier refund is unresolved", () => {
    enroll(); const first = paidCardOrder(buyer, 10 * M), later = paidCardOrder(buyer, 70 * M);
    run("UPDATE p_orders SET cancel_until=? WHERE id=?", new Date(CLOCK - DAY).toISOString(), later.id);
    const refund = hold(first); settleWeek();
    expect(one("SELECT COUNT(*) n FROM p_card_orders WHERE user_id=?", buyer)!.n).toBe(0);
    rejectRefund(refund); settleWeek(2);
    expect(one("SELECT COUNT(*) n FROM p_card_orders WHERE user_id=?", buyer)!.n).toBe(2);
    expect(wallet(buyer).available).toBe(0);
  });

  it.each([false, true])("uses only unheld existing card source lots (position=%s)", (position) => {
    enroll(position);
    const heldOrder = paidOrder(buyer, 30 * M), unheld = paidOrder(buyer, 30 * M), opposite = paidOrder(buyer, 30 * M);
    [heldOrder, unheld, opposite].forEach(counted);
    const table = position ? "p_card_position_lots" : "p_card_lots";
    const heldLot = lot(table, heldOrder, "left"), goodLot = lot(table, unheld, "left");
    lot(table, opposite, "right"); hold(heldOrder);
    expect(settleWeek()[0]?.matches).toBe(1);
    expect(one(`SELECT remaining FROM ${table} WHERE id=?`, heldLot)!.remaining).toBe(30 * M);
    expect(one(`SELECT remaining FROM ${table} WHERE id=?`, goodLot)!.remaining).toBe(0);
    expect(wallet(beneficiary)[position ? "pending" : "available"]).toBe(4_900_000);
  });

  it.each(["cash", "voucher"])("holds pending %s rewards referencing any source allocation", (kind) => {
    enroll(); const source = paidOrder(), sourceLot = lot("p_card_position_lots", source, "left"), match = randomUUID();
    run("INSERT INTO p_card_matches VALUES(?,?,1,'fixture',1,?,?,0,?)", match, beneficiary, kind, 4_900_000, PAST);
    run("INSERT INTO p_card_position_allocations VALUES(?,?,100000)", match, sourceLot);
    run("INSERT INTO p_card_due(match_id,user_id,kind,amount,release_at) VALUES(?,?,?,?,?)", match, beneficiary, kind, 4_900_000, CANCELLED_WINDOW);
    if (kind === "cash") ledger(beneficiary, "card-due:" + match, "card_reward_pending", match, 0, 4_900_000);
    const refund = hold(source, "succeeded");
    expect(releaseCardRewards()).toBe(0);
    expect(wallet(beneficiary).available).toBe(0); expect(voucherBalance(beneficiary)).toBe(0);
    // A rejected inquiry clears the hold; no pending ledger entry was reversed.
    rejectRefund(refund); expect(releaseCardRewards()).toBe(1); expect(releaseCardRewards()).toBe(0);
    expect(kind === "cash" ? wallet(beneficiary).available : voucherBalance(beneficiary)).toBe(4_900_000);
  });

  it("holds split remainders from old member-pool allocations", () => {
    enroll(); saveSetting("seven_card_plan_draft", JSON.stringify({ decisions: { ...decisions, overflow: "split-reward" }, revision: 1 }));
    const source = paidOrder(), sourceLot = lot("p_card_lots", source, "left"), match = randomUUID(); counted(source);
    run("INSERT INTO p_card_matches VALUES(?,?,1,'fixture',1,'cash',4900000,0,?)", match, beneficiary, PAST);
    run("INSERT INTO p_card_match_allocations VALUES(?,?,100000)", match, sourceLot);
    run("INSERT INTO p_card_payouts VALUES(?,?,?,'fixture','cash',1000000,?)", randomUUID(), match, beneficiary, PAST);
    ledger(beneficiary, "fixture-paid", "card_reward", match, 1_000_000);
    const refund = hold(source); settleWeek(); expect(wallet(beneficiary).available).toBe(1_000_000);
    rejectRefund(refund); settleWeek(2); expect(wallet(beneficiary).available).toBe(4_900_000);
  });

  it.each([false, true])("holds earning desks qualified only by a refund-held purchase, preserving display (position=%s)", (position) => {
    const own = enroll(position), refund = hold(own);
    const left = paidOrder(buyer, 30 * M), right = paidOrder(buyer, 30 * M); [left, right].forEach(counted);
    const table = position ? "p_card_position_lots" : "p_card_lots";
    lot(table, left, "left"); lot(table, right, "right");
    expect(settleWeek()[0]?.matches).toBe(0);
    expect(memberCardStatus(beneficiary).desks).toBe(1);
    rejectRefund(refund); expect(settleWeek(2)[0]?.matches).toBe(1);
  });

  it("carries healthy common-pool volume when a refund temporarily reduces earning capacity", () => {
    enroll(); saveSetting("seven_card_schedule_version", "2026-10-06");
    const qualifying = paidOrder(beneficiary, 10 * M); counted(qualifying);
    run("UPDATE p_card_members SET total=?,level=2,desks=2 WHERE user_id=?", 20 * M, beneficiary);
    const refund = hold(qualifying);
    const left = paidOrder(buyer, 120 * M), right = paidOrder(buyer, 120 * M); [left, right].forEach(counted);
    const leftLot = lot("p_card_lots", left, "left"), rightLot = lot("p_card_lots", right, "right");
    // The active desk keeps its existing partial-match cap; the suspended desk's
    // healthy volume waits instead of being irreversibly burned by that hold.
    expect(settleWeek()[0]).toMatchObject({ cash: 10_500_000, flushed: 4_200_000 });
    expect(all("SELECT remaining FROM p_card_lots WHERE id IN (?,?)", leftLot, rightLot).map(l => l.remaining)).toEqual([30 * M, 30 * M]);
    rejectRefund(refund);
    expect(settleWeek(2)[0]).toMatchObject({ matches: 1, cash: 4_900_000, flushed: 0 });
    expect(all("SELECT remaining FROM p_card_lots WHERE id IN (?,?)", leftLot, rightLot).map(l => l.remaining)).toEqual([0, 0]);
  });

  it.each([false, true])("preserves the member's lifetime voucher sequence while a higher desk is held (updated=%s)", (updated) => {
    enroll();
    if (updated) saveSetting("seven_card_schedule_version", "2026-10-06");
    saveSetting("seven_card_plan_draft", JSON.stringify({ decisions: { ...decisions, counterScope: "member" }, revision: 1 }));
    const qualifying = paidOrder(beneficiary, 10 * M); counted(qualifying);
    run("UPDATE p_card_members SET total=?,level=2,desks=2 WHERE user_id=?", 20 * M, beneficiary);
    const refund = hold(qualifying);
    run("INSERT INTO p_card_desks VALUES(?,1,0),(?,2,7)", beneficiary, beneficiary);
    const addMatchVolume = () => {
      const left = paidOrder(buyer, 30 * M), right = paidOrder(buyer, 30 * M); [left, right].forEach(counted);
      lot("p_card_lots", left, "left"); lot("p_card_lots", right, "right");
    };
    addMatchVolume();
    expect(settleWeek()[0]).toMatchObject({ cash: 0, voucher: 4_900_000 });
    expect(one("SELECT sequence,kind FROM p_card_matches WHERE user_id=?", beneficiary)).toMatchObject({ sequence: 8, kind: "voucher" });
    expect(one("SELECT matches FROM p_card_desks WHERE user_id=? AND desk=2", beneficiary)!.matches).toBe(7);
    rejectRefund(refund); addMatchVolume(); settleWeek(2);
    expect(all("SELECT sequence,kind FROM p_card_matches WHERE user_id=? ORDER BY rowid", beneficiary)).toEqual([{ sequence: 8, kind: "voucher" }, { sequence: 9, kind: "cash" }]);
  });

  it("excludes held personal and team qualification from new rank bonuses without changing the visible rank", () => {
    const own = paidOrder(beneficiary), team = paidOrder(buyer);
    const ownRefund = hold(own), teamRefund = hold(team), rank = randomUUID();
    run("DELETE FROM p_ranks");
    run("INSERT INTO p_ranks VALUES(?,?,?,?,?)", rank, "Fixture rank", 100_000, 100_000, 1000);
    expect(rankProgress(beneficiary).current?.id).toBe(rank);
    const first = paidOrder(buyer, 10_000); calculateCommissions(first);
    expect(one("SELECT COUNT(*) n FROM p_commissions WHERE order_id=? AND kind='rank'", first.id)!.n).toBe(0);
    rejectRefund(ownRefund);
    const second = paidOrder(buyer, 10_000); calculateCommissions(second);
    expect(one("SELECT COUNT(*) n FROM p_commissions WHERE order_id=? AND kind='rank'", second.id)!.n).toBe(0);
    rejectRefund(teamRefund);
    const third = paidOrder(buyer, 10_000); calculateCommissions(third);
    expect(one("SELECT amount FROM p_commissions WHERE order_id=? AND kind='rank'", third.id)!.amount).toBe(1000);
    mature(); mature();
    expect(wallet(beneficiary)).toMatchObject({ available: 1000, pending: 0 });
  });

  it("holds purchase-qualified company earning desks while preserving grace and visible assignment", () => {
    const own = paidOrder(beneficiary, 20 * M); hold(own);
    const grant = new Date(CLOCK - 40 * DAY).toISOString(), deadline = new Date(CLOCK - DAY).toISOString();
    run("INSERT INTO p_company_positions VALUES(?,4,?,?,?,'qualified')", beneficiary, grant, deadline, buyer);
    expect(companyPositionStatus(beneficiary)!.activeDesks).toBe(4);
    expect(companyPositionStatus(beneficiary, CLOCK, true)!.activeDesks).toBe(0);
    expect(positionDesks(beneficiary)).toBe(4);
    run("UPDATE p_company_positions SET deadline=? WHERE user_id=?", new Date(CLOCK + DAY).toISOString(), beneficiary);
    expect(companyPositionStatus(beneficiary, CLOCK, true)!.activeDesks).toBe(4);
  });
});
