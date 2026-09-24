import { randomUUID } from "node:crypto";
import { z } from "zod";
import { all, one, run, now, atomic, Row } from "./schema";
import { setting, saveSetting } from "./providers";
import { audit } from "./security";
import { ApiError } from "../server/http";
import {
  loyaltyPolicySchema,
  loyaltyLevelSchema,
  disabledLoyalty,
} from "./loyalty-model";
import { text } from "./validation";
export const pointsNet = (user: string): number =>
  one(
    "SELECT COALESCE(SUM(delta),0) n FROM p_points_ledger WHERE user_id=?",
    user,
  )!.n;
export function loyaltyPolicy() {
  const raw = setting("loyalty_policy");
  return raw
    ? loyaltyPolicySchema.parse(JSON.parse(raw))
    : { ...disabledLoyalty };
}
export function saveLoyaltyPolicy(actor: string, input: unknown) {
  const d = z
    .object({ policy: loyaltyPolicySchema, reason: text })
    .strict()
    .parse(input);
  return atomic(() => {
    const old = loyaltyPolicy();
    saveSetting("loyalty_policy", JSON.stringify(d.policy));
    audit(actor, "loyalty.policy", "loyalty_policy", old, d.policy, d.reason);
    return { ok: true };
  });
}
function initialize(user: string) {
  if (one("SELECT user_id FROM p_points_initialized WHERE user_id=?", user))
    return;
  const balance = pointsNet(user);
  if (balance > 0)
    run(
      "INSERT INTO p_points_lots VALUES(?,?,?,?,NULL,?,NULL)",
      randomUUID(),
      user,
      null,
      balance,
      now(),
    );
  run("INSERT INTO p_points_initialized VALUES(?)", user);
}
function write(
  user: string,
  delta: number,
  kind: string,
  reference: string,
  key: string,
  reason: string,
  actor: string | null,
) {
  const id = randomUUID();
  run(
    "INSERT INTO p_points_ledger VALUES(?,?,?,?,?,?,?,?,?)",
    id,
    user,
    delta,
    kind,
    reference,
    key,
    reason,
    actor,
    now(),
  );
  return id;
}
export function expirePoints(user: string) {
  initialize(user);
  for (const lot of all(
    "SELECT * FROM p_points_lots WHERE user_id=? AND remaining>0 AND expires_at<=?",
    user,
    now(),
  )) {
    write(
      user,
      -lot.remaining,
      "expiry",
      lot.id,
      "expire:" + lot.id,
      "انقضای امتیاز",
      null,
    );
    run("UPDATE p_points_lots SET remaining=0 WHERE id=?", lot.id);
  }
}
/** Called inside an IMMEDIATE transaction. Source entries remain immutable. */
export function pointEntry(
  user: string,
  delta: number,
  kind: string,
  reference: string,
  key: string,
  reason: string,
  actor: string | null,
  expiresAt: string | null = null,
  allowDebt = false,
  preferEntry: string | null = null,
  originEntry: string | null = null,
) {
  expirePoints(user);
  const before = pointsNet(user),
    after = before + delta;
  if (!Number.isSafeInteger(after) || (!allowDebt && delta < 0 && after < 0))
    throw new ApiError(409, "insufficient_points");
  const id = write(user, delta, kind, reference, key, reason, actor);
  if (delta > 0) {
    // Expired returned points cannot clear a refund debt or become spendable again.
    if (expiresAt && expiresAt <= now()) {
      const lot = randomUUID();
      run(
        "INSERT INTO p_points_lots VALUES(?,?,?,?,?,?,?)",
        lot,
        user,
        id,
        0,
        expiresAt,
        now(),
        originEntry || id,
      );
      write(
        user,
        -delta,
        "expiry",
        lot,
        "expire:" + lot,
        "انقضای امتیاز بازگشتی",
        null,
      );
      return id;
    }
    const remaining = Math.max(0, delta - Math.max(0, -before));
    run(
      "INSERT INTO p_points_lots VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      user,
      id,
      remaining,
      expiresAt,
      now(),
      originEntry || id,
    );
  } else {
    let need = -delta;
    for (const lot of all(
      "SELECT * FROM p_points_lots WHERE user_id=? AND remaining>0 ORDER BY CASE WHEN origin_entry=? THEN 0 ELSE 1 END,expires_at IS NULL,expires_at,created_at,id",
      user,
      preferEntry,
    )) {
      const n = Math.min(need, lot.remaining);
      if (!n) break;
      run(
        "UPDATE p_points_lots SET remaining=remaining-? WHERE id=?",
        n,
        lot.id,
      );
      run("INSERT INTO p_points_allocations VALUES(?,?,?)", id, lot.id, n);
      need -= n;
    }
    if (need && !allowDebt) throw new ApiError(409, "insufficient_points");
  }
  return id;
}
export function restoreRedemptionPoints(
  redemption: Row,
  actor: string,
  reason: string,
) {
  const entry = one(
    "SELECT id FROM p_points_ledger WHERE event_key=?",
    "redeem:" + redemption.id,
  );
  const parts = entry
    ? all(
        "SELECT a.amount,l.expires_at,l.origin_entry FROM p_points_allocations a JOIN p_points_lots l ON l.id=a.lot_id WHERE a.entry_id=? ORDER BY l.id",
        entry.id,
      )
    : [];
  if (!parts.length)
    parts.push({ amount: redemption.points, expires_at: null }); // historical requests before lot tracking
  parts.forEach((part, i) =>
    pointEntry(
      redemption.user_id,
      part.amount,
      "reversal",
      redemption.id,
      `redeem-cancel:${redemption.id}:${i}`,
      reason,
      actor,
      part.expires_at,
      false,
      null,
      part.origin_entry || null,
    ),
  );
}
export function accrueOrderPoints(order: Row) {
  const p = JSON.parse(order.policy).loyaltyPolicy;
  if (!p?.enabled) return;
  const n = Number(
    (BigInt(order.amount) * BigInt(p.pointsPerUnit)) / BigInt(p.spendUnit),
  );
  if (!n) return;
  if (!Number.isSafeInteger(n)) throw new ApiError(409, "invalid_input");
  run(
    "INSERT OR IGNORE INTO p_loyalty_accruals VALUES(?,?,?,?,?,'pending')",
    order.id,
    order.user_id,
    n,
    order.cancel_until,
    p.expiryDays
      ? new Date(
          new Date(order.cancel_until).getTime() + p.expiryDays * 86400000,
        ).toISOString()
      : null,
  );
}
export function matureLoyalty(user: string | null = null) {
  for (const a of all(
    "SELECT a.* FROM p_loyalty_accruals a JOIN p_orders o ON o.id=a.order_id WHERE a.status='pending' AND a.available_at<=? AND o.refunded_at IS NULL AND (? IS NULL OR a.user_id=?) ORDER BY a.available_at,a.order_id LIMIT 500",
    now(),
    user,
    user,
  )) {
    pointEntry(
      a.user_id,
      a.points,
      "purchase",
      a.order_id,
      "purchase-points:" + a.order_id,
      "امتیاز خرید پس از پایان مهلت لغو",
      null,
      a.expires_at,
    );
    run(
      "UPDATE p_loyalty_accruals SET status='earned' WHERE order_id=?",
      a.order_id,
    );
  }
}
export function reverseOrderPoints(order: string, actor: string) {
  const a = one("SELECT * FROM p_loyalty_accruals WHERE order_id=?", order);
  if (!a || ["cancelled", "reversed"].includes(a.status)) return;
  if (a.status === "earned") {
    expirePoints(a.user_id);
    const entry = one(
      "SELECT id FROM p_points_ledger WHERE event_key=?",
      "purchase-points:" + order,
    )!;
    // An unfulfilled benefit funded by a refunded purchase is cancelled before recovery.
    for (const r of all(
      `SELECT DISTINCT r.* FROM p_redemptions r JOIN p_points_ledger e ON e.reference=r.id AND e.kind='redemption' JOIN p_points_allocations a ON a.entry_id=e.id JOIN p_points_lots l ON l.id=a.lot_id WHERE r.status='requested' AND l.origin_entry=?`,
      entry.id,
    )) {
      const reason = "لغو مزیت به علت مرجوعی سفارش";
      restoreRedemptionPoints(r, actor, reason);
      run(
        "UPDATE p_redemptions SET status='cancelled',reason=?,updated_at=? WHERE id=?",
        reason,
        now(),
        r.id,
      );
      run("UPDATE p_rewards SET stock=stock+1 WHERE id=?", r.reward_id);
      audit(
        actor,
        "reward.cancelled",
        r.id,
        { status: r.status },
        { status: "cancelled", order },
        reason,
      );
    }

    // Expired, unused source points have already been removed and are not charged a second time.
    const expired = one(
      `SELECT COALESCE(-SUM(delta),0) n FROM p_points_ledger WHERE kind='expiry' AND (reference=? OR reference IN(SELECT id FROM p_points_lots WHERE origin_entry=?))`,
      entry.id,
      entry.id,
    )!.n;
    const n = Math.max(0, a.points - expired);
    if (n)
      pointEntry(
        a.user_id,
        -n,
        "purchase_refund",
        order,
        "purchase-refund:" + order,
        "برگشت امتیاز سفارش مرجوعی",
        actor,
        null,
        true,
        entry.id,
      );
  }
  run(
    "UPDATE p_loyalty_accruals SET status=? WHERE order_id=?",
    a.status === "earned" ? "reversed" : "cancelled",
    order,
  );
}
export function saveLoyaltyLevel(actor: string, input: unknown) {
  const d = loyaltyLevelSchema.parse(input);
  return atomic(() => {
    const id = d.id || randomUUID(),
      old = one("SELECT * FROM p_loyalty_levels WHERE id=?", id);
    if (d.id && !old) throw new ApiError(404, "not_found");
    run(
      "INSERT INTO p_loyalty_levels VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,threshold=excluded.threshold,benefits=excluded.benefits,active=excluded.active",
      id,
      d.name,
      d.threshold,
      d.benefits,
      Number(d.active),
    );
    audit(actor, "loyalty.level", id, old || null, d, d.reason);
    return { id };
  });
}
export function loyaltyStatus(user: string) {
  const earned = one(
    "SELECT COALESCE(SUM(points),0) n FROM p_loyalty_accruals WHERE user_id=? AND status='earned'",
    user,
  )!.n;
  const levels = all(
    "SELECT id,name,threshold,benefits FROM p_loyalty_levels WHERE active=1 ORDER BY threshold",
  );
  const current = levels.filter((l) => l.threshold <= earned).at(-1) || null,
    next = levels.find((l) => l.threshold > earned) || null;
  return {
    earned,
    current,
    next,
    progress: next ? Math.min(1, earned / next.threshold) : current ? 1 : 0,
    pending: one(
      "SELECT COALESCE(SUM(points),0) n FROM p_loyalty_accruals WHERE user_id=? AND status='pending'",
      user,
    )!.n,
    debt: Math.max(0, -pointsNet(user)),
    expiring: all(
      "SELECT remaining,expires_at FROM p_points_lots WHERE user_id=? AND remaining>0 AND expires_at IS NOT NULL ORDER BY expires_at LIMIT 30",
      user,
    ),
  };
}
