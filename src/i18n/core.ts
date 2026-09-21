export type SiteLocale = "fa" | "en" | "ar";
export type Dictionary = Record<string, string>;
export const isLocale = (v: unknown): v is SiteLocale =>
  v === "fa" || v === "en" || v === "ar";
export const direction = (locale: SiteLocale) =>
  locale === "en" ? "ltr" : "rtl";
export const normalizeText = (text: string) => text.trim().replace(/\s+/g, " ");
const templateCache = new WeakMap<Dictionary, [RegExp, string][]>();
function templates(dictionary: Dictionary) {
  let list = templateCache.get(dictionary);
  if (!list) {
    list = Object.entries(dictionary)
      .filter(([key]) => key.includes("{0}"))
      .map(([key, value]) => {
        const expression = key
          .split(/\{\d+\}/g)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("(.+?)");
        return [new RegExp("^" + expression + "$"), value];
      });
    templateCache.set(dictionary, list);
  }
  return list;
}
export function translateText(
  text: string,
  locale: SiteLocale,
  dictionary: Dictionary,
): string {
  if (locale === "fa" || !text.trim()) return text;
  const key = normalizeText(text);
  let translated = Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
  if (!translated && key.length < 2000) {
    for (const [pattern, value] of templates(dictionary)) {
      const match = key.match(pattern);
      if (match) {
        translated = value.replace(/\{(\d+)\}/g, (_, i) => {
          const captured = match[Number(i) + 1],
            part = normalizeText(captured);
          return Object.hasOwn(dictionary, part) ? dictionary[part] : captured;
        });
        break;
      }
    }
  }
  // Numbers in UI copy follow the selected language. Input values and identifiers
  // are not passed through this renderer.
  const result =
    translated === undefined ? text : text.replace(text.trim(), () => translated!);
  const numeric = result.replace(/[۰-۹٠-٩]/g, (digit) => {
    const value = "۰۱۲۳۴۵۶۷۸۹".indexOf(digit);
    const n = value < 0 ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit) : value;
    return locale === "ar" ? "٠١٢٣٤٥٦٧٨٩"[n] : String(n);
  });
  return locale === "en"
    ? numeric.replace(/٬/g, ",").replace(/٫/g, ".").replace(/٪/g, "%")
    : numeric;
}
export async function loadDictionary(locale: SiteLocale): Promise<Dictionary> {
  if (locale === "en") return (await import("./en.json")).default;
  if (locale === "ar") return (await import("./ar.json")).default;
  return {};
}
