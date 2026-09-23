import { randomUUID } from "node:crypto";
import { ApiError } from "../server/http";
import { all, one, run, atomic, now, Row } from "./schema";
import { setting, saveSetting } from "./providers";
import { audit } from "./security";
import { ledger, notify, wallet } from "./finance";
import {
  DESK_WEEKLY_CAP,
  MATCH_REWARD,
  MATCH_VOLUME,
  cardForPurchase,
  simurghCashbackEligibility,
  type CardDecisions,
} from "./seven-card-model";

/**
 * Live settlement for the seven-card plan. All amounts are integer toman.
 *
 * Model (owner decisions of 2026-09):
 * - Volume: a paid order counts once its cancellation window has ended and it
 *   has not been refunded. Its amount becomes a volume lot on the left/right
 *   leg of every ancestor in the placement tree (p_users.parent_id/leg).
 * - Card: level = cardForPurchase(total counted purchases); level n gives n
 *   desks. Only enrolled members (level >= 1) earn; volume still flows up.
 * - Desks are the member's own capacity under their first desk, filled in
 *   order (desk 1, then 2, ...). Each desk has its own weekly cap and its own
 *   lifetime match counter; every eighth match of a desk is a voucher.
 * - Weekly settlement at the configured week start (Tehran time): every
 *   30m/30m match pays 5.4m. A match that fits no desk's remaining cap, or the
 *   week's funding budget, is carried whole to a later week.
 * - Initial purchase credit is the purchase value itself (no extra credit);
 *   a single first purchase of 70m or more earns the Simurgh cashback.
 * - Refunds void the order's lots and reverse every match that used them.
 */

const TEHRAN_OFFSET_MS = 3.5 * 3600_000; // Iran has no daylight saving since 2022
const WEEK_MS = 7 * 86400_000;
export class DryRun extends Error {
  constructor(readonly result: unknown) {
    super("dry_run");
  }
}

export function cardLive() {
  return setting("seven_card_live") === "1";
}
/** When on, every match is paid as the plan text says, with no weekly budget
 * drawn from sales (the owner's choice; the risk is the company's). */
export function unlimitedBudget() {
  return setting("seven_card_budget_unlimited") === "1";
}
export function fundingBps() {
  const v = Number(setting("seven_card_funding_bps") || 0);
  return Number.isInteger(v) && v >= 0 && v <= 10000 ? v : 0;
}
function decisions(): CardDecisions | null {
  const raw = setting("seven_card_plan_draft");
  if (!raw) return null;
  const d = JSON.parse(raw).decisions as CardDecisions;
  return Object.values(d).some((v) => v === null) ? null : d;
}

/** Start (UTC ms) of the plan week containing `ms`, weeks starting on
 * `weekStart` (0 = Sunday … 6 = Saturday) at 00:00 Tehran time. */
export function weekStartAt(ms: number, weekStart: number) {
  const local = ms + TEHRAN_OFFSET_MS;
  const day = new Date(local).getUTCDay();
  const midnight = local - (local % 86400_000);
  const back = (day - weekStart + 7) % 7;
  return midnight - back * 86400_000 - TEHRAN_OFFSET_MS;
}
export const weekKey = (startMs: number) => new Date(startMs).toISOString().slice(0, 16) + "Z";

/** Turns matured orders into member totals, volume lots and cashback. */
function countOrders(cutoff: string) {
  // Only orders paid after live settlement was switched on count: historic
  // sales are not paid out retroactively.
  const since = new Date(Number(setting("seven_card_live_since") || 0)).toISOString();
  const orders = all(
    `SELECT o.* FROM p_orders o WHERE o.paid_at IS NOT NULL AND o.paid_at>=? AND o.refunded_at IS NULL
     AND o.status NOT IN ('refunded','cancelled') AND o.cancel_until IS NOT NULL AND o.cancel_until<=?
     AND NOT EXISTS(SELECT 1 FROM p_card_orders c WHERE c.order_id=o.id)
     ORDER BY o.cancel_until,o.id LIMIT 2000`,
    since,
    cutoff,
  );
  let volume = 0;
  for (const o of orders) {
    const earlier = one("SELECT COUNT(*) n FROM p_card_orders WHERE user_id=?", o.user_id)!.n;
    run("INSERT INTO p_card_orders VALUES(?,?,?,?,?)", o.id, o.user_id, o.amount, cutoff, now());
    volume += o.amount;
    const before = one("SELECT * FROM p_card_members WHERE user_id=?", o.user_id);
    const total = (before?.total || 0) + o.amount;
    const card = cardForPurchase(total);
    run(
      `INSERT INTO p_card_members(user_id,total,level,desks,updated_at) VALUES(?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET total=excluded.total,level=excluded.level,desks=excluded.desks,updated_at=excluded.updated_at`,
      o.user_id, total, card?.level || 0, card?.desks || 0, now(),
    );
    if (card && (before?.level || 0) < card.level)
      notify(o.user_id, "کارت باشگاه شما به‌روز شد", `کارت ${card.name} با ${card.desks.toLocaleString("fa-IR")} میز فعال شد.`);
    const cashback = simurghCashbackEligibility(o.amount, earlier);
    if (cashback && wallet(o.user_id)) {
      run("INSERT INTO p_card_cashbacks VALUES(?,?,?,0,?)", o.id, o.user_id, cashback, now());
      ledger(o.user_id, "card-cashback:" + o.id, "card_cashback", o.id, cashback);
      notify(o.user_id, "بازگشت وجه کارت سیمرغ", `${cashback.toLocaleString("fa-IR")} تومان به کیف پول شما اضافه شد.`);
    }
    const seen = new Set<string>();
    let child = one("SELECT id,parent_id,leg FROM p_users WHERE id=?", o.user_id);
    while (child?.parent_id && !seen.has(child.parent_id)) {
      seen.add(child.parent_id);
      run(
        "INSERT OR IGNORE INTO p_card_lots VALUES(?,?,?,?,?,?,0,?)",
        randomUUID(), o.id, child.parent_id, child.leg, o.amount, o.amount, now(),
      );
      child = one("SELECT id,parent_id,leg FROM p_users WHERE id=?", child.parent_id);
    }
  }
  return volume;
}

function takeVolume(user: string, leg: string, amount: number) {
  const taken: { lot: string; volume: number }[] = [];
  for (const lot of all(
    "SELECT id,remaining FROM p_card_lots WHERE user_id=? AND leg=? AND void=0 AND remaining>0 ORDER BY created_at,rowid",
    user, leg,
  )) {
    if (!amount) break;
    const v = Math.min(amount, lot.remaining);
    run("UPDATE p_card_lots SET remaining=remaining-? WHERE id=?", v, lot.id);
    taken.push({ lot: lot.id, volume: v });
    amount -= v;
  }
  if (amount) throw new ApiError(500, "volume_mismatch");
  return taken;
}

/** Settles one week. Runs inside the caller's transaction. */
function settleWeekTx(startMs: number, d: CardDecisions) {
  const key = weekKey(startMs), cutoff = new Date(startMs + WEEK_MS).toISOString();
  if (one("SELECT week FROM p_card_weeks WHERE week=?", key)) return null;
  const sales = countOrders(cutoff);
  const unlimited = unlimitedBudget();
  let budget = unlimited
    ? Number.MAX_SAFE_INTEGER
    : Number((BigInt(sales) * BigInt(fundingBps())) / 10000n) + Number(setting("seven_card_budget_carry") || 0);
  const result = { week: key, sales, budget: unlimited ? 0 : budget, unlimited, matches: 0, cash: 0, voucher: 0, carriedBudget: 0 };
  // "Of every eight matches": per desk, or across all of the member's desks.
  const perMember = d.counterScope === "member";
  const members = all(
    `SELECT m.* FROM p_card_members m JOIN p_users u ON u.id=m.user_id WHERE m.level>=1 AND u.blocked=0
     AND EXISTS(SELECT 1 FROM p_card_lots l WHERE l.user_id=m.user_id AND l.leg='left' AND l.void=0 AND l.remaining>0)
     AND EXISTS(SELECT 1 FROM p_card_lots l WHERE l.user_id=m.user_id AND l.leg='right' AND l.void=0 AND l.remaining>0)
     ORDER BY m.user_id`,
  );
  const split = d.overflow === "split-reward";
  const capCost = (voucher: boolean, amount: number) =>
    voucher && !d.voucherCountsTowardCap ? 0 : amount;
  const payout = (match: Row, amount: number) => {
    const id = randomUUID();
    run("INSERT INTO p_card_payouts VALUES(?,?,?,?,?,?,?)", id, match.id, match.user_id, key, match.kind, amount, now());
    if (match.kind === "voucher") {
      voucherEntry(match.user_id, "card-payout:" + id, "earn", match.id, amount);
      result.voucher += amount;
    } else {
      const debt = Math.min(wallet(match.user_id).debt, amount);
      ledger(match.user_id, "card-payout:" + id, "card_reward", match.id, amount - debt, 0, 0, -debt);
      result.cash += amount;
    }
  };
  for (const m of members.concat(split ? owedMembers(members) : [])) {
    const pool = (leg: string) =>
      one("SELECT COALESCE(SUM(remaining),0) n FROM p_card_lots WHERE user_id=? AND leg=? AND void=0", m.user_id, leg)!.n;
    let left = pool("left"), right = pool("right");
    const allowance = Array.from({ length: m.desks }, () => DESK_WEEKLY_CAP);
    const counters = Array.from({ length: m.desks }, (_, i) =>
      one("SELECT matches FROM p_card_desks WHERE user_id=? AND desk=?", m.user_id, i + 1)?.matches || 0);
    // Split mode: the unpaid rest of earlier matches is paid first, within this week's caps.
    if (split)
      for (const owed of all(
        `SELECT m.*,m.amount-COALESCE((SELECT SUM(p.amount) FROM p_card_payouts p WHERE p.match_id=m.id),0) due
         FROM p_card_matches m WHERE m.user_id=? AND m.void=0 ORDER BY m.created_at,m.rowid`,
        m.user_id,
      )) {
        const slot = owed.desk - 1;
        if (owed.due <= 0 || slot >= m.desks) continue;
        const free = capCost(owed.kind === "voucher", owed.due) ? allowance[slot] : owed.due;
        const pay = Math.min(owed.due, free);
        if (pay <= 0) continue;
        payout(owed, pay);
        allowance[slot] -= capCost(owed.kind === "voucher", pay);
      }
    while (left >= MATCH_VOLUME && right >= MATCH_VOLUME && budget >= MATCH_REWARD) {
      let desk = -1, voucher = false;
      const memberTotal = counters.reduce((a, b) => a + b, 0);
      for (let i = 0; i < m.desks; i++) {
        const isVoucher = ((perMember ? memberTotal : counters[i]) + 1) % 8 === 0;
        const cost = capCost(isVoucher, MATCH_REWARD);
        if (split ? cost === 0 || allowance[i] > 0 : cost <= allowance[i]) {
          desk = i; voucher = isVoucher;
          break;
        }
      }
      if (desk < 0) break; // no desk has room: the match waits (carry-whole)
      counters[desk]++;
      const id = randomUUID();
      run(
        "INSERT INTO p_card_matches VALUES(?,?,?,?,?,?,?,0,?)",
        id, m.user_id, desk + 1, key, perMember ? memberTotal + 1 : counters[desk], voucher ? "voucher" : "cash", MATCH_REWARD, now(),
      );
      for (const leg of ["left", "right"])
        for (const t of takeVolume(m.user_id, leg, MATCH_VOLUME))
          run("INSERT INTO p_card_match_allocations VALUES(?,?,?)", id, t.lot, t.volume);
      const cost = capCost(voucher, MATCH_REWARD);
      const now_ = cost ? Math.min(MATCH_REWARD, allowance[desk]) : MATCH_REWARD;
      payout({ id, user_id: m.user_id, kind: voucher ? "voucher" : "cash" }, now_);
      allowance[desk] -= cost ? now_ : 0;
      left -= MATCH_VOLUME; right -= MATCH_VOLUME; budget -= MATCH_REWARD;
      result.matches++;
    }
    counters.forEach((n, i) =>
      run(
        "INSERT INTO p_card_desks VALUES(?,?,?) ON CONFLICT(user_id,desk) DO UPDATE SET matches=excluded.matches",
        m.user_id, i + 1, n,
      ));
    const earned = one("SELECT COALESCE(SUM(amount),0) n FROM p_card_payouts WHERE user_id=? AND week=?", m.user_id, key)!.n;
    if (earned)
      notify(m.user_id, "تسویهٔ هفتگی باشگاه", `${earned.toLocaleString("fa-IR")} تومان پاداش در این هفته برای شما ثبت شد.`);
  }
  result.carriedBudget = unlimited ? 0 : budget;
  saveSetting("seven_card_budget_carry", String(result.carriedBudget));
  run(
    "INSERT INTO p_card_weeks VALUES(?,?,?,?,?,?,?,?)",
    key, cutoff, result.sales, result.budget, result.matches, result.cash, result.voucher, now(),
  );
  return result;
}

/** Members owed a split remainder who are not already in this week's list. */
function owedMembers(listed: Row[]) {
  const seen = new Set(listed.map((m) => m.user_id));
  return all(
    `SELECT DISTINCT c.* FROM p_card_members c JOIN p_card_matches m ON m.user_id=c.user_id JOIN p_users u ON u.id=c.user_id
     WHERE m.void=0 AND u.blocked=0 AND m.amount>COALESCE((SELECT SUM(p.amount) FROM p_card_payouts p WHERE p.match_id=m.id),0)`,
  ).filter((m) => !seen.has(m.user_id));
}

function voucherEntry(user: string, key: string, kind: string, reference: string, amount: number) {
  if (one("SELECT id FROM p_card_voucher_ledger WHERE event_key=?", key)) return;
  run("INSERT INTO p_card_voucher_ledger VALUES(?,?,?,?,?,?,?)", randomUUID(), user, key, kind, amount, reference, now());
}
/** Spends voucher credit on an order (checkout). */
export function spendVoucher(user: string, orderId: string, amount: number) {
  run("INSERT INTO p_order_vouchers VALUES(?,?,?,?)", orderId, user, amount, now());
  voucherEntry(user, "voucher-spend:" + orderId, "spend", orderId, -amount);
}
/** Returns an order's voucher share to the voucher balance (refund/cancel); never to the wallet. */
export function restoreOrderVoucher(orderId: string) {
  const v = one("SELECT * FROM p_order_vouchers WHERE order_id=?", orderId);
  if (v) voucherEntry(v.user_id, "voucher-refund:" + orderId, "refund", orderId, v.amount);
  return (v?.amount as number) || 0;
}
export const voucherBalance = (user: string) =>
  one("SELECT COALESCE(SUM(amount),0) n FROM p_card_voucher_ledger WHERE user_id=?", user)!.n as number;

/** Settles every completed, unsettled week (oldest first, at most four). */
export function runCardSettlement(nowMs = Date.now()) {
  if (!cardLive()) return [];
  const d = decisions();
  if (!d) return [];
  const current = weekStartAt(nowMs, d.weekStart!);
  const since = Number(setting("seven_card_live_since") || current);
  const out = [];
  for (let start = weekStartAt(since, d.weekStart!); start < current && out.length < 4; start += WEEK_MS) {
    const r = atomic(() => settleWeekTx(start, d));
    if (r) out.push(r);
  }
  return out;
}

/** What the next settlement would do right now, without saving anything. */
export function previewCardSettlement(nowMs = Date.now()) {
  const d = decisions();
  if (!d) throw new ApiError(409, "plan_rules_incomplete");
  const start = weekStartAt(nowMs, d.weekStart!);
  try {
    atomic(() => {
      throw new DryRun(settleWeekTx(start, d));
    });
  } catch (e) {
    if (e instanceof DryRun) return e.result;
    throw e;
  }
  return null;
}

/** Called from refundOrder: voids the order's volume and reverses its matches. */
export function reverseCardOrder(orderId: string) {
  const counted = one("SELECT * FROM p_card_orders WHERE order_id=?", orderId);
  if (!counted) return;
  const matches = all(
    `SELECT DISTINCT m.* FROM p_card_matches m JOIN p_card_match_allocations a ON a.match_id=m.id
     JOIN p_card_lots l ON l.id=a.lot_id WHERE l.order_id=? AND m.void=0`,
    orderId,
  );
  for (const m of matches) {
    run("UPDATE p_card_matches SET void=1 WHERE id=?", m.id);
    for (const p of all("SELECT * FROM p_card_payouts WHERE match_id=?", m.id)) {
      if (p.kind === "voucher") voucherEntry(p.user_id, "card-payout-reverse:" + p.id, "reverse", m.id, -p.amount);
      else {
        const available = Math.min(wallet(p.user_id).available, p.amount);
        ledger(p.user_id, "card-payout-reverse:" + p.id, "card_reward_reversal", m.id, -available, 0, 0, p.amount - available);
      }
    }
    for (const a of all("SELECT * FROM p_card_match_allocations WHERE match_id=?", m.id))
      run("UPDATE p_card_lots SET remaining=remaining+? WHERE id=? AND void=0", a.volume, a.lot_id);
  }
  run("UPDATE p_card_lots SET void=1,remaining=0 WHERE order_id=?", orderId);
  const member = one("SELECT * FROM p_card_members WHERE user_id=?", counted.user_id);
  if (member) {
    const total = Math.max(0, member.total - counted.amount), card = total ? cardForPurchase(total) : null;
    run("UPDATE p_card_members SET total=?,level=?,desks=?,updated_at=? WHERE user_id=?",
      total, card?.level || 0, card?.desks || 0, now(), counted.user_id);
  }
  const cashback = one("SELECT * FROM p_card_cashbacks WHERE order_id=? AND reversed=0", orderId);
  if (cashback) {
    const available = Math.min(wallet(cashback.user_id).available, cashback.amount);
    ledger(cashback.user_id, "card-cashback-reverse:" + orderId, "card_cashback_reversal", orderId,
      -available, 0, 0, cashback.amount - available);
    run("UPDATE p_card_cashbacks SET reversed=1 WHERE order_id=?", orderId);
  }
}

export function memberCardStatus(user: string) {
  const m = one("SELECT * FROM p_card_members WHERE user_id=?", user);
  const leg = (l: string) =>
    one("SELECT COALESCE(SUM(remaining),0) n FROM p_card_lots WHERE user_id=? AND leg=? AND void=0", user, l)!.n;
  return {
    live: cardLive(),
    level: m?.level || 0,
    desks: m?.desks || 0,
    totalPurchase: m?.total || 0,
    leftVolume: leg("left"),
    rightVolume: leg("right"),
    deskCounters: all("SELECT desk,matches FROM p_card_desks WHERE user_id=? ORDER BY desk", user),
    voucherBalance: voucherBalance(user),
    recent: all(
      "SELECT week,desk,sequence,kind,amount,void FROM p_card_matches WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
      user,
    ),
  };
}

/** Turns live settlement on or off. On requires every rule decided and a
 * funding share; switching on also stops the legacy binary engine. */
export function setCardLive(
  actor: string,
  input: { live: boolean; fundingBps?: number; unlimitedBudget?: boolean; reason: string },
) {
  return atomic(() => {
    if (input.live) {
      if (!decisions()) throw new ApiError(409, "plan_rules_incomplete");
      if (input.unlimitedBudget) saveSetting("seven_card_budget_unlimited", "1");
      else {
        const bps = input.fundingBps;
        if (!Number.isInteger(bps) || bps! < 1 || bps! > 10000) throw new ApiError(400, "invalid_input");
        saveSetting("seven_card_funding_bps", String(bps));
        saveSetting("seven_card_budget_unlimited", "0");
      }
      if (!setting("seven_card_live_since")) saveSetting("seven_card_live_since", String(Date.now()));
    }
    const before = { live: cardLive(), fundingBps: fundingBps(), unlimitedBudget: unlimitedBudget() };
    saveSetting("seven_card_live", input.live ? "1" : "0");
    const after = { live: cardLive(), fundingBps: fundingBps(), unlimitedBudget: unlimitedBudget() };
    audit(actor, "seven-card.live", "seven_card_live", before, after, input.reason);
    return after;
  });
}

export function cardWeeks() {
  return all("SELECT * FROM p_card_weeks ORDER BY week DESC LIMIT 52");
}
export type { Row };
