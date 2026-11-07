import { ApiError } from "../server/http";
import { one } from "./schema";
import type { OrderDocumentData } from "./order-document-types";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const text = (value: unknown) => typeof value === "string" ? value : "";

/** A fulfillment view of one product order, without changing its saved terms. */
export function orderDocument(orderId: string): OrderDocumentData {
  const row = one(
    `SELECT o.id,o.title,o.vertical,o.quantity,o.unit_price,o.amount,o.status,
      o.payment_method,o.payment_ref,o.created_at,o.paid_at,o.policy,
      u.name AS customer_name,u.phone AS customer_phone
      FROM p_orders o JOIN p_users u ON u.id=o.user_id WHERE o.id=?`,
    orderId,
  );
  if (!row) throw new ApiError(404, "not_found");

  let terms: Record<string, unknown> | null = null;
  try {
    terms = record(record(JSON.parse(row.policy))?.orderTerms);
  } catch {
    // Older orders may lack structured terms; never invent a delivery address.
  }
  const customer = record(terms?.customer);
  const hasCustomerSnapshot = typeof customer?.name === "string" &&
    (typeof customer.phone === "string" || customer.phone === null);
  const shipping = record(terms?.shippingAddress);
  return {
    order: {
      id: row.id,
      title: row.title,
      vertical: row.vertical,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      amount: row.amount,
      status: row.status,
      paymentMethod: row.payment_method,
      paymentRef: row.payment_ref ?? null,
      createdAt: row.created_at,
      paidAt: row.paid_at ?? null,
    },
    customer: hasCustomerSnapshot ? {
      name: customer.name as string,
      phone: customer.phone as string | null,
      source: "snapshot",
    } : {
      name: row.customer_name,
      phone: row.customer_phone ?? null,
      source: "current_profile",
    },
    shipping: shipping ? {
      label: text(shipping.label),
      country: text(shipping.country),
      city: text(shipping.city),
      postalCode: text(shipping.postal_code),
      address: text(shipping.address),
    } : null,
  };
}
