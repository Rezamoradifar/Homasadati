import { catalogDetailsSchema } from "./catalog-model";
import { z } from "zod";
export const money = z.number().int().min(1).max(1_000_000_000_000);
export const id = z.string().uuid();
export const text = z.string().trim().min(1).max(200);
export const password = z.string().min(12).max(128);
export const contact = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine(
    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^\+?[1-9]\d{9,14}$/.test(v),
    "ایمیل یا موبایل با پیش‌شماره کشور معتبر نیست",
  )
  .transform((v) => (v.includes("@") ? v : "+" + v.replace(/^\+/, "")));
export const vertical = z.enum(["tourism", "beauty", "craft", "ai", "leather"]);
export const httpsImage = z
  .string()
  .max(1000)
  .refine(
    (v) =>
      v === "" ||
      v.startsWith("/assets/") ||
      /^\/api\/platform\/media\/[a-f0-9-]{36}\.webp$/.test(v) ||
      /^https:\/\//.test(v),
  );
export const productSchema = z
  .object({
    id: id.optional(),
    details: catalogDetailsSchema.optional(),
    expected_stock: z.number().int().min(0).optional(),
    expected_updated_at: z.string().optional(),
    title: text,
    description: z.string().trim().min(1).max(8000),
    vertical,
    subtype: text,
    price: money,
    stock: z.number().int().min(0).max(1000000),
    images: z.array(httpsImage).max(12),
    taxonomy: z.array(id).max(30),
    published: z.boolean(),
    duration_days: z.number().int().min(1).max(3650),
    cancel_hours: z.number().int().min(0).max(720),
  })
  .strict();
export const policySchema = z
  .object({
    directBps: z.number().int().min(0).max(10000),
    levels: z.array(z.number().int().min(0).max(10000)).max(20),
    binaryBps: z.number().int().min(0).max(10000),
    maxPayoutBps: z.number().int().min(0).max(10000),
    warningBps: z.number().int().min(0).max(10000),
    criticalBps: z.number().int().min(1).max(10000),
    withdrawMin: money,
    withdrawMax: money,
    paused: z.boolean(),
  })
  .strict()
  .refine(
    (p) =>
      p.withdrawMax >= p.withdrawMin &&
      p.warningBps < p.criticalBps &&
      p.directBps + p.levels.reduce((a, b) => a + b, 0) <= p.maxPayoutBps,
    "حدها و جمع درصدها معتبر نیست",
  );
export type Policy = z.infer<typeof policySchema>;
export const role = z.enum([
  "user",
  "superadmin",
  "content",
  "support",
  "finance",
]);
export const iban = z
  .string()
  .transform((v) => v.toUpperCase().replace(/\s/g, ""))
  .refine((v) => {
    if (!/^IR\d{24}$/.test(v)) return false;
    const s = v.slice(4) + "1827" + v.slice(2, 4);
    let n = 0;
    for (const c of s) n = (n * 10 + Number(c)) % 97;
    return n === 1;
  }, "شماره شبای ایران معتبر نیست");

const latinDigits = (v: string) =>
  v
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\s-]/g, "");
/** Iranian national code: ten digits with the official check digit. */
export const nationalId = z
  .string()
  .transform(latinDigits)
  .refine((v) => {
    if (!/^\d{10}$/.test(v) || /^(\d)\1{9}$/.test(v)) return false;
    const sum = [...v.slice(0, 9)].reduce((t, d, i) => t + Number(d) * (10 - i), 0) % 11;
    return Number(v[9]) === (sum < 2 ? sum : 11 - sum);
  }, "کد ملی معتبر نیست");
/** Shetab bank card: sixteen digits passing the Luhn check. */
export const bankCard = z
  .string()
  .transform(latinDigits)
  .refine((v) => {
    if (!/^\d{16}$/.test(v)) return false;
    let sum = 0;
    for (let i = 0; i < 16; i++) {
      let d = Number(v[i]);
      if (i % 2 === 0) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
      sum += d;
    }
    return sum % 10 === 0;
  }, "شماره کارت معتبر نیست");
