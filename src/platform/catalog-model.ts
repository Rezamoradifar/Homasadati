import { z } from "zod";
const short = z.string().trim().max(200).default("");
const long = z.string().trim().max(5000).default("");
const count = z.number().int().min(0).max(1e9).default(0);
const url = z
  .string()
  .max(1000)
  .refine((v) => !v || /^https:\/\//.test(v), "HTTPS URL required")
  .default("");
const day = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "Invalid date",
  )
  .default("");
export const catalogDetailsSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .max(80)
      .regex(/^[A-Za-z0-9_.-]*$/)
      .default(""),
    family: short,
    barcode: short,
    brand: short,
    origin: short,
    supplier: short,
    color: short,
    size: short,
    material: short,
    cost: z.number().int().min(0).max(1e12).default(0),
    comparePrice: z.number().int().min(0).max(1e12).default(0),
    lowStock: count,
    weightGrams: count,
    dimensions: short,
    shippingNote: long,
    warranty: long,
    features: long,
    video: url,
    titleEn: short,
    descriptionEn: long,
    titleAr: short,
    descriptionAr: long,
    seoTitle: z.string().trim().max(70).default(""),
    seoDescription: z.string().trim().max(170).default(""),
    destination: short,
    departure: short,
    startsOn: day,
    endsOn: day,
    nights: count,
    accommodation: short,
    meals: short,
    inclusions: long,
    exclusions: long,
    itinerary: long,
    ingredients: long,
    skinType: short,
    volume: short,
    expiresOn: day,
    usage: long,
    warnings: long,
    artisan: short,
    technique: short,
    care: long,
    aiProvider: short,
    aiModel: short,
    seats: count,
    quota: short,
    delivery: long,
    requirements: long,
  })
  .strict()
  .refine(
    (v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn,
    "End date precedes start",
  );
export const emptyCatalogDetails = () => catalogDetailsSchema.parse({});
export function publicCatalogDetails(raw: string | undefined) {
  if (!raw) return {};
  const { cost, supplier, lowStock, ...details } = JSON.parse(raw);
  return details;
}
