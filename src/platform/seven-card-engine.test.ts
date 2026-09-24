// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { platformDb, run, one, all, now } from "./schema";
import { saveSetting } from "./providers";
import { createOrder, settleOrder, refundOrder, wallet, ledger } from "./finance";
import { createCheckout } from "./checkout";
import {
  memberCardStatus,
  previewCardSettlement,
  runCardSettlement,
  setCardLive,
  voucherBalance,
  weekStartAt,
} from "./seven-card-engine";
import { cardPlan } from "./seven-card";

const directory = mkdtempSync(join(tmpdir(), "homay-cards-"));
const DAY = 86400_000;
const M = 1_000_000;
let admin: string, root: string, left: string, right: string, product: string;
const decisions = {
  overflow: "carry-whole",
  counterScope: "desk",
  voucherCountsTowardCap: true,
  topology: "own-desks",
  purchaseCredit: "purchase-value",
  weekStart: 6,
};
function member(parent: string | null = null, leg: string | null = null) {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,name,password,referral_code,sponsor_id,parent_id,leg,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?)",
    id, "Fixture", "unused", id.slice(0, 8), parent, parent, leg, now(), now(), "test",
  );
  run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
  return id;
}
function buy(user: string, amount: number) {
  run("UPDATE p_products SET price=? WHERE id=?", amount, product);
  const o = createOrder(user, product, 1, "zarinpal", randomUUID());
  return settleOrder(o.id, "bank-" + randomUUID());
}
/** Settles as of an hour into the week after the given number of days, so
 * "8" closes exactly this week and "15" exactly the next, whatever the
 * weekday the suite runs on. */
const settleAfter = (days: number) =>
  runCardSettlement(weekStartAt(Date.now(), decisions.weekStart) + Math.floor(days / 7) * 7 * DAY + 3600_000);

beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "cards.sqlite");
});
afterAll(() => {
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});
beforeEach(() => {
  for (const t of ["p_card_payouts", "p_card_match_allocations", "p_card_matches", "p_card_lots", "p_card_desks", "p_card_members", "p_card_cashbacks", "p_card_orders", "p_card_weeks"])
    run(`DELETE FROM ${t}`);
  run("DELETE FROM p_settings WHERE key LIKE 'seven_card%'");
  saveSetting("commission_policy", JSON.stringify({
    directBps: 0, levels: [], binaryBps: 1000, maxPayoutBps: 3000, warningBps: 5000,
    criticalBps: 8000, withdrawMin: 1, withdrawMax: 1_000_000_000, paused: false,
  }));
  saveSetting("seven_card_plan_draft", JSON.stringify({ decisions, revision: 1 }));
  admin = member();
  run("UPDATE p_users SET role='superadmin' WHERE id=?", admin);
  root = member();
  left = member(root, "left");
  right = member(root, "right");
  product = randomUUID();
  run(
    "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,duration_days,cancel_hours,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)",
    product, "Card", "Card purchase", "craft", "card", 10 * M, 100000, 30, 0, now(), now(),
  );
  setCardLive(admin, { live: true, fundingBps: 10000, reason: "test activation" });
  // Orders from earlier tests were paid before this instant and never count.
  const since = Date.now() + 2;
  saveSetting("seven_card_live_since", String(since));
  while (Date.now() <= since + 1);
});

it("does nothing until every rule is decided and the plan is switched on", () => {
  saveSetting("seven_card_live", "0");
  buy(root, 10 * M); buy(left, 30 * M); buy(right, 30 * M);
  expect(settleAfter(8)).toEqual([]);
  saveSetting("seven_card_plan_draft", JSON.stringify({ decisions: { ...decisions, topology: null }, revision: 2 }));
  expect(() => setCardLive(admin, { live: true, fundingBps: 5000, reason: "x" })).toThrow();
});

it("pays one 5.4m reward per 30m/30m match to an enrolled member", () => {
  buy(root, 10 * M); buy(left, 30 * M); buy(right, 30 * M);
  const [week] = settleAfter(8);
  expect(week).toMatchObject({ matches: 1, cash: 5_400_000, voucher: 0 });
  expect(wallet(root).available).toBe(5_400_000);
  expect(memberCardStatus(root)).toMatchObject({ level: 1, desks: 1, leftVolume: 0, rightVolume: 0 });
  expect(cardPlan()).toMatchObject({ status: "live", liveSettlement: true });
  expect(settleAfter(8)).toEqual([]); // a settled week is never paid twice
});

it("respects the 15m desk cap and carries the whole next match to the following week", () => {
  buy(root, 10 * M); buy(left, 90 * M); buy(right, 90 * M);
  const [week] = settleAfter(8);
  expect(week.matches).toBe(2);
  expect(wallet(root).available).toBe(10_800_000);
  expect(memberCardStatus(root)).toMatchObject({ leftVolume: 30 * M, rightVolume: 30 * M });
  settleAfter(15);
  expect(wallet(root).available).toBe(16_200_000);
});

it("fills extra desks in order: a Sarv card fits two 5.4m matches per desk", () => {
  buy(root, 20 * M); buy(left, 150 * M); buy(right, 150 * M);
  settleAfter(8);
  expect(wallet(root).available).toBe(4 * 5_400_000);
  const desks = memberCardStatus(root).deskCounters;
  expect(desks).toEqual([{ desk: 1, matches: 2 }, { desk: 2, matches: 2 }]);
  // a third match on either desk would reach 16.2m > 15m, so the fifth waits
  expect(all("SELECT desk FROM p_card_matches WHERE user_id=? ORDER BY sequence,desk", root).length).toBe(4);
});

it("makes every eighth match of a desk a voucher that counts toward the cap", () => {
  buy(root, 10 * M); buy(left, 60 * M); buy(right, 60 * M);
  run("INSERT INTO p_card_members VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING", root, 0, 0, 0, now());
  run("INSERT INTO p_card_desks VALUES(?,1,6)", root);
  settleAfter(8);
  expect(wallet(root).available).toBe(5_400_000);
  expect(voucherBalance(root)).toBe(5_400_000);
  expect(memberCardStatus(root).deskCounters).toEqual([{ desk: 1, matches: 8 }]);
});

it("counts every eighth match across all of a member's desks when the counter is per member", () => {
  saveSetting("seven_card_plan_draft", JSON.stringify({ decisions: { ...decisions, counterScope: "member" }, revision: 2 }));
  buy(root, 20 * M); buy(left, 30 * M); buy(right, 30 * M);
  run("INSERT INTO p_card_members VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING", root, 0, 0, 0, now());
  run("INSERT INTO p_card_desks VALUES(?,1,4)", root);
  run("INSERT INTO p_card_desks VALUES(?,2,3)", root);
  settleAfter(8);
  // desk counters are 4 and 3; per desk this would be cash, per member it is the 8th
  expect(voucherBalance(root)).toBe(5_400_000);
  expect(wallet(root).available).toBe(0);
  expect(one("SELECT sequence,kind FROM p_card_matches WHERE user_id=?", root)).toEqual({ sequence: 8, kind: "voucher" });
});

it("pays every match with no weekly budget when the budget is unlimited", () => {
  setCardLive(admin, { live: true, fundingBps: 1, reason: "tiny budget" });
  buy(root, 10 * M); buy(left, 30 * M); buy(right, 30 * M);
  expect(previewCardSettlement()).toMatchObject({ matches: 0 });
  setCardLive(admin, { live: true, unlimitedBudget: true, reason: "plan text: no budget" });
  const [week] = settleAfter(8);
  expect(week).toMatchObject({ matches: 1, cash: 5_400_000, unlimited: true, carriedBudget: 0 });
});

it("reverses a paid match when an order behind it is refunded", () => {
  buy(root, 10 * M);
  const l = buy(left, 30 * M);
  buy(right, 30 * M);
  settleAfter(8);
  expect(wallet(root).available).toBe(5_400_000);
  refundOrder(l.id, admin, true, "customer return");
  expect(wallet(root).available).toBe(0);
  expect(one("SELECT void FROM p_card_matches WHERE user_id=?", root)!.void).toBe(1);
  expect(memberCardStatus(root).rightVolume).toBe(30 * M); // the other side's volume is restored
});

it("pays the Simurgh cashback once for a single 70m first purchase", () => {
  const buyer = member(left, "left");
  buy(buyer, 70 * M);
  settleAfter(8);
  expect(wallet(buyer).available).toBe(6 * M);
  expect(memberCardStatus(buyer)).toMatchObject({ level: 7, desks: 7 });
});

it("stops the legacy binary engine while the card plan is live", () => {
  const o = buy(left, 30 * M);
  expect(one("SELECT COUNT(*) n FROM p_binary_lots WHERE order_id=?", o.id)!.n).toBe(0);
});

it("previews the coming settlement without saving anything", () => {
  buy(root, 10 * M); buy(left, 30 * M); buy(right, 30 * M);
  const preview = previewCardSettlement(Date.now()) as { matches: number };
  expect(preview.matches).toBe(1);
  expect(wallet(root).available).toBe(0);
  expect(one("SELECT COUNT(*) n FROM p_card_weeks")!.n).toBe(0);
});

it("in split mode pays up to exactly 15m a week and the rest of the third match next week", () => {
  saveSetting("seven_card_plan_draft", JSON.stringify({ decisions: { ...decisions, overflow: "split-reward" }, revision: 2 }));
  buy(root, 10 * M); buy(left, 90 * M); buy(right, 90 * M);
  const [week] = settleAfter(8);
  expect(week).toMatchObject({ matches: 3, cash: 15 * M });
  expect(wallet(root).available).toBe(15 * M);
  const [next] = settleAfter(15);
  expect(next.cash).toBe(1_200_000);
  expect(wallet(root).available).toBe(16_200_000);
});

it("reverses every split payment of a refunded match", () => {
  saveSetting("seven_card_plan_draft", JSON.stringify({ decisions: { ...decisions, overflow: "split-reward" }, revision: 2 }));
  buy(root, 10 * M);
  const l = buy(left, 90 * M);
  buy(right, 90 * M);
  settleAfter(8);
  settleAfter(15);
  refundOrder(l.id, admin, true, "customer return");
  expect(wallet(root).available).toBe(0);
  expect(one("SELECT COUNT(*) n FROM p_card_matches WHERE user_id=? AND void=0", root)!.n).toBe(0);
});

function giveVoucher(user: string, amount: number) {
  run("INSERT INTO p_card_voucher_ledger VALUES(?,?,?,?,?,?,?)", randomUUID(), user, "test:" + randomUUID(), "earn", amount, "test", now());
}
function checkout(user: string, price: number, method: "wallet" | "zarinpal") {
  const item = randomUUID();
  run(
    "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,duration_days,cancel_hours,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)",
    item, "Tour", "Tour", "tourism", "tour", price, 10, 30, 0, now(), now(),
  );
  return createCheckout(user, {
    items: [{ productId: item, quantity: 1 }], method, idempotencyKey: randomUUID(), expectedTotal: price, useVoucher: true,
  });
}

it("pays part of a basket with voucher credit and the rest from the wallet", () => {
  giveVoucher(root, 5_400_000);
  ledger(root, "test-topup:" + randomUUID(), "test", "test", 10 * M);
  const c = checkout(root, 10 * M, "wallet");
  expect(c.status).toBe("paid");
  expect(voucherBalance(root)).toBe(0);
  expect(wallet(root).available).toBe(10 * M - 4_600_000);
  const order = one("SELECT o.* FROM p_orders o JOIN p_checkout_items i ON i.order_id=o.id WHERE i.checkout_id=?", c.id)!;
  expect(order.paid_at).toBeTruthy();
  refundOrder(order.id, admin, true, "return");
  expect(voucherBalance(root)).toBe(5_400_000); // voucher share goes back as voucher, never cash
  expect(wallet(root).available).toBe(10 * M);
});

it("settles a basket fully covered by vouchers without a payment gateway", () => {
  giveVoucher(root, 12 * M);
  const c = checkout(root, 10 * M, "zarinpal");
  expect(c.status).toBe("paid");
  expect(voucherBalance(root)).toBe(2 * M);
});

it("charges the gateway only the part vouchers do not cover, and returns the voucher if it expires unpaid", () => {
  giveVoucher(root, 3 * M);
  const c = checkout(root, 10 * M, "zarinpal");
  expect(c).toMatchObject({ status: "pending", amount: 7 * M });
  expect(voucherBalance(root)).toBe(0);
  const order = one("SELECT order_id FROM p_checkout_items WHERE checkout_id=?", c.id)!;
  run("UPDATE p_checkouts SET expires_at=? WHERE id=?", "2000-01-01T00:00:00.000Z", c.id);
  run("UPDATE p_orders SET expires_at=? WHERE id=?", "2000-01-01T00:00:00.000Z", order.order_id);
  refundOrder(order.order_id, root);
  expect(voucherBalance(root)).toBe(3 * M);
  expect(wallet(root).available).toBe(0);
});

it("starts weeks on Saturday 00:00 Tehran time", () => {
  const start = weekStartAt(Date.parse("2026-09-23T12:00:00Z"), 6);
  expect(new Date(start).toISOString()).toBe("2026-09-18T20:30:00.000Z");
});
