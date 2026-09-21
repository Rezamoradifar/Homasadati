import { z } from "zod";
import { id, text } from "./validation";
export const loyaltyPolicySchema = z
  .object({
    enabled: z.boolean(),
    spendUnit: z.number().int().min(1).max(1e12),
    pointsPerUnit: z.number().int().min(1).max(1000000),
    expiryDays: z.number().int().min(0).max(3650),
  })
  .strict();
export const disabledLoyalty = {
  enabled: false,
  spendUnit: 1,
  pointsPerUnit: 1,
  expiryDays: 0,
};
export const loyaltyLevelSchema = z
  .object({
    id: id.optional(),
    name: text,
    threshold: z.number().int().min(0).max(1e12),
    benefits: z.string().trim().max(4000),
    active: z.boolean(),
    reason: text,
  })
  .strict();
