"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  direction,
  isLocale,
  loadDictionary,
  type Dictionary,
  type SiteLocale,
} from "./core";
const Context = createContext({
  locale: "fa" as SiteLocale,
  dictionary: {} as Dictionary,
  changing: false,
  setLocale: (_locale: SiteLocale) => {},
});
export function SiteLocaleProvider({
  initialLocale = "fa",
  initialDictionary = {},
  children,
}: {
  initialLocale?: SiteLocale;
  initialDictionary?: Dictionary;
  children: ReactNode;
}) {
  const [locale, setValue] = useState(initialLocale),
    [dictionary, setDictionary] = useState(initialDictionary),
    [changing, setChanging] = useState(false);
  const router = useRouter();
  useEffect(() => {
    setValue(initialLocale);
    setDictionary(initialDictionary);
  }, [initialLocale, initialDictionary]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
  }, [locale]);
  async function setLocale(next: SiteLocale) {
    if (!isLocale(next) || next === locale || changing) return;
    setChanging(true);
    try {
      const messages = await loadDictionary(next);
      document.cookie = `homay-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      try {
        localStorage.setItem("homay-locale", next);
      } catch {}
      setDictionary(messages);
      setValue(next);
      router.refresh();
    } finally {
      setChanging(false);
    }
  }
  return (
    <Context.Provider value={{ locale, dictionary, changing, setLocale }}>
      {children}
    </Context.Provider>
  );
}
export const useSiteLocale = () => useContext(Context);
export function LanguagePicker() {
  const { locale, setLocale, changing } = useSiteLocale();
  return (
    <label className="site-language-picker">
      <span className="sr-only">
        {locale === "en"
          ? "Website language"
          : locale === "ar"
            ? "لغة الموقع"
            : "زبان سایت"}
      </span>
      <select
        aria-label={
          locale === "en"
            ? "Website language"
            : locale === "ar"
              ? "لغة الموقع"
              : "زبان سایت"
        }
        value={locale}
        disabled={changing}
        onChange={(e) => setLocale(e.target.value as SiteLocale)}
      >
        <option value="fa">فارسی</option>
        <option value="en">English</option>
        <option value="ar">العربية</option>
      </select>
    </label>
  );
}
