import { ApiError } from "../server/http";
import { createOrder } from "./finance";
import { atomic, one, run } from "./schema";

type DirectOrderInput = { productId: string; quantity: number; method: string; idempotencyKey: string; addressId?: string };

/** Legacy single-order endpoint: take the same fulfillment snapshot as the cart. */
export function createDirectOrder(userId: string, input: DirectOrderInput) {
  return atomic(() => {
    const old = one("SELECT * FROM p_orders WHERE user_id=? AND idem_key=?", userId, input.idempotencyKey);
    if (old) {
      // Retrying an existing request must never overwrite its original delivery address.
      if (input.addressId) {
        let savedAddressId: unknown;
        try { savedAddressId = JSON.parse(old.policy).orderTerms?.shippingAddressId; } catch { /* Legacy policies may not contain terms. */ }
        if (savedAddressId !== input.addressId) throw new ApiError(409, "idempotency_conflict");
      }
      return createOrder(userId, input.productId, input.quantity, input.method, input.idempotencyKey);
    }
    const product = one("SELECT vertical FROM p_products WHERE id=? AND published=1", input.productId);
    const physical = product && ["beauty", "craft", "leather"].includes(product.vertical);
    const address = physical && input.addressId ? one(
      "SELECT label,country,city,postal_code,address FROM p_addresses WHERE id=? AND user_id=?", input.addressId, userId,
    ) : null;
    if (physical && !address) throw new ApiError(400, "address_required");
    if (physical && !String(one("SELECT phone FROM p_users WHERE id=?", userId)?.phone || "").trim())
      throw new ApiError(400, "delivery_phone_required");
    const order = createOrder(userId, input.productId, input.quantity, input.method, input.idempotencyKey);
    if (!address) return order;
    const policy = JSON.parse(order.policy);
    policy.orderTerms.shippingAddress = address;
    policy.orderTerms.shippingAddressId = input.addressId;
    const serialized = JSON.stringify(policy);
    run("UPDATE p_orders SET policy=? WHERE id=?", serialized, order.id);
    return { ...order, policy: serialized };
  });
}
