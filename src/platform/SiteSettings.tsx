"use client";
import { createContext, useContext, ReactNode } from "react";
const SiteContext = createContext<Record<string, string>>({});
export function SiteSettingsProvider({
  value,
  children,
}: {
  value: Record<string, string>;
  children: ReactNode;
}) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}
export const useSiteSettings = () => useContext(SiteContext);
