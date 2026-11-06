import { ApiError } from "../server/http";
import { digipayEnabled, type DigiPayBasketItem } from "./digipay";
import { one } from "./schema";

type Mapping = { categoryId: string; productType: 1 | 2 | 3 | 4 };
const value = (input: unknown) =>
  typeof input === "string" && input.trim().length <= 200 ? input.trim() : "";

/** Category identifiers come from the merchant's DigiPay agreement. Internal
 * category names must never be passed off as provider-issued identifiers. */
export function digipayCategoryMap(): Record<string, Mapping> {
  try {
    const parsed: unknown = JSON.parse(process.env.DIGIPAY_CATEGORY_MAP_JSON || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, Mapping> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return {};
      const row = entry as Record<string, unknown>;
      if (!value(row.categoryId) || ![1, 2, 3, 4].includes(Number(row.productType))) return {};
      result[key] = { categoryId: value(row.categoryId), productType: Number(row.productType) as Mapping["productType"] };
    }
    return result;
  } catch {
    return {};
  }
}

export function digipayCheckoutEnabled() {
  return digipayEnabled() && !!value(process.env.DIGIPAY_SELLER_ID) &&
    !!value(process.env.DIGIPAY_SUPPLIER_ID) && Object.keys(digipayCategoryMap()).length > 0;
}

export function digipayPhone(userId: string) {
  const phone = String(one("SELECT phone FROM p_users WHERE id=?", userId)?.phone || "")
    .replace(/^(?:\+98|0098|98)(9\d{9})$/, "0$1");
  if (!/^09\d{9}$/.test(phone)) throw new ApiError(400, "digipay_phone_required");
  return phone;
}

/** Called before inventory reservation; its output is snapshotted into each
 * order and later used verbatim to create the provider's basket. */
export function digipayItemsForCart(userId: string, lines: { productId: string; quantity: number }[]) {
  if (!digipayCheckoutEnabled()) throw new ApiError(503, "payment_not_configured");
  digipayPhone(userId);
  const mapping = digipayCategoryMap();
  const result = new Map<string, DigiPayBasketItem>();
  for (const line of lines) {
    const product = one(
      "SELECT p.id,p.vertical,d.details FROM p_products p LEFT JOIN p_product_details d ON d.product_id=p.id WHERE p.id=? AND p.published=1",
      line.productId,
    );
    let details: Record<string, unknown> = {};
    try { details = JSON.parse(product?.details || "{}"); } catch { /* validated below */ }
    const category = product ? mapping[product.vertical] : undefined;
    const brand = value(details?.brand) || value(process.env.DIGIPAY_DEFAULT_BRAND);
    if (!product || !category || !brand) throw new ApiError(409, "digipay_basket_not_configured");
    result.set(line.productId, {
      sellerId: value(process.env.DIGIPAY_SELLER_ID),
      supplierId: value(process.env.DIGIPAY_SUPPLIER_ID),
      productCode: value(details?.sku) || line.productId,
      brand,
      productType: category.productType,
      count: line.quantity,
      categoryId: category.categoryId,
    });
  }
  return result;
}
