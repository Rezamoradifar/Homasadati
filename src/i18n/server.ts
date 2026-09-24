import { cookies } from "next/headers";
import { isLocale, type SiteLocale } from "./core";
import { loadDictionary, translateText } from "./core";
import type { Metadata } from "next";
export async function siteLocale(): Promise<SiteLocale> {
  const value = (await cookies()).get("homay-locale")?.value;
  return isLocale(value) ? value : "fa";
}

export async function translatedMetadata(
  metadata: Metadata,
): Promise<Metadata> {
  const locale = await siteLocale(),
    dictionary = await loadDictionary(locale);
  return {
    ...metadata,
    ...(typeof metadata.title === "string"
      ? { title: translateText(metadata.title, locale, dictionary) }
      : {}),
    ...(typeof metadata.description === "string"
      ? { description: translateText(metadata.description, locale, dictionary) }
      : {}),
  };
}
