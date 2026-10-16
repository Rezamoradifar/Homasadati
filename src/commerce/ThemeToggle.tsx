"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useSiteLocale } from "../i18n/SiteLocale";

type Mode = "light" | "dark";
const storageKey = "homa-theme";

function systemMode(): Mode {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark" : "light";
}

function storedMode(): Mode | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

/** Shared site-wide theme controller: every instance reflects the same HTML mode. */
export default function ThemeToggle() {
  const { locale } = useSiteLocale();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme === "dark");
    const restore = () => {
      document.documentElement.dataset.theme = storedMode() || systemMode();
      sync();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) restore();
    };
    const onSystemChange = () => {
      if (!storedMode()) restore();
    };
    sync();
    window.addEventListener("homa-theme", sync);
    window.addEventListener("storage", onStorage);
    const media = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    media?.addEventListener?.("change", onSystemChange);
    return () => {
      window.removeEventListener("homa-theme", sync);
      window.removeEventListener("storage", onStorage);
      media?.removeEventListener?.("change", onSystemChange);
    };
  }, []);

  const words = {
    fa: {
      day: "روز", night: "شب",
      light: "تغییر به حالت روز", dark: "تغییر به حالت شب",
    },
    en: {
      day: "Light", night: "Dark",
      light: "Switch to light mode", dark: "Switch to dark mode",
    },
    ar: {
      day: "نهار", night: "ليل",
      light: "التبديل إلى الوضع النهاري", dark: "التبديل إلى الوضع الليلي",
    },
  }[locale];

  function toggle() {
    // Read the document, not a possibly stale copy from another mounted toggle.
    const next: Mode = document.documentElement.dataset.theme === "dark"
      ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setDark(next === "dark");
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Browsers with disabled storage can still switch for this session.
    }
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
