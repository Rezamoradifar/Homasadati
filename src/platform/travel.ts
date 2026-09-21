import { randomUUID } from "node:crypto";
import { all, one, run, atomic, now, Row } from "./schema";
import { sales } from "./finance";
import { audit } from "./security";
import { ApiError } from "../server/http";
import { setting, saveSetting } from "./providers";
import {
  travelRuleSchema,
  travelCalendarSchema,
  travelRequestSchema,
  travelReviewSchema,
  tehranDay,
  workingDaysBefore,
} from "./travel-model";
export function travelCalendar() {
  const raw = setting("travel_calendar");
  return raw
    ? (JSON.parse(raw) as { weekends: number[]; holidays: string[] })
    : { weekends: [5], holidays: [] };
}
function craftPurchase(user: string) {
  return one(
    "SELECT id FROM p_orders WHERE user_id=? AND vertical='craft' AND paid_at IS NOT NULL AND refunded_at IS NULL AND status IN ('processing','shipped','delivered') AND cancel_until IS NOT NULL AND cancel_until<=? ORDER BY paid_at LIMIT 1",
    user,
    now(),
  );
}
export function cardEligible(card: Row) {
  if (!one("SELECT id FROM p_users WHERE id=? AND blocked=0", card.user_id))
    return false;
  const s = sales(card.user_id);
  return (
    !!craftPurchase(card.user_id) &&
    s.personal >= card.personal_threshold &&
    s.group >= card.group_threshold
  );
}
export function cardsFor(user: string): Row[] {
  return all(
    "SELECT c.*, (SELECT tone FROM p_travel_presets WHERE rank_id=c.rank_id ORDER BY level LIMIT 1) tone, (SELECT level FROM p_travel_presets WHERE rank_id=c.rank_id ORDER BY level LIMIT 1) level FROM p_travel_cards c WHERE c.user_id=? ORDER BY c.issued_at DESC",
    user,
  ).map((c) => ({
    ...c,
    eligible: cardEligible(c),
    expired: c.expires_on < tehranDay(),
  }));
}
export function issueTravelCards(user: string) {
  return atomic(() => {
    const u = one("SELECT * FROM p_users WHERE id=? AND blocked=0", user);
    if (!u) throw new ApiError(401, "unauthorized");
    const order = craftPurchase(user);
    if (!order) return cardsFor(user);
    const s = sales(user);
    for (const r of all(
      "SELECT t.*,r.name,r.personal_threshold,r.group_threshold FROM p_travel_rules t JOIN p_ranks r ON r.id=t.rank_id WHERE t.active=1",
    )) {
      if (s.personal < r.personal_threshold || s.group < r.group_threshold)
        continue;
      const expires = new Date(tehranDay() + "T00:00:00Z");
      expires.setUTCDate(expires.getUTCDate() + r.valid_days);
      const id = randomUUID();
      const inserted = run(
        "INSERT OR IGNORE INTO p_travel_cards(id,user_id,rank_id,holder_name,rank_name,issued,available,reserved,spent,personal_threshold,group_threshold,qualifying_order,issued_at,expires_on) VALUES(?,?,?,?,?,?,?,0,0,?,?,?,?,?)",
        id,
        user,
        r.rank_id,
        u.name,
        r.name,
        r.amount,
        r.amount,
        r.personal_threshold,
        r.group_threshold,
        order.id,
        now(),
        expires.toISOString().slice(0, 10),
      );
      if (inserted.changes)
        audit(
          user,
          "travel.card.issue",
          id,
          null,
          { rank: r.name, amount: r.amount, order: order.id },
          "صدور یک‌بار برای رتبه واجدشرایط",
        );
    }
    return cardsFor(user);
  });
}
export function saveTravelRule(actor: string, input: unknown) {
  const d = travelRuleSchema.parse(input);
  atomic(() => {
    if (!one("SELECT id FROM p_ranks WHERE id=?", d.rankId))
      throw new ApiError(404, "not_found");
    const before = one(
      "SELECT * FROM p_travel_rules WHERE rank_id=?",
      d.rankId,
    );
    run(
      "INSERT INTO p_travel_rules VALUES(?,?,?,?,?) ON CONFLICT(rank_id) DO UPDATE SET amount=excluded.amount,valid_days=excluded.valid_days,active=excluded.active,updated_at=excluded.updated_at",
      d.rankId,
      d.amount,
      d.validDays,
      Number(d.active),
      now(),
    );
    audit(actor, "travel.rule.update", d.rankId, before, d, d.reason);
  });
}
export function saveTravelCalendar(actor: string, input: unknown) {
  const d = travelCalendarSchema.parse(input);
  atomic(() => {
    const before = travelCalendar();
    saveSetting(
      "travel_calendar",
      JSON.stringify({
        weekends: [...new Set(d.weekends)],
        holidays: [...new Set(d.holidays)],
      }),
    );
    audit(
      actor,
      "travel.calendar.update",
      "travel_calendar",
      before,
      d,
      d.reason,
    );
  });
}
export function requestTravel(user: string, input: unknown) {
  const d = travelRequestSchema.parse(input);
  return atomic(() => {
    const old = one(
      "SELECT * FROM p_travel_requests WHERE user_id=? AND idem_key=?",
      user,
      d.idempotencyKey,
    );
    if (old) {
      if (old.payload !== JSON.stringify(d))
        throw new ApiError(409, "invalid_state");
      return old;
    }
    const card = one(
      "SELECT * FROM p_travel_cards WHERE id=? AND user_id=?",
      d.cardId,
      user,
    );
    if (!card) throw new ApiError(404, "not_found");
    const today = tehranDay(),
      calendar = travelCalendar();
    if (
      d.travelDate <= today ||
      d.travelDate > card.expires_on ||
      workingDaysBefore(
        today,
        d.travelDate,
        calendar.weekends,
        calendar.holidays,
      ) < 7
    )
      throw new ApiError(400, "travel_notice");
    if (!cardEligible(card)) throw new ApiError(409, "travel_ineligible");
    if (card.available < d.amount)
      throw new ApiError(409, "insufficient_balance");
    const p = one(
      "SELECT * FROM p_products WHERE id=? AND vertical='tourism' AND published=1 AND stock>0",
      d.productId,
    );
    if (!p) throw new ApiError(409, "product_unavailable");
    if (d.amount > p.price) throw new ApiError(400, "invalid_input");
    const id = randomUUID();
    run(
      "UPDATE p_travel_cards SET available=available-?,reserved=reserved+? WHERE id=?",
      d.amount,
      d.amount,
      card.id,
    );
    run(
      "INSERT INTO p_travel_requests(id,user_id,card_id,product_id,title,travel_date,amount,quoted_total,status,note,reference,created_at,updated_at,idem_key,payload,calendar) VALUES(?,?,?,?,?,?,?,?,'requested',?,'',?,?,?,?,?)",
      id,
      user,
      card.id,
      p.id,
      p.title,
      d.travelDate,
      d.amount,
      p.price,
      d.note,
      now(),
      now(),
      d.idempotencyKey,
      JSON.stringify(d),
      JSON.stringify(calendar),
    );
    audit(
      user,
      "travel.request",
      id,
      null,
      { card: card.id, amount: d.amount, travelDate: d.travelDate },
      d.note,
    );
    return one("SELECT * FROM p_travel_requests WHERE id=?", id)!;
  });
}
export function reviewTravel(actor: string, input: unknown, own = false) {
  const d = travelReviewSchema.parse(input);
  return atomic(() => {
    const r = one("SELECT * FROM p_travel_requests WHERE id=?", d.id);
    if (!r) throw new ApiError(404, "not_found");
    if (
      own &&
      (r.user_id !== actor ||
        r.status !== "requested" ||
        d.status !== "cancelled")
    )
      throw new ApiError(403, "forbidden");
    const valid =
      (r.status === "requested" &&
        ["approved", "rejected", "cancelled"].includes(d.status)) ||
      (r.status === "approved" && ["redeemed", "cancelled"].includes(d.status));
    if (!valid) throw new ApiError(409, "invalid_state");
    const card = one("SELECT * FROM p_travel_cards WHERE id=?", r.card_id)!;
    if (["approved", "redeemed"].includes(d.status)) {
      if (!cardEligible(card) || card.expires_on < tehranDay())
        throw new ApiError(409, "travel_ineligible");
      if (r.travel_date < tehranDay()) throw new ApiError(400, "travel_notice");
    }
    if (d.status === "approved") {
      if (!d.reference) throw new ApiError(400, "invalid_input");
      const stock = run(
        "UPDATE p_products SET stock=stock-1,updated_at=? WHERE id=? AND stock>0 AND published=1 AND price=?",
        now(),
        r.product_id,
        r.quoted_total,
      );
      if (!stock.changes) throw new ApiError(409, "product_changed");
    }
    if (d.status === "redeemed") {
      if (!d.reference) throw new ApiError(400, "invalid_input");
      run(
        "UPDATE p_travel_cards SET reserved=reserved-?,spent=spent+? WHERE id=?",
        r.amount,
        r.amount,
        r.card_id,
      );
    }
    if (["rejected", "cancelled"].includes(d.status)) {
      run(
        "UPDATE p_travel_cards SET reserved=reserved-?,available=available+? WHERE id=?",
        r.amount,
        r.amount,
        r.card_id,
      );
      if (r.status === "approved")
        run(
          "UPDATE p_products SET stock=stock+1,updated_at=? WHERE id=?",
          now(),
          r.product_id,
        );
    }
    run(
      "UPDATE p_travel_requests SET status=?,reference=?,updated_at=?,decision_reason=? WHERE id=?",
      d.status,
      d.reference,
      now(),
      d.reason,
      r.id,
    );
    audit(
      actor,
      "travel.request." + d.status,
      r.id,
      r,
      { ...r, status: d.status, reference: d.reference },
      d.reason,
    );
    return one("SELECT * FROM p_travel_requests WHERE id=?", r.id)!;
  });
}
