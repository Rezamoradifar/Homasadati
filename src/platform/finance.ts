import { restoreOrderVoucher, reverseCardOrder } from "./seven-card-engine";
import {
  paymentActor,
  approveWithdrawal,
  confirmWithdrawal,
} from "./payment-controls";
import { binarySchedule } from "./binary-schedule";
import {
  merchantTerms,
  recordMerchantSale,
  reverseMerchantSale,
} from "./merchant-operations";
import {
  loyaltyPolicy,
  accrueOrderPoints,
  reverseOrderPoints,
} from "./loyalty-engine";
import {
  binaryRules,
  binaryEligible,
  dailyBinaryEarned,
  binaryDay,
  saveLotTerms,
  nextBinaryLots,
  lotAllocations,
  restoreMatch,
} from "./network-rules";
import { binaryQuote, legacyBinaryRules } from "./network-rules-model";
import { publicCatalogDetails } from "./catalog-model";
import { randomUUID } from "node:crypto";
import { ApiError } from "../server/http";
import { all, one, run, atomic, now, Row } from "./schema";
import { policy, setting } from "./providers";
import { audit } from "./security";
import type { Policy } from "./validation";
const percent = (amount: number, bps: number) =>
  Number((BigInt(amount) * BigInt(bps)) / 10000n);
export function wallet(user: string) {
  return one("SELECT * FROM p_wallets WHERE user_id=?", user)!;
}
export function ledger(
  user: string,
  key: string,
  kind: string,
  reference: string,
  a = 0,
  p = 0,
  h = 0,
  d = 0,
) {
  if (one("SELECT id FROM p_ledger WHERE event_key=?", key)) return;
  if (![a, p, h, d].every(Number.isSafeInteger))
    throw new ApiError(400, "invalid_input");
  const balance = wallet(user);
  if (
    !balance ||
    ![
      balance.available + a,
      balance.pending + p,
      balance.held + h,
      balance.debt + d,
    ].every((v) => Number.isSafeInteger(v) && v >= 0)
  )
    throw new ApiError(409, "insufficient_balance");

  run(
    "UPDATE p_wallets SET available=available+?,pending=pending+?,held=held+?,debt=debt+? WHERE user_id=?",
    a,
    p,
    h,
    d,
    user,
  );
  run(
    "INSERT INTO p_ledger VALUES(?,?,?,?,?,?,?,?,?,?)",
    randomUUID(),
    user,
    key,
    kind,
    a,
    p,
    h,
    d,
    reference,
    now(),
  );
}
function credit(
  user: string,
  key: string,
  kind: string,
  reference: string,
  amount: number,
) {
  const debt = Math.min(wallet(user).debt, amount);
  ledger(user, key, kind, reference, amount - debt, 0, 0, -debt);
}
export function notify(user: string, title: string, body: string) {
  const u = one("SELECT * FROM p_users WHERE id=?", user);
  if (!u) return;
  const preferences = JSON.parse(u.preferences);
  if (preferences.inApp)
    run(
      "INSERT INTO p_notifications VALUES(?,?,?,?,NULL,?)",
      randomUUID(),
      user,
      title,
      body,
      now(),
    );
  for (const channel of ["email", "sms"]) {
    const target = channel === "email" ? u.email : u.phone;
    if (preferences[channel] && target)
      run(
        "INSERT INTO p_outbox(id,user_id,channel,target,subject,body,created_at) VALUES(?,?,?,?,?,?,?)",
        randomUUID(),
        user,
        channel,
        target,
        title,
        body,
        now(),
      );
  }
}
export function descendants(root: string) {
  return all(
    `WITH RECURSIVE tree(id,depth) AS (SELECT id,1 FROM p_users WHERE sponsor_id=? UNION ALL SELECT u.id,t.depth+1 FROM p_users u JOIN tree t ON u.sponsor_id=t.id ) SELECT id,depth FROM tree`,
    root,
  );
}
export function sales(user: string, since = "0000", until = "9999") {
  const personal = one(
    "SELECT COALESCE(SUM(amount),0) n FROM p_orders WHERE user_id=? AND paid_at>=? AND paid_at<=? AND refunded_at IS NULL",
    user,
    since,
    until,
  )!.n;
  const group = one(
    `WITH RECURSIVE team(id) AS (SELECT id FROM p_users WHERE sponsor_id=? UNION ALL SELECT u.id FROM p_users u JOIN team t ON u.sponsor_id=t.id) SELECT COALESCE(SUM(amount),0) n FROM p_orders WHERE user_id IN (SELECT id FROM team) AND paid_at>=? AND paid_at<=? AND refunded_at IS NULL`,
    user,
    since,
    until,
  )!.n;
  return { personal, group };
}
export function rankProgress(user: string) {
  const s = sales(user);
  const ranks = all(
    "SELECT * FROM p_ranks ORDER BY personal_threshold+group_threshold, id",
  );
  let current: Row | null = null,
    next: Row | null = null;
  for (const r of ranks) {
    if (s.personal >= r.personal_threshold && s.group >= r.group_threshold)
      current = r;
    else if (!next) next = r;
  }
  const progress = next
    ? Math.min(
        1,
        next.personal_threshold ? s.personal / next.personal_threshold : 1,
        next.group_threshold ? s.group / next.group_threshold : 1,
      )
    : current
      ? 1
      : 0;
  return { current, next, progress, ...s };
}
export function health(from = "0000", to = "9999") {
  const revenue = one(
    "SELECT COALESCE(SUM(amount),0) n FROM p_orders WHERE paid_at>=? AND paid_at<=? AND refunded_at IS NULL",
    from,
    to,
  )!.n;
  const liability = one(
    "SELECT COALESCE(SUM(c.amount),0) n FROM p_commissions c JOIN p_orders o ON o.id=c.order_id WHERE c.status!='reversed' AND o.paid_at>=? AND o.paid_at<=?",
    from,
    to,
  )!.n;
  const paid = one(
    "SELECT COALESCE(SUM(amount),0) n FROM p_withdrawals WHERE status='paid' AND updated_at>=? AND updated_at<=?",
    from,
    to,
  )!.n;
  const ratioBps = revenue ? Math.floor((liability * 10000) / revenue) : null;
  const cashPayoutBps = revenue ? Math.floor((paid * 10000) / revenue) : null;
  const noSalesExposure = revenue === 0 && (liability > 0 || paid > 0);
  const guardRatio = Math.max(ratioBps ?? 0, cashPayoutBps ?? 0);
  const raw = setting("commission_policy");
  const p = raw ? (JSON.parse(raw) as Policy) : null;
  return {
    configured: !!p,
    revenue,
    commissionLiability: liability,
    paid,
    ratioBps,
    cashPayoutBps,
    noSalesExposure,
    status: !p
      ? "unconfigured"
      : noSalesExposure || guardRatio >= p.criticalBps
        ? "red"
        : guardRatio >= p.warningBps
          ? "yellow"
          : "green",
    paused: p?.paused ?? false,
  };
}
export function payoutGuard() {
  const h = health();
  if (!h.configured || h.paused || h.status === "red")
    throw new ApiError(409, "payouts_paused");
}
function award(
  user: string,
  order: Row,
  kind: string,
  amount: number,
  key: string,
  availableAt = order.cancel_until,
) {
  if (amount <= 0) return null;
  const id = randomUUID();
  run(
    "INSERT INTO p_commissions VALUES(?,?,?,?,?,?,?,?,?)",
    id,
    user,
    order.id,
    kind,
    amount,
    "pending",
    availableAt,
    now(),
    key,
  );
  ledger(user, "earn:" + id, "commission", id, 0, amount);
  notify(
    user,
    "پورسانت جدید",
    `${amount.toLocaleString("fa-IR")} تومان در انتظار پایان مهلت لغو`,
  );
  return id;
}
export function calculateCommissions(order: Row) {
  const p = JSON.parse(order.policy) as Policy;
  let budget = percent(order.amount, p.maxPayoutBps);
  const buyer = one("SELECT * FROM p_users WHERE id=?", order.user_id)!;
  let sponsor = buyer.sponsor_id,
    depth = 0;
  const seen = new Set<string>();
  const rankAwards: { user: string; rate: number }[] = [];
  while (sponsor && depth <= p.levels.length && !seen.has(sponsor)) {
    seen.add(sponsor);
    const ancestor = one("SELECT * FROM p_users WHERE id=?", sponsor)!;
    const rate = depth === 0 ? p.directBps : p.levels[depth - 1];
    const n = Math.min(budget, percent(order.amount, rate));
    if (!ancestor.blocked) {
      award(
        sponsor,
        order,
        depth === 0 ? "direct" : "level",
        n,
        `sale:${order.id}:${sponsor}:${depth}`,
      );
      budget -= n;
      const rank = rankProgress(sponsor).current;
      if (rank) rankAwards.push({ user: sponsor, rate: rank.bonus_bps });
    }
    sponsor = ancestor.sponsor_id;
    depth++;
  }
  for (const rank of rankAwards) {
    const bonus = Math.min(budget, percent(order.amount, rank.rate));
    award(rank.user, order, "rank", bonus, `rank:${order.id}:${rank.user}`);
    budget -= bonus;
  }
  // While the seven-card plan settles live, its engine owns binary volume.
  if (setting("seven_card_live") === "1") return;
  const rules = JSON.parse(order.policy).binaryRules || legacyBinaryRules;
  let child = buyer;
  const parents = new Set<string>();
  while (child.parent_id && !parents.has(child.parent_id)) {
    parents.add(child.parent_id);
    const parent = one("SELECT * FROM p_users WHERE id=?", child.parent_id)!;
    const lotId = randomUUID();
    run(
      "INSERT INTO p_binary_lots VALUES(?,?,?,?,?,?,0,?)",
      lotId,
      order.id,
      parent.id,
      child.leg,
      order.amount,
      order.amount,
      now(),
    );
    saveLotTerms(lotId, rules);
    if (
      (JSON.parse(order.policy).binarySchedule?.mode || "immediate") ===
      "immediate"
    )
      budget = matchBinaryForOrder(order, parent.id, budget).budget;
    child = parent;
  }
}
export function matchBinaryForOrder(
  order: Row,
  user: string,
  budget: number,
  maxMatches = Number.MAX_SAFE_INTEGER,
  cutoff = now(),
) {
  const p = JSON.parse(order.policy);
  const rules = p.binaryRules || legacyBinaryRules;
  let matches = 0;
  if (p.binaryBps && binaryEligible(user, rules)) {
    while (budget > 0 && matches < maxMatches) {
      const minimumUnits = Math.ceil(10000 / p.binaryBps);
      const leftLots = nextBinaryLots(
          user,
          "left",
          rules.leftRatio * minimumUnits,
          cutoff,
        ),
        rightLots = nextBinaryLots(
          user,
          "right",
          rules.rightRatio * minimumUnits,
          cutoff,
        );
      if (!leftLots.length || !rightLots.length) break;
      const result = binaryQuote({
        left: leftLots.reduce((n, l) => n + l.remaining, 0),
        right: rightLots.reduce((n, l) => n + l.remaining, 0),
        budget,
        alreadyEarned: dailyBinaryEarned(user),
        rateBps: p.binaryBps,
        eligible: true,
        rules,
      });
      const { volume, amount } = result;
      if (!amount) break;
      const allocations = [
        ...lotAllocations(leftLots, result.leftConsumed),
        ...lotAllocations(rightLots, result.rightConsumed),
      ];
      const l = leftLots[0],
        r = rightLots[0],
        match = randomUUID();
      const maturity = [
        order.cancel_until,
        ...allocations.map(
          (a) =>
            one("SELECT cancel_until FROM p_orders WHERE id=?", a.lot.order_id)!
              .cancel_until,
        ),
      ]
        .sort()
        .at(-1);
      const commission = award(
        user,
        order,
        "binary",
        amount,
        "binary:" + match,
        maturity,
      );
      run(
        "INSERT INTO p_binary_matches VALUES(?,?,?,?,?,0)",
        match,
        l.id,
        r.id,
        volume,
        commission,
      );
      for (const a of allocations) {
        run(
          "UPDATE p_binary_lots SET remaining=remaining-? WHERE id=?",
          a.volume,
          a.lot.id,
        );
        run(
          "INSERT INTO p_binary_match_allocations VALUES(?,?,?)",
          match,
          a.lot.id,
          a.volume,
        );
      }
      run(
        "INSERT INTO p_binary_match_terms VALUES(?,?,?,?,?)",
        match,
        result.leftConsumed,
        result.rightConsumed,
        JSON.stringify(rules),
        binaryDay(),
      );
      budget -= amount;
      matches++;
    }
  }
  return { budget, matches };
}
export function mature() {
  for (const c of all(
    "SELECT * FROM p_commissions WHERE status='pending' AND available_at<=?",
    now(),
  )) {
    const debt = Math.min(wallet(c.user_id).debt, c.amount);
    ledger(
      c.user_id,
      "release:" + c.id,
      "commission_release",
      c.id,
      c.amount - debt,
      -c.amount,
      0,
      -debt,
    );
    run("UPDATE p_commissions SET status='available' WHERE id=?", c.id);
  }
}
export function settleOrder(orderId: string, reference: string) {
  return atomic(() => {
    const o = one("SELECT * FROM p_orders WHERE id=?", orderId);
    if (!o) throw new ApiError(404, "not_found");
    if (o.paid_at) return o;
    if (o.status === "cancelled") {
      run(
        "UPDATE p_orders SET status='refunded',payment_ref=?,paid_at=?,refunded_at=? WHERE id=?",
        reference,
        now(),
        now(),
        o.id,
      );
      // Only the cash share was paid late; any voucher share went back on cancellation.
      const voucherShare =
        one("SELECT amount FROM p_order_vouchers WHERE order_id=?", o.id)?.amount || 0;
      if (o.amount > voucherShare)
        credit(
          o.user_id,
          "late-payment:" + o.id,
          "late_payment_refund",
          o.id,
          o.amount - voucherShare,
        );
      notify(
        o.user_id,
        "بازگشت پرداخت دیرهنگام",
        "پرداخت پس از انقضای سفارش دریافت شد و به کیف پول بازگشت.",
      );
      return one("SELECT * FROM p_orders WHERE id=?", o.id)!;
    }
    if (o.status !== "pending") throw new ApiError(409, "invalid_state");
    const product = one("SELECT * FROM p_products WHERE id=?", o.product_id)!;
    const terms = JSON.parse(o.policy).orderTerms || {
      cancelHours: product.cancel_hours,
      durationDays: product.duration_days,
    };
    run(
      "UPDATE p_orders SET status='processing',payment_ref=?,paid_at=?,cancel_until=? WHERE id=?",
      reference,
      now(),
      new Date(Date.now() + terms.cancelHours * 3600000).toISOString(),
      o.id,
    );
    const saved = one("SELECT * FROM p_orders WHERE id=?", o.id)!;
    calculateCommissions(saved);
    const schedule = JSON.parse(saved.policy).binarySchedule;
    if (schedule && schedule.mode !== "immediate")
      run(
        "INSERT OR IGNORE INTO p_binary_scheduled_orders(order_id,schedule,paid_at) VALUES(?,?,?)",
        saved.id,
        JSON.stringify(schedule),
        saved.paid_at,
      );
    accrueOrderPoints(saved);
    recordMerchantSale(saved);
    if (o.vertical === "ai") {
      const last = one(
        "SELECT MAX(expires_at) expires FROM p_subscriptions WHERE user_id=? AND product_id=? AND cancelled=0",
        o.user_id,
        o.product_id,
      );
      const start =
        last?.expires && last.expires > now() ? last.expires : now();
      run(
        "INSERT INTO p_subscriptions VALUES(?,?,?,?,?,?,0)",
        randomUUID(),
        o.user_id,
        o.product_id,
        o.id,
        start,
        new Date(
          new Date(start).getTime() +
            terms.durationDays * 86400000 * o.quantity,
        ).toISOString(),
      );
    }
    if (
      one(
        "SELECT COUNT(*) n FROM p_orders WHERE user_id=? AND paid_at>?",
        o.user_id,
        new Date(Date.now() - 600000).toISOString(),
      )!.n >= 10
    )
      run(
        "INSERT OR IGNORE INTO p_flags VALUES(?,?,?,?,0,?)",
        randomUUID(),
        o.user_id,
        "purchase_velocity",
        "ده خرید یا بیشتر در ده دقیقه؛ نیازمند بررسی انسانی",
        now(),
      );
    notify(o.user_id, "پرداخت سفارش تأیید شد", o.title);
    return saved;
  });
}
export function createOrder(
  user: string,
  productId: string,
  quantity: number,
  method: string,
  idem: string,
  charge = true, // false: the checkout collects payment itself (voucher + wallet)
) {
  return atomic(() => {
    const existing = one(
      "SELECT * FROM p_orders WHERE user_id=? AND idem_key=?",
      user,
      idem,
    );
    if (existing) {
      if (
        existing.product_id !== productId ||
        existing.quantity !== quantity ||
        existing.payment_method !== method
      )
        throw new ApiError(409, "idempotency_conflict");
      return existing;
    }
    const p = policy();
    const product = one(
      "SELECT * FROM p_products WHERE id=? AND published=1",
      productId,
    );
    if (!product) throw new ApiError(404, "not_found");
    if (product.stock < quantity) throw new ApiError(409, "out_of_stock");
    const merchant = merchantTerms(productId);
    if (merchant && merchant.shareBps + p.maxPayoutBps > 10000)
      throw new ApiError(409, "merchant_terms_invalid");
    const amount = product.price * quantity;
    if (!Number.isSafeInteger(amount) || amount > 1e12)
      throw new ApiError(400, "invalid_input");
    mature();
    if (
      charge &&
      method === "wallet" &&
      (wallet(user).debt > 0 || wallet(user).available < amount)
    )
      throw new ApiError(409, "insufficient_balance");
    const id = randomUUID();
    run(
      "UPDATE p_products SET stock=stock-? WHERE id=? AND stock>=?",
      quantity,
      productId,
      quantity,
    );
    run(
      `INSERT INTO p_orders(id,user_id,product_id,title,vertical,quantity,unit_price,amount,status,payment_method,policy,expires_at,created_at,idem_key) VALUES(?,?,?,?,?,?,?,?,'pending',?,?,?,?,?)`,
      id,
      user,
      productId,
      product.title,
      product.vertical,
      quantity,
      product.price,
      amount,
      method,
      JSON.stringify({
        ...p,
        binaryRules: binaryRules(),
        binarySchedule: binarySchedule(),
        loyaltyPolicy: loyaltyPolicy(),
        merchantTerms: merchant,
        orderTerms: {
          catalogDetails: publicCatalogDetails(
            one(
              "SELECT details FROM p_product_details WHERE product_id=?",
              productId,
            )?.details,
          ),
          cancelHours: product.cancel_hours,
          durationDays: product.duration_days,
        },
      }),
      new Date(Date.now() + 3600000).toISOString(),
      now(),
      idem,
    );
    if (charge && method === "wallet") {
      ledger(user, "purchase:" + id, "purchase", id, -amount);
      return settleOrder(id, "wallet:" + id);
    }
    return one("SELECT * FROM p_orders WHERE id=?", id)!;
  });
}
function reverseCommission(c: Row) {
  if (c.status === "reversed") return;
  if (c.status === "pending")
    ledger(c.user_id, "reverse:" + c.id, "reversal", c.id, 0, -c.amount);
  else {
    const available = Math.min(wallet(c.user_id).available, c.amount);
    ledger(
      c.user_id,
      "reverse:" + c.id,
      "reversal",
      c.id,
      -available,
      0,
      0,
      c.amount - available,
    );
  }
  run("UPDATE p_commissions SET status='reversed' WHERE id=?", c.id);
}
export function refundOrder(
  orderId: string,
  actor: string,
  isAdmin = false,
  reason = "",
) {
  return atomic(() => {
    const o = one("SELECT * FROM p_orders WHERE id=?", orderId);
    if (!o || (!isAdmin && o.user_id !== actor))
      throw new ApiError(404, "not_found");
    if (["refunded", "cancelled"].includes(o.status)) return o;
    if (
      !isAdmin &&
      (o.status === "shipped" ||
        o.status === "delivered" ||
        (o.paid_at && now() > o.cancel_until))
    )
      throw new ApiError(409, "cancellation_expired");
    const checkout = one(
      "SELECT c.status,c.expires_at FROM p_checkouts c JOIN p_checkout_items i ON i.checkout_id=c.id WHERE i.order_id=?",
      orderId,
    );
    if (
      !o.paid_at &&
      checkout?.status === "pending" &&
      checkout.expires_at > now()
    )
      throw new ApiError(409, "payment_reconciliation_required");
    // A payment with an issued authority must be reconciled before inventory can be released.
    if (
      !o.paid_at &&
      (o.checkout_claim || (o.authority && o.expires_at > now()))
    )
      throw new ApiError(409, "payment_reconciliation_required");
    for (const c of all(
      "SELECT * FROM p_commissions WHERE order_id=? AND kind!='binary'",
      orderId,
    ))
      reverseCommission(c);
    const matches = all(
      `SELECT DISTINCT m.* FROM p_binary_matches m JOIN p_binary_lots l ON l.id=m.left_lot JOIN p_binary_lots r ON r.id=m.right_lot WHERE m.void=0 AND (l.order_id=? OR r.order_id=? OR EXISTS(SELECT 1 FROM p_binary_match_allocations a JOIN p_binary_lots x ON x.id=a.lot_id WHERE a.match_id=m.id AND x.order_id=?))`,
      orderId,
      orderId,
      orderId,
    );
    for (const m of matches) {
      reverseCommission(
        one("SELECT * FROM p_commissions WHERE id=?", m.commission_id)!,
      );
      run("UPDATE p_binary_matches SET void=1 WHERE id=?", m.id);
      restoreMatch(m, orderId);
    }
    // The trigger order can fund matches between older carry volumes; reverse those too.
    for (const m of all(
      `SELECT m.* FROM p_binary_matches m JOIN p_commissions c ON c.id=m.commission_id WHERE c.order_id=? AND m.void=0`,
      orderId,
    )) {
      reverseCommission(
        one("SELECT * FROM p_commissions WHERE id=?", m.commission_id)!,
      );
      run("UPDATE p_binary_matches SET void=1 WHERE id=?", m.id);
      restoreMatch(m);
    }
    run(
      "UPDATE p_binary_lots SET void=1,remaining=0 WHERE order_id=?",
      orderId,
    );
    reverseOrderPoints(orderId, actor);
    reverseMerchantSale(orderId);
    reverseCardOrder(orderId);
    const voucherPart = restoreOrderVoucher(orderId);
    if (o.paid_at && o.amount > voucherPart)
      credit(o.user_id, "refund:" + orderId, "refund", orderId, o.amount - voucherPart);
    run(
      "UPDATE p_products SET stock=stock+? WHERE id=?",
      o.quantity,
      o.product_id,
    );
    run(
      "UPDATE p_orders SET status=?,refunded_at=? WHERE id=?",
      o.paid_at ? "refunded" : "cancelled",
      o.paid_at ? now() : null,
      orderId,
    );
    run("UPDATE p_subscriptions SET cancelled=1 WHERE order_id=?", orderId);
    audit(
      actor,
      "order.refund",
      orderId,
      { status: o.status, amount: o.amount },
      { status: o.paid_at ? "refunded" : "cancelled", destination: "wallet" },
      reason,
    );
    notify(
      o.user_id,
      "وضعیت سفارش تغییر کرد",
      o.paid_at ? "وجه به کیف پول شما بازگشت." : "سفارش لغو شد.",
    );
    return one("SELECT * FROM p_orders WHERE id=?", orderId)!;
  });
}
export function requestWithdrawal(
  user: string,
  amount: number,
  iban: string,
  idem: string,
) {
  return atomic(() => {
    const old = one(
      "SELECT * FROM p_withdrawals WHERE user_id=? AND idem_key=?",
      user,
      idem,
    );
    if (old) {
      if (old.amount !== amount || old.iban !== iban)
        throw new ApiError(409, "idempotency_conflict");
      return old;
    }
    const p = policy();
    payoutGuard();
    mature();
    const w = wallet(user);
    if (amount < p.withdrawMin || amount > p.withdrawMax)
      throw new ApiError(400, "withdrawal_limits");
    if (w.debt || w.available < amount)
      throw new ApiError(409, "insufficient_balance");
    const id = randomUUID();
    ledger(user, "hold:" + id, "withdrawal_hold", id, -amount, 0, amount);
    run(
      "INSERT INTO p_withdrawals(id,user_id,amount,iban,status,created_at,updated_at,idem_key) VALUES(?,?,?,?,'pending',?,?,?)",
      id,
      user,
      amount,
      iban,
      now(),
      now(),
      idem,
    );
    return one("SELECT * FROM p_withdrawals WHERE id=?", id)!;
  });
}
export function reviewWithdrawal(
  id: string,
  actor: string,
  action: "approved" | "rejected" | "paid",
  reason: string,
  reference?: string,
) {
  return atomic(() => {
    const w = one("SELECT * FROM p_withdrawals WHERE id=?", id);
    if (!w) throw new ApiError(404, "not_found");
    paymentActor(actor, "withdrawals", w.user_id);
    if (w.status === action) {
      if (action === "paid" && w.bank_reference !== reference)
        throw new ApiError(409, "idempotency_conflict");
      if (
        action === "approved" &&
        !one(
          "SELECT withdrawal_id FROM p_withdrawal_reviews WHERE withdrawal_id=?",
          id,
        )
      ) {
        payoutGuard();
        if (wallet(w.user_id).debt) throw new ApiError(409, "invalid_state");
        approveWithdrawal(id, actor, w.user_id);
        audit(
          actor,
          "withdrawal.legacy_approval",
          id,
          null,
          { firstActor: actor },
          reason,
        );
      }
      return w;
    }
    if (action === "approved") {
      payoutGuard();
      if (w.status !== "pending" || wallet(w.user_id).debt)
        throw new ApiError(409, "invalid_state");
      approveWithdrawal(id, actor, w.user_id);
      ledger(
        w.user_id,
        "approve:" + id,
        "withdrawal_approved",
        id,
        0,
        0,
        -w.amount,
      );
    } else if (action === "rejected") {
      if (!["pending", "approved"].includes(w.status))
        throw new ApiError(409, "invalid_state");
      const debt = Math.min(wallet(w.user_id).debt, w.amount);
      ledger(
        w.user_id,
        "reject:" + id,
        "withdrawal_rejected",
        id,
        w.amount - debt,
        0,
        w.status === "pending" ? -w.amount : 0,
        -debt,
      );
    } else {
      payoutGuard();
      if (w.status !== "approved" || !reference || wallet(w.user_id).debt)
        throw new ApiError(409, "invalid_state");
      confirmWithdrawal(id, actor, w.user_id);
    }
    run(
      "UPDATE p_withdrawals SET status=?,reason=?,bank_reference=?,updated_at=? WHERE id=?",
      action,
      reason,
      reference || null,
      now(),
      id,
    );
    audit(
      actor,
      "withdrawal." + action,
      id,
      w,
      { status: action, bank_reference: reference },
      reason,
    );
    notify(w.user_id, "وضعیت برداشت تغییر کرد", action);
    return one("SELECT * FROM p_withdrawals WHERE id=?", id)!;
  });
}
export function moveMember(
  id: string,
  sponsor: string | null,
  parent: string | null,
  leg: string | null,
  actor: string,
  reason: string,
) {
  return atomic(() => {
    const u = one("SELECT * FROM p_users WHERE id=?", id);
    if (!u) throw new ApiError(404, "not_found");
    for (const [candidate, field] of [
      [sponsor, "sponsor_id"],
      [parent, "parent_id"],
    ]) {
      let current = candidate;
      const seen = new Set<string>();
      while (current) {
        if (current === id || seen.has(current))
          throw new ApiError(409, "network_cycle");
        seen.add(current);
        current =
          one(`SELECT ${field} next FROM p_users WHERE id=?`, current)?.next ||
          null;
      }
    }
    // Historical settled sales stay attached to their original commission beneficiaries.
    run(
      "UPDATE p_users SET sponsor_id=?,parent_id=?,leg=? WHERE id=?",
      sponsor,
      parent,
      leg,
      id,
    );
    audit(
      actor,
      "network.move",
      id,
      { sponsor: u.sponsor_id, parent: u.parent_id, leg: u.leg },
      { sponsor, parent, leg },
      reason,
    );
  });
}
