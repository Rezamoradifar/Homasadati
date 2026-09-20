"use client";
import { useEffect, useState } from "react";
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    setDark(root.dataset.theme === "dark");
    const sync = () => setDark(root.dataset.theme === "dark");
    window.addEventListener("homa-theme", sync);
    return () => window.removeEventListener("homa-theme", sync);
  }, []);
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
      aria-label={dark ? "حالت روز / Light mode" : "حالت شب / Dark mode"}
      aria-pressed={dark}
    >
      <span aria-hidden="true">{dark ? "☀" : "☾"}</span>
      <span>{dark ? "روز" : "شب"}</span>
    </button>
  );
}
