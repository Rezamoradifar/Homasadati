import { cookies } from "next/headers";
import { isLocale, type SiteLocale } from "./core";
export async function siteLocale(): Promise<SiteLocale> {
  const value = (await cookies()).get("homay-locale")?.value;
  return isLocale(value) ? value : "fa";
}
