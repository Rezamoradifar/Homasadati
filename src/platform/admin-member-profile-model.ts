import { z } from "zod";
import { memberDetailsSchema, registrationEmail } from "./registration-model";
import { contact, id, iranMobile, nationalId, text } from "./validation";

const nullableInput = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(
  value => value === null || (typeof value === "string" && !value.trim()) ? null : value,
  schema.nullable(),
);
const preferencesSchema = z.object({ email: z.boolean(), sms: z.boolean(), inApp: z.boolean() }).strict();
const personalSchema = memberDetailsSchema.extend({
  // The stored display name is derived from the two existing 200-character fields.
  name: z.string().trim().min(1).max(401),
  email: nullableInput(registrationEmail),
  phone: nullableInput(z.union([iranMobile, contact.refine(value => !value.includes("@"))])),
  preferences: preferencesSchema,
  nationalId: nullableInput(nationalId),
}).strict().refine(value => !!(value.email || value.phone), { message: "A login contact is required" });
const addressSchema = z.object({
  id: id.optional(),
  label: text,
  country: text,
  city: text,
  postalCode: z.string().trim().min(3).max(30),
  address: z.string().trim().min(5).max(1000),
}).strict();
export const adminMemberProfilePatchSchema = z.object({
  expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
  personal: personalSchema,
  addresses: z.object({
    upsert: z.array(addressSchema).max(100),
    deleteIds: z.array(id).max(100),
  }).strict(),
  reason: text,
}).strict().superRefine((value, context) => {
  const upsertIds = value.addresses.upsert.flatMap(address => address.id ? [address.id] : []);
  const deleted = value.addresses.deleteIds;
  if (new Set(upsertIds).size !== upsertIds.length || new Set(deleted).size !== deleted.length ||
    deleted.some(addressId => upsertIds.includes(addressId)))
    context.addIssue({ code: "custom", path: ["addresses"], message: "Duplicate or conflicting address operations" });
});
