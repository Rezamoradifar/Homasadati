import {pointsNet, pointEntry, expirePoints, matureLoyalty, restoreRedemptionPoints, loyaltyStatus} from "./loyalty-engine";
import { randomUUID } from "node:crypto";
import { all, one, run, atomic, now } from "./schema";
import { audit } from "./security";
import { ApiError } from "../server/http";
import {
  merchantSchema,
  pointsAdjustmentSchema,
  rewardSchema,
  redeemSchema,
  redemptionReviewSchema,
} from "./club-model";

export function pointBalance(user:string) {return Math.max(0,pointsNet(user));}
export function adjustPoints(actor: string, input: unknown) {
  const d = pointsAdjustmentSchema.parse(input);
  return atomic(() => {
    const old = one(
      "SELECT * FROM p_points_ledger WHERE event_key=?",
      "adjust:" + actor + ":" + d.idempotencyKey,
    );
    if (old) {
      if (
        old.user_id !== d.userId ||
        old.delta !== d.delta ||
        old.reason !== d.reason
      )
        throw new ApiError(409, "idempotency_conflict");
      return { id: old.id, balance: pointBalance(d.userId) };
    }
    if (!one("SELECT id FROM p_users WHERE id=? AND blocked=0", d.userId))
      throw new ApiError(404, "not_found");
    expirePoints(d.userId);
    const before = pointsNet(d.userId);
    const id = pointEntry(
      d.userId,
      d.delta,
      "adjustment",
      "",
      "adjust:" + actor + ":" + d.idempotencyKey,
      d.reason,
      actor,
    );
    audit(
      actor,
      "points.adjust",
      d.userId,
      { balance: before },
      { balance: before + d.delta, entry: id },
      d.reason,
    );
    return { id, balance: pointBalance(d.userId), debt:Math.max(0,-pointsNet(d.userId)) };
  });
}
export function saveMerchant(actor: string, input: unknown) {
  const d = merchantSchema.parse(input);
  return atomic(() => {
    const id = d.id || randomUUID(),
      old = one("SELECT * FROM p_merchants WHERE id=?", id);
    if (d.id && !old) throw new ApiError(404, "not_found");
    run(
      `INSERT INTO p_merchants VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,category=excluded.category,city=excluded.city,address=excluded.address,
      phone=excluded.phone,website=excluded.website,description=excluded.description,active=excluded.active,updated_at=excluded.updated_at`,
      id,
      d.name,
      d.category,
      d.city,
      d.address,
      d.phone,
      d.website,
      d.description,
      Number(d.active),
      old?.created_at || now(),
      now(),
    );
    audit(actor, "merchant.save", id, old || null, { ...d, id }, d.reason);
    return { id };
  });
}
export function saveReward(actor: string, input: unknown) {
  const d = rewardSchema.parse(input);
  return atomic(() => {
    const id = d.id || randomUUID(),
      old = one("SELECT * FROM p_rewards WHERE id=?", id);
    if (d.id && !old) throw new ApiError(404, "not_found");
    if(old&&((d.expected_stock!==undefined&&d.expected_stock!==old.stock)||(d.expected_updated_at&&d.expected_updated_at!==old.updated_at)))throw new ApiError(409,"product_changed");
    run(
      `INSERT INTO p_rewards VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,description=excluded.description,points=excluded.points,stock=excluded.stock,active=excluded.active,updated_at=excluded.updated_at`,
      id,
      d.title,
      d.description,
      d.points,
      d.stock,
      Number(d.active),
      old?.created_at || now(),
      now(),
    );
    audit(actor, "reward.save", id, old || null, { ...d, id }, d.reason);
    return { id };
  });
}
export function redeemReward(user: string, input: unknown) {
  const d = redeemSchema.parse(input);
  return atomic(() => {
    matureLoyalty(user);
    expirePoints(user);
    const old = one(
      "SELECT * FROM p_redemptions WHERE user_id=? AND idem_key=?",
      user,
      d.idempotencyKey,
    );
    if (old) {
      if (old.reward_id !== d.rewardId)
        throw new ApiError(409, "idempotency_conflict");
      return old;
    }
    const reward = one(
      "SELECT * FROM p_rewards WHERE id=? AND active=1",
      d.rewardId,
    );
    if (!reward) throw new ApiError(404, "not_found");
    if (
      !run(
        "UPDATE p_rewards SET stock=stock-1 WHERE id=? AND stock>0",
        reward.id,
      ).changes
    )
      throw new ApiError(409, "out_of_stock");
    const id = randomUUID();
    pointEntry(
      user,
      -reward.points,
      "redemption",
      id,
      "redeem:" + id,
      "درخواست استفاده از مزیت",
      user,
    );
    run(
      "INSERT INTO p_redemptions VALUES(?,?,?,?,?,'requested',?,?,?,'')",
      id,
      user,
      reward.id,
      reward.title,
      reward.points,
      d.idempotencyKey,
      now(),
      now(),
    );
    audit(user, "reward.redeem", id, null, {
      reward: reward.id,
      points: reward.points,
    });
    return one("SELECT * FROM p_redemptions WHERE id=?", id)!;
  });
}
export function reviewRedemption(actor: string, input: unknown) {
  const d = redemptionReviewSchema.parse(input);
  return atomic(() => {
    const old = one("SELECT * FROM p_redemptions WHERE id=?", d.id);
    if (!old) throw new ApiError(404, "not_found");
    if (old.status === d.status) return { ok: true };
    if (old.status !== "requested") throw new ApiError(409, "invalid_state");
    if (d.status === "cancelled") {
      restoreRedemptionPoints(old,actor,d.reason);
      run("UPDATE p_rewards SET stock=stock+1 WHERE id=?", old.reward_id);
    }
    run(
      "UPDATE p_redemptions SET status=?,reason=?,updated_at=? WHERE id=?",
      d.status,
      d.reason,
      now(),
      old.id,
    );
    audit(
      actor,
      "reward." + d.status,
      old.id,
      { status: old.status },
      { status: d.status },
      d.reason,
    );
    return { ok: true };
  });
}
export function clubSummary(user: string, page = 1) {
  return atomic(()=> {
  matureLoyalty(user);
  expirePoints(user);
  const rows = all(
    "SELECT id,delta,kind,reference,reason,created_at FROM p_points_ledger WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 31 OFFSET ?",
    user,
    (page - 1) * 30,
  );
  return {
    balance: pointBalance(user),
    loyalty:loyaltyStatus(user),
    rows: rows.slice(0, 30),
    hasMore: rows.length > 30,
    page,
    rewards: all(
      "SELECT id,title,description,points,stock FROM p_rewards WHERE active=1 ORDER BY points,id LIMIT 100",
    ),
    redemptions: all(
      "SELECT id,title,points,status,reason,created_at FROM p_redemptions WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
      user,
    ),
  };  });
}
