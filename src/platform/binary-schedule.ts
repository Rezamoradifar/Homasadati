import { all, one, run, atomic, now } from "./schema";
import { setting, saveSetting } from "./providers";
import { audit } from "./security";
import {
  binaryCycle,
  binaryScheduleSchema,
  binaryScheduleUpdateSchema,
  defaultBinarySchedule,
} from "./operations-model";
import { matchBinaryForOrder } from "./finance";
export function binarySchedule() {
  const raw = setting("binary_schedule");
  return raw
    ? binaryScheduleSchema.parse(JSON.parse(raw))
    : { ...defaultBinarySchedule };
}
export function saveBinarySchedule(actor: string, input: unknown) {
  const d = binaryScheduleUpdateSchema.parse(input);
  return atomic(() => {
    const old = binarySchedule();
    saveSetting("binary_schedule", JSON.stringify(d.schedule));
    audit(
      actor,
      "binary.schedule",
      "binary_schedule",
      old,
      d.schedule,
      d.reason,
    );
    return { ok: true };
  });
}
export function runBinaryCycles(batch = 100) {
  const rawPolicy = setting("commission_policy");
  if (!rawPolicy || JSON.parse(rawPolicy).paused)
    return { processed: 0, amount: 0, matches: 0, paused: true };
  const schedules = all(
    "SELECT DISTINCT schedule FROM p_binary_scheduled_orders ORDER BY schedule",
  );
  const result = { processed: 0, amount: 0, matches: 0, paused: false };
  const start =
    Number(setting("binary_schedule_cursor") || 0) %
    Math.max(1, schedules.length);
  for (let i = 0; i < schedules.length; i++) {
    const index = (start + i) % schedules.length;
    const raw = schedules[index].schedule;
    const cycle = binaryCycle(binaryScheduleSchema.parse(JSON.parse(raw)));
    if (!cycle) continue;
    const candidates = all(
      "SELECT s.order_id FROM p_binary_scheduled_orders s JOIN p_orders o ON o.id=s.order_id WHERE s.schedule=? AND s.paid_at<=? AND o.refunded_at IS NULL AND (s.last_cycle IS NULL OR s.last_cycle!=?) ORDER BY s.paid_at,s.order_id LIMIT ?",
      raw,
      cycle.cutoff,
      cycle.key,
      Math.min(50, batch - result.processed),
    );
    for (const candidate of candidates) {
      const outcome = atomic(() => {
        const order = one(
          "SELECT * FROM p_orders WHERE id=? AND paid_at<=? AND refunded_at IS NULL",
          candidate.order_id,
          cycle.cutoff,
        );
        if (
          !order ||
          one(
            "SELECT order_id FROM p_binary_order_cycles WHERE order_id=? AND cycle_key=?",
            candidate.order_id,
            cycle.key,
          )
        )
          return null;
        const p = JSON.parse(order.policy);
        const used = one(
          "SELECT COALESCE(SUM(amount),0) n FROM p_commissions WHERE order_id=? AND status!='reversed'",
          order.id,
        )!.n;
        let budget = Math.max(
          0,
          Number((BigInt(order.amount) * BigInt(p.maxPayoutBps)) / 10000n) -
            used,
        );
        const initial = budget;
        let matches = 0;
        // The original sale's placement beneficiaries remain fixed even if a
        // member is later moved. No synthetic order or treasury credit is made.
        const parents = all(
          "SELECT user_id FROM p_binary_lots WHERE order_id=? AND void=0 ORDER BY rowid",
          order.id,
        );
        for (const parent of parents) {
          if (!budget || matches >= 500) break;
          const quote = matchBinaryForOrder(
            order,
            parent.user_id,
            budget,
            500 - matches,
            cycle.cutoff,
          );
          budget = quote.budget;
          matches += quote.matches;
        }
        run(
          "INSERT INTO p_binary_order_cycles VALUES(?,?,?,?,?)",
          order.id,
          cycle.key,
          initial - budget,
          matches,
          now(),
        );
        run(
          "UPDATE p_binary_scheduled_orders SET last_cycle=? WHERE order_id=?",
          cycle.key,
          order.id,
        );
        return { amount: initial - budget, matches };
      });
      if (outcome) {
        result.processed++;
        result.amount += outcome.amount;
        result.matches += outcome.matches;
      }
    }
    saveSetting(
      "binary_schedule_cursor",
      String((index + 1) % schedules.length),
    );
    if (result.processed >= batch) break;
  }
  saveSetting("binary_cycle_last_success", now());
  return result;
}
