import type { SiteLocale } from "./core";

/** Use the merchant's published translations; never invent product claims. */
export function catalogCopy(
  product: {
    title: string;
    description?: string;
    details?: Record<string, unknown>;
  },
  locale: SiteLocale,
) {
  const suffix = locale === "en" ? "En" : locale === "ar" ? "Ar" : "";
  const read = (key: string, fallback: string) => {
    const value = suffix ? product.details?.[key + suffix] : undefined;
    return typeof value === "string" && value.trim() ? value : fallback;
  };
  return {
    title: read("title", product.title),
    description: read("description", product.description || ""),
  };
}

export const isPublicSpecification = (name: string) =>
  ![
    "detail_titleEn",
    "detail_titleAr",
    "detail_descriptionEn",
    "detail_descriptionAr",
    "detail_seoTitle",
    "detail_seoDescription",
  ].includes(name);
