import { z } from "zod";
import { id, text, money } from "./validation";
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
  );
export const merchantContractSchema = z
  .object({
    merchantId: id,
    ownerId: id,
    shareBps: z.number().int().min(0).max(10000),
    reference: text,
    startsOn: isoDay,
    endsOn: isoDay,
    active: z.boolean(),
    reason: text,
  })
  .strict()
  .refine((v) => v.endsOn >= v.startsOn);
export const merchantProductSchema = z
  .object({ merchantId: id.nullable(), productId: id, reason: text })
  .strict();
export const merchantPaymentSchema = z
  .object({
    merchantId: id,
    amount: money,
    bankReference: z.string().trim().min(3).max(200),
    idempotencyKey: id,
    reason: text,
  })
  .strict();
export const merchantFulfillmentSchema = z
  .object({ id, status: z.enum(["shipped", "delivered"]), reason: text })
  .strict();
