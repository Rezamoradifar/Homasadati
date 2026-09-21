import { all, one, run, now, Row, atomic, platformDb } from "./schema";
import { setting, saveSetting } from "./providers";
import { audit } from "./security";
import { z } from "zod";
import { text } from "./validation";
import {
  BinaryRules,
  binaryRulesSchema,
  legacyBinaryRules,
} from "./network-rules-model";
export function binaryRules(): BinaryRules {
  const raw = setting("binary_rules");
  return raw
    ? binaryRulesSchema.parse(JSON.parse(raw))
    : { ...legacyBinaryRules };
}
export function saveBinaryRules(actor: string, input: unknown) {
  const d = z
    .object({ rules: binaryRulesSchema, reason: text })
    .strict()
    .parse(input);
  return atomic(() => {
    const old = binaryRules();
    saveSetting("binary_rules", JSON.stringify(d.rules));
    audit(actor, "binary.rules", "binary_rules", old, d.rules, d.reason);
    return { ok: true };
  });
}
export function binaryDay(value = now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function dailyBinaryEarned(user: string) {
  return all(
    "SELECT amount,created_at FROM p_commissions WHERE user_id=? AND kind='binary' AND status!='reversed' AND created_at>=?",
    user,
    new Date(Date.now() - 27 * 3600000).toISOString(),
  )
    .filter((r) => binaryDay(r.created_at) === binaryDay())
    .reduce((s, r) => s + r.amount, 0);
}
export function binaryEligible(user: string, rules: BinaryRules) {
  const u = one("SELECT blocked FROM p_users WHERE id=?", user);
  if (!u || u.blocked) return false;
  const since = new Date(
    Date.now() - rules.activityDays * 86400000,
  ).toISOString();
  const personal = one(
    "SELECT COALESCE(SUM(amount),0) n FROM p_orders WHERE user_id=? AND paid_at>=? AND refunded_at IS NULL",
    user,
    since,
  )!.n;
  const directs = one(
    "SELECT COUNT(*) n FROM p_users u WHERE sponsor_id=? AND blocked=0 AND EXISTS(SELECT 1 FROM p_orders o WHERE o.user_id=u.id AND paid_at>=? AND refunded_at IS NULL)",
    user,
    since,
  )!.n;
  return personal >= rules.personalMinimum && directs >= rules.directMinimum;
}
export function saveLotTerms(lot: string, rules: BinaryRules) {
  run(
    "INSERT INTO p_binary_lot_terms(lot_id,expires_at) VALUES(?,?)",
    lot,
    rules.carryDays
      ? new Date(Date.now() + rules.carryDays * 86400000).toISOString()
      : null,
  );
}
export function nextBinaryLots(
  user: string,
  leg: string,
  minimumVolume: number,
): Row[] {
  const result: Row[] = [];
  let total = 0;
  // Collect a FIFO prefix, including fragments smaller than a matching ratio.
  for (const value of platformDb()
    .prepare(
      `SELECT l.* FROM p_binary_lots l LEFT JOIN p_binary_lot_terms t ON t.lot_id=l.id WHERE l.user_id=? AND l.leg=? AND l.remaining>0 AND l.void=0 AND (t.expires_at IS NULL OR t.expires_at>?) ORDER BY l.created_at,l.id`,
    )
    .iterate(user, leg, now())) {
    const lot = value as Row;
    result.push(lot);
    total += lot.remaining;
    if (total >= minimumVolume) break;
  }
  return result;
}
export function lotAllocations(lots: Row[], amount: number) {
  let need = amount;
  const result: { lot: Row; volume: number }[] = [];
  for (const lot of lots) {
    const volume = Math.min(lot.remaining, need);
    if (!volume) break;
    result.push({ lot, volume });
    need -= volume;
  }
  return result;
}
export function restoreMatch(m: Row, excludedOrder = "") {
  const allocations = all(
    "SELECT lot_id,volume FROM p_binary_match_allocations WHERE match_id=?",
    m.id,
  );
  if (allocations.length) {
    for (const a of allocations)
      run(
        "UPDATE p_binary_lots SET remaining=remaining+? WHERE id=? AND order_id!=? AND void=0",
        a.volume,
        a.lot_id,
        excludedOrder,
      );
    return;
  }

  const terms = one(
    "SELECT * FROM p_binary_match_terms WHERE match_id=?",
    m.id,
  );
  for (const [lot, n] of [
    [m.left_lot, terms?.left_volume ?? m.volume],
    [m.right_lot, terms?.right_volume ?? m.volume],
  ])
    run(
      "UPDATE p_binary_lots SET remaining=remaining+? WHERE id=? AND order_id!=? AND void=0",
      n,
      lot,
      excludedOrder,
    );
}
