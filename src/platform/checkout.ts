import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "../server/http";
import { all, one, run, atomic, now, Row } from "./schema";
import { createOrder, settleOrder } from "./finance";
import { paymentRequest } from "./providers";
import {publicCatalogDetails} from './catalog-model';
export { cartItemsSchema, checkoutSchema } from "./cart-validation";
import { cartItemsSchema, checkoutSchema } from "./cart-validation";
export function quoteCart(items: z.infer<typeof cartItemsSchema>) {
  const rows: Row[] = items.map((item) => {
    const p = one(
      "SELECT p.id,p.title,p.price,p.stock,p.published,p.vertical,p.images,d.details FROM p_products p LEFT JOIN p_product_details d ON d.product_id=p.id WHERE p.id=?",
      item.productId,
    );
    if (!p || !p.published) throw new ApiError(409, "product_unavailable");
    if (p.stock < item.quantity) throw new ApiError(409, "out_of_stock");
    const {details,...product}=p;
    const copy=publicCatalogDetails(details);
    return {
      ...product,
      details:{titleEn:copy.titleEn,titleAr:copy.titleAr},
      quantity: item.quantity,
      lineTotal: p.price * item.quantity,
    };
  });
  const total = rows.reduce((sum, p) => sum + p.lineTotal, 0);
  if (!Number.isSafeInteger(total) || total > 1e12)
    throw new ApiError(400, "invalid_input");
  return {
    rows,
    total,
    requiresAddress: rows.some((p) =>
      ["beauty", "craft", "leather"].includes(p.vertical),
    ),
  };
}
export function createCheckout(
  user: string,
  input: z.infer<typeof checkoutSchema>,
) {
  return atomic(() => {
    const canonical = JSON.stringify({
      ...input,
      items: [...input.items].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      ),
    });
    const old = one(
      "SELECT * FROM p_checkouts WHERE user_id=? AND idem_key=?",
      user,
      input.idempotencyKey,
    );
    if (old) {
      if (old.payload !== canonical)
        throw new ApiError(409, "idempotency_conflict");
      return old;
    }
    const quote = quoteCart(input.items);
    if (quote.total !== input.expectedTotal)
      throw new ApiError(409, "price_changed");
    const address = input.addressId
      ? one(
          "SELECT label,country,city,postal_code,address FROM p_addresses WHERE id=? AND user_id=?",
          input.addressId,
          user,
        )
      : null;
    if (quote.requiresAddress && !address)
      throw new ApiError(400, "address_required");
    const id = randomUUID(),
      created = now(),
      expires = new Date(Date.now() + 3600000).toISOString();
    run(
      "INSERT INTO p_checkouts(id,user_id,amount,method,status,payload,created_at,expires_at,idem_key) VALUES(?,?,?,?,?,?,?,?,?)",
      id,
      user,
      quote.total,
      input.method,
      input.method === "wallet" ? "paid" : "pending",
      canonical,
      created,
      expires,
      input.idempotencyKey,
    );
    for (const item of input.items) {
      const order = createOrder(
        user,
        item.productId,
        item.quantity,
        input.method,
        randomUUID(),
      );
      const snapshot = JSON.parse(order.policy);
      if (address) snapshot.orderTerms.shippingAddress = address;
      run(
        "UPDATE p_orders SET policy=? WHERE id=?",
        JSON.stringify(snapshot),
        order.id,
      );
      run("INSERT INTO p_checkout_items VALUES(?,?)", id, order.id);
    }
    return one("SELECT * FROM p_checkouts WHERE id=?", id)!;
  });
}
export function settleCheckout(checkoutId: string, reference: string) {
  return atomic(() => {
    const c = one("SELECT * FROM p_checkouts WHERE id=?", checkoutId);
    if (!c) throw new ApiError(404, "not_found");
    if (c.status === "paid") return c;
    for (const row of all(
      "SELECT order_id FROM p_checkout_items WHERE checkout_id=?",
      c.id,
    ))
      settleOrder(row.order_id, reference + ":" + row.order_id);
    run(
      "UPDATE p_checkouts SET status='paid',payment_ref=?,claim=NULL WHERE id=?",
      reference,
      c.id,
    );
    return one("SELECT * FROM p_checkouts WHERE id=?", c.id)!;
  });
}
export async function payCheckout(checkoutId: string, user: string) {
  const c = one(
    "SELECT * FROM p_checkouts WHERE id=? AND user_id=?",
    checkoutId,
    user,
  );
  if (!c) throw new ApiError(404, "not_found");
  if (
    c.method !== "zarinpal" ||
    c.status !== "pending" ||
    c.expires_at <= now()
  )
    throw new ApiError(409, "invalid_state");
  if (c.authority)
    return { url: "https://www.zarinpal.com/pg/StartPay/" + c.authority };
  const claim = randomUUID();
  if (
    !run(
      "UPDATE p_checkouts SET claim=? WHERE id=? AND claim IS NULL AND authority IS NULL",
      claim,
      c.id,
    ).changes
  )
    throw new ApiError(409, "payment_request_in_progress");
  try {
    const authority = await paymentRequest(c.id, c.amount);
    if (
      !run(
        "UPDATE p_checkouts SET authority=?,claim=NULL WHERE id=? AND claim=? AND status='pending' AND expires_at>?",
        authority,
        c.id,
        claim,
        now(),
      ).changes
    )
      throw new ApiError(409, "invalid_state");
    return { url: "https://www.zarinpal.com/pg/StartPay/" + authority };
  } catch (e) {
    run(
      "UPDATE p_checkouts SET claim=NULL WHERE id=? AND claim=?",
      c.id,
      claim,
    );
    throw e;
  }
}
