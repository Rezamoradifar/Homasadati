import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import en from "../src/i18n/en.json";
import ar from "../src/i18n/ar.json";
import ProductPage from "./shop/[id]/page";

const state = vi.hoisted(() => ({
  locale: "fa" as "fa" | "en" | "ar",
  details: {} as Record<string, unknown>,
}));
vi.mock("../src/platform/schema", () => ({ one: () => ({
  id: "published-bag", title: "کیف چرمی", description: "توضیحات فروشنده",
  vertical: "craft", subtype: "چرم", price: 12000000, stock: 15,
  cancel_hours: 48, images: "[]", details: JSON.stringify(state.details),
}) }));
vi.mock("../src/i18n/server", () => ({ siteLocale: async () => state.locale }));
vi.mock("../src/i18n/SiteLocale", () => ({ useSiteLocale: () => ({
  locale: state.locale, dictionary: state.locale === "en" ? en : state.locale === "ar" ? ar : {},
}) }));
vi.mock("../src/commerce/Shell", () => ({ CommerceShell: ({ children }: { children: ReactNode }) => children }));
afterEach(() => { cleanup(); state.locale = "fa"; state.details = {}; });

it.each(["fa", "en", "ar"] as const)("renders customer category labels in %s and retains the published price", async (locale) => {
  state.locale = locale;
  state.details = { craftCategory: "leather", craftItem: "bag", cost: 987654, supplier: "private supplier", lowStock: 4 };
  const { container } = render(await ProductPage({ params: Promise.resolve({ id: "published-bag" }) }));
  const values = [...container.querySelectorAll(".product-specs dd")].map(node => node.textContent);
  const dict = locale === "en" ? en : ar;
  expect(values).toEqual(locale === "fa" ? ["محصولات چرمی", "کیف"] : [dict["محصولات چرمی"], dict["کیف"]]);
  expect(container.querySelector("main")!.textContent).not.toMatch(/leather|\bbag\b|دیتابیس|private supplier|987654/);
  const structured = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
  expect(structured[0].offers.price).toBe(120000000);
});

it("preserves merchant-written specifications and unknown saved values", async () => {
  state.details = { craftCategory: "custom-category", material: "متریال اختصاصی کارگاه", shippingNote: "تحویل با هماهنگی کارگاه" };
  const { container } = render(await ProductPage({ params: Promise.resolve({ id: "published-bag" }) }));
  expect(container.querySelector(".product-specs")!.textContent).toContain("custom-category");
  expect(container.textContent).toContain("متریال اختصاصی کارگاه");
  expect(container.textContent).toContain("تحویل با هماهنگی کارگاه");
});
