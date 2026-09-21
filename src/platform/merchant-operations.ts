import { randomUUID } from "node:crypto";
import { all, one, run, atomic, now, Row } from "./schema";
import { ApiError } from "../server/http";
import { audit } from "./security";
import {
  merchantContractSchema,
  merchantProductSchema,
  merchantPaymentSchema,
  merchantFulfillmentSchema,
} from "./merchant-model";
export function merchantTerms(product: string) {
  const link = one(
    "SELECT merchant_id FROM p_product_merchants WHERE product_id=?",
    product,
  );
  if (!link) return null;
  const t = one(
    "SELECT c.*,m.name,m.active merchant_active,u.blocked FROM p_merchant_contracts c JOIN p_merchants m ON m.id=c.merchant_id JOIN p_users u ON u.id=c.owner_id WHERE c.merchant_id=?",
    link.merchant_id,
  );
  if (
    !t ||
    !t.active ||
    !t.merchant_active ||
    t.blocked ||
    t.starts_on > now().slice(0, 10) ||
    t.ends_on < now().slice(0, 10)
  )
    throw new ApiError(409, "merchant_unavailable");
  return {
    merchantId: t.merchant_id,
    name: t.name,
    shareBps: t.share_bps,
    reference: t.reference,
  };
}
export function recordMerchantSale(order: Row) {
  const t = JSON.parse(order.policy).merchantTerms;
  if (!t) return;
  const amount = Number((BigInt(order.amount) * BigInt(t.shareBps)) / 10000n);
  run(
    "INSERT OR IGNORE INTO p_merchant_sales VALUES(?,?,?,?,?,'pending')",
    order.id,
    t.merchantId,
    amount,
    t.reference,
    order.cancel_until,
  );
}
function entry(
  merchant: string,
  amount: number,
  key: string,
  reference: string,
  kind: string,
) {
  if (!Number.isSafeInteger(merchantBalance(merchant) + amount))
    throw new ApiError(409, "invalid_input");
  run(
    "INSERT INTO p_merchant_ledger VALUES(?,?,?,?,?,?,?)",
    randomUUID(),
    merchant,
    amount,
    key,
    reference,
    kind,
    now(),
  );
}
export function matureMerchantSales() {
  for (const s of all(
    "SELECT s.* FROM p_merchant_sales s JOIN p_orders o ON o.id=s.order_id WHERE s.status='pending' AND s.available_at<=? AND o.status='delivered' AND o.refunded_at IS NULL LIMIT 500",
    now(),
  )) {
    entry(s.merchant_id, s.amount, "sale:" + s.order_id, s.order_id, "sale");
    run(
      "UPDATE p_merchant_sales SET status='available' WHERE order_id=?",
      s.order_id,
    );
  }
}
export function reverseMerchantSale(order: string) {
  const s = one("SELECT * FROM p_merchant_sales WHERE order_id=?", order);
  if (!s || s.status === "reversed") return;
  if (s.status === "available")
    entry(s.merchant_id, -s.amount, "refund:" + order, order, "refund");
  run("UPDATE p_merchant_sales SET status='reversed' WHERE order_id=?", order);
}
export function saveContract(actor: string, input: unknown) {
  const d = merchantContractSchema.parse(input);
  return atomic(() => {
    if (
      !one("SELECT id FROM p_merchants WHERE id=?", d.merchantId) ||
      !one("SELECT id FROM p_users WHERE id=? AND blocked=0", d.ownerId)
    )
      throw new ApiError(404, "not_found");
    const old = one(
      "SELECT * FROM p_merchant_contracts WHERE merchant_id=?",
      d.merchantId,
    );
    run(
      "INSERT INTO p_merchant_contracts VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(merchant_id) DO UPDATE SET owner_id=excluded.owner_id,share_bps=excluded.share_bps,reference=excluded.reference,starts_on=excluded.starts_on,ends_on=excluded.ends_on,active=excluded.active,updated_at=excluded.updated_at",
      d.merchantId,
      d.ownerId,
      d.shareBps,
      d.reference,
      d.startsOn,
      d.endsOn,
      Number(d.active),
      now(),
    );
    audit(actor, "merchant.contract", d.merchantId, old || null, d, d.reason);
    return { ok: true };
  });
}
export function linkMerchantProduct(actor: string, input: unknown) {
  const d = merchantProductSchema.parse(input);
  return atomic(() => {
    if (
      !one("SELECT id FROM p_products WHERE id=?", d.productId) ||
      (d.merchantId &&
        !one("SELECT id FROM p_merchants WHERE id=?", d.merchantId))
    )
      throw new ApiError(404, "not_found");
    const old = one(
      "SELECT * FROM p_product_merchants WHERE product_id=?",
      d.productId,
    );
    if (d.merchantId)
      run(
        "INSERT INTO p_product_merchants VALUES(?,?) ON CONFLICT(product_id) DO UPDATE SET merchant_id=excluded.merchant_id",
        d.productId,
        d.merchantId,
      );
    else run("DELETE FROM p_product_merchants WHERE product_id=?", d.productId);
    audit(actor, "merchant.product", d.productId, old || null, d, d.reason);
    return { ok: true };
  });
}
export function merchantBalance(id: string) {
  return one(
    "SELECT COALESCE(SUM(amount),0) n FROM p_merchant_ledger WHERE merchant_id=?",
    id,
  )!.n as number;
}
export function recordMerchantPayment(actor: string, input: unknown) {
  const d = merchantPaymentSchema.parse(input);
  return atomic(() => {
    const payload = JSON.stringify(d),
      old = one(
        "SELECT * FROM p_merchant_payments WHERE idem_key=?",
        d.idempotencyKey,
      );
    if (old) {
      if (old.payload !== payload)
        throw new ApiError(409, "idempotency_conflict");
      return { id: old.id };
    }
    if (
      !one("SELECT id FROM p_merchants WHERE id=? AND active=1", d.merchantId)
    )
      throw new ApiError(404, "not_found");
    matureMerchantSales();
    if (merchantBalance(d.merchantId) < d.amount)
      throw new ApiError(409, "insufficient_balance");
    const id = randomUUID();
    run(
      "INSERT INTO p_merchant_payments VALUES(?,?,?,?,?,?,?,?,?)",
      id,
      d.merchantId,
      d.amount,
      d.bankReference,
      d.idempotencyKey,
      payload,
      actor,
      d.reason,
      now(),
    );
    entry(d.merchantId, -d.amount, "payment:" + id, id, "payment");
    audit(actor, "merchant.payment", id, null, d, d.reason);
    return { id };
  });
}
export function merchantWorkspace(user: string, page = 1) {
  const merchants = all(
    "SELECT m.id,m.name,c.reference,c.share_bps,c.starts_on,c.ends_on,c.active FROM p_merchants m JOIN p_merchant_contracts c ON c.merchant_id=m.id WHERE c.owner_id=?",
    user,
  );
  const ids = merchants.map((m) => m.id);
  if (!ids.length)
    return {
      merchants: [],
      orders: [],
      products: [],
      rows: [],
      hasMore: false,
    };
  const select = ids.map(() => "?").join(",");
  const orders = all(
    `SELECT o.id,o.title,o.quantity,o.status,o.created_at,s.amount,s.status settlement_status,m.name merchant_name FROM p_orders o JOIN p_merchant_sales s ON s.order_id=o.id JOIN p_merchants m ON m.id=s.merchant_id WHERE s.merchant_id IN (${select}) ORDER BY o.created_at DESC,o.id DESC LIMIT 31 OFFSET ?`,
    ...ids,
    (page - 1) * 30,
  );
  return {
    merchants: merchants.map((m) => ({ ...m, balance: merchantBalance(m.id) })),
    orders: orders.slice(0, 30),
    hasMore: orders.length > 30,
    products: all(
      `SELECT p.id,p.title,p.price,p.stock,p.published FROM p_products p JOIN p_product_merchants x ON x.product_id=p.id WHERE x.merchant_id IN (${select}) ORDER BY p.title,p.id LIMIT 30 OFFSET ?`,
      ...ids,
      (page - 1) * 30,
    ),
    rows: all(
      `SELECT l.* FROM p_merchant_ledger l WHERE l.merchant_id IN (${select}) ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET ?`,
      ...ids,
      (page - 1) * 30,
    ),
  };
}
export function merchantFulfill(user: string, input: unknown) {
  const d = merchantFulfillmentSchema.parse(input);
  return atomic(() => {
    const o = one(
      "SELECT o.* FROM p_orders o JOIN p_merchant_sales s ON s.order_id=o.id JOIN p_merchant_contracts c ON c.merchant_id=s.merchant_id JOIN p_merchants m ON m.id=c.merchant_id WHERE o.id=? AND c.owner_id=? AND c.active=1 AND m.active=1",
      d.id,
      user,
    );
    if (!o) throw new ApiError(404, "not_found");
    if (o.status === d.status) return { ok: true };
    if (
      !o.paid_at ||
      o.refunded_at ||
      !(
        o.status === "processing" ||
        (o.status === "shipped" && d.status === "delivered")
      )
    )
      throw new ApiError(409, "invalid_state");
    run("UPDATE p_orders SET status=? WHERE id=?", d.status, d.id);
    audit(
      user,
      "merchant.fulfillment",
      d.id,
      { status: o.status },
      d,
      d.reason,
    );
    return { ok: true };
  });
}
