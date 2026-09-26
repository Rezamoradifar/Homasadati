import { z } from "zod";
export const cartItemsSchema = z
  .array(
    z
      .object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
      })
      .strict(),
  )
  .min(1)
  .max(30)
  .refine(
    (rows) => new Set(rows.map((x) => x.productId)).size === rows.length,
    "duplicate_product",
  );
export const checkoutSchema = z
  .object({
    items: cartItemsSchema,
    method: z.enum(["wallet", "zarinpal"]),
    idempotencyKey: z.string().uuid(),
    expectedTotal: z.number().int().min(1).max(1e12),
    addressId: z.string().uuid().optional(),
    useVoucher: z.boolean().optional(),
  })
  .strict();
