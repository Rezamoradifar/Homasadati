"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useSiteLocale } from "../i18n/SiteLocale";
export default function ThemeToggle() {
  const { locale } = useSiteLocale(),
    [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () =>
      setDark(document.documentElement.dataset.theme === "dark");
    sync();
    window.addEventListener("homa-theme", sync);
    return () => window.removeEventListener("homa-theme", sync);
  }, []);
  const words = {
    fa: {
      day: "روز",
      night: "شب",
      light: "تغییر به حالت روز",
      dark: "تغییر به حالت شب",
    },
    en: {
      day: "Light",
      night: "Dark",
      light: "Switch to light mode",
      dark: "Switch to dark mode",
    },
    ar: {
      day: "نهار",
      night: "ليل",
      light: "التبديل إلى الوضع النهاري",
      dark: "التبديل إلى الوضع الليلي",
    },
  }[locale];
  function toggle() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    setDark(next);
    try {
      localStorage.setItem("homa-theme", next ? "dark" : "light");
    } catch {}
    window.dispatchEvent(new Event("homa-theme"));
  }
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? words.light : words.dark}
      title={dark ? words.light : words.dark}
      aria-pressed={dark}
    >
      <span className="theme-track" aria-hidden="true">
        <Sun size={15} />
        <Moon size={15} />
        <span className="theme-thumb" />
      </span>
      <span className="theme-label">{dark ? words.night : words.day}</span>
    </button>
  );
}
