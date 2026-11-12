import { ApiError } from "../server/http";

/** Optional opt-in VAT for actual taxable products; keep disabled until the
 * merchant has reviewed product tax classifications and prices. */
export const DIGIPAY_VAT_BPS = 1000;
/** Apply the same legally reviewed VAT regardless of the payment method. */
export const checkoutVatAllMethodsEnabled = () => process.env.HOMA_CHECKOUT_VAT_ENABLED === "1";
export const digipayVatEnabled = () => checkoutVatAllMethodsEnabled() || process.env.HOMA_DIGIPAY_VAT_ENABLED === "1";
export const vatForPaymentMethod = (method:string) => checkoutVatAllMethodsEnabled() || (method==="digipay" && process.env.HOMA_DIGIPAY_VAT_ENABLED === "1");

export type VatStatus = "taxable" | "exempt" | "review" | "disabled";

/** Read each item's tax classification server-side. Never trust a browser's
 * amount or infer tax exemption from its category alone. */
export function digipayVatForLine(lineTotal: number, detailsRaw: unknown): { status: VatStatus; vatToman: number } {
  if (!digipayVatEnabled()) return { status: "disabled", vatToman: 0 };
  if (!Number.isSafeInteger(lineTotal) || lineTotal < 0) throw new ApiError(400, "invalid_input");
  let details: Record<string, unknown> = {};
  try {
    const parsed = typeof detailsRaw === "string" ? JSON.parse(detailsRaw) as unknown : detailsRaw;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      details = parsed as Record<string, unknown>;
  } catch { /* Unclassified stock requires review, not a guessed charge. */ }
  const status = details.vatStatus;
  if (status === "exempt") return { status, vatToman: 0 };
  if (status !== "taxable") return { status: "review", vatToman: 0 };
  const vatToman = Math.round((lineTotal * DIGIPAY_VAT_BPS) / 10000);
  if (!Number.isSafeInteger(vatToman) || vatToman < 0) throw new ApiError(400, "invalid_input");
  return { status, vatToman };
}

/** Tax belongs to a specific immutable order, not its commission volume.
 * Old verified DigiPay orders with no tax snapshot remain tax-free. */
export function digipayVatFromOrder(order: Record<string, unknown>): number {
  const base = order.amount;
  const rawPolicy = order.policy;
  if (typeof base !== "number" || !Number.isSafeInteger(base) || base <= 0 ||
      typeof rawPolicy !== "string") throw new ApiError(409, "invalid_order_tax_snapshot");
  let terms: Record<string, unknown> | undefined;
  try {
    const policy: unknown = JSON.parse(rawPolicy);
    const outer = policy && typeof policy === "object" && !Array.isArray(policy)
      ? policy as Record<string, unknown> : {};
    const nested = outer.orderTerms;
    if (nested && typeof nested === "object" && !Array.isArray(nested))
      terms = nested as Record<string, unknown>;
  } catch {
    throw new ApiError(409, "invalid_order_tax_snapshot");
  }
  if (!terms || (!Object.hasOwn(terms,"checkoutVatToman")&&!Object.hasOwn(terms, "digipayVatToman"))) return 0;
  const tax = Object.hasOwn(terms,"checkoutVatToman") ? terms.checkoutVatToman : terms.digipayVatToman;
  if (typeof tax !== "number" || !Number.isSafeInteger(tax) || tax < 0 ||
      !Number.isSafeInteger(base + tax) || tax > Math.ceil(base / 10))
    throw new ApiError(409, "invalid_order_tax_snapshot");
  return tax;
}
