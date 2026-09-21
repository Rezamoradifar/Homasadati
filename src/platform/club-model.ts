import { z } from "zod";
import { id, text } from "./validation";
const safeLink = z.union([
  z.literal(""),
  z
    .string()
    .url()
    .max(1000)
    .refine((v) => new URL(v).protocol === "https:"),
]);
export const merchantSchema = z
  .object({
    id: id.optional(),
    name: text,
    category: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    address: z.string().trim().max(1000),
    phone: z.string().trim().max(40),
    website: safeLink,
    description: z.string().trim().max(4000),
    active: z.boolean(),
    reason: text,
  })
  .strict();
export const pointsAdjustmentSchema = z
  .object({
    userId: id,
    delta: z
      .number()
      .int()
      .min(-1000000000)
      .max(1000000000)
      .refine((n) => n !== 0),
    reason: text,
    idempotencyKey: id,
  })
  .strict();
export const rewardSchema = z
  .object({
    id: id.optional(),
    expected_stock:z.number().int().min(0).optional(),
    expected_updated_at:z.string().optional(),
    title: text,
    description: z.string().trim().max(4000),
    points: z.number().int().min(1).max(1000000000),
    stock: z.number().int().min(0).max(1000000),
    active: z.boolean(),
    reason: text,
  })
  .strict();
export const redeemSchema = z
  .object({ rewardId: id, idempotencyKey: id })
  .strict();
export const redemptionReviewSchema = z
  .object({ id, status: z.enum(["fulfilled", "cancelled"]), reason: text })
  .strict();
