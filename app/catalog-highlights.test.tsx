import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CatalogHighlights from "./CatalogHighlights";

const state = vi.hoisted(() => ({ data: null as any, loading: true, error: "", retry: vi.fn() }));
vi.mock("../src/platform/Widgets", () => ({ useData: () => state }));
afterEach(() => {
  cleanup();
  Object.assign(state, { data: null, loading: true, error: "" });
  state.retry.mockClear();
});
const product = { id: "leather-product", title: "کیف چرمی", description: "", price: 120000, images: '["https://images.example.test/bag.webp"]', details: "{}" };

it("uses catalogue photos and detail links and displays the existing price in rials", () => {
  Object.assign(state, { loading: false, data: { rows: [product] } });
  const { container } = render(<CatalogHighlights />);
  expect(container.querySelector(".catalog-highlight img")?.getAttribute("src")).toBe("https://images.example.test/bag.webp");
  expect(screen.getByRole("link", { name: /کیف چرمی/ }).getAttribute("href")).toBe("/shop/leather-product");
  expect(container.textContent).toContain("۱٬۲۰۰٬۰۰۰");
  expect(container.textContent).toContain("ریال");
  expect(container.innerHTML).not.toContain("/assets/collections/");
});

it("does not show stale products on failure and lets the customer retry", () => {
  Object.assign(state, { loading: false, error: "offline", data: { rows: [product] } });
  render(<CatalogHighlights />);
  expect(screen.queryByText(product.title)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  expect(state.retry).toHaveBeenCalledOnce();
});

it("keeps loading and empty results distinct without substituting a fictional product", () => {
  const view = render(<CatalogHighlights />);
  expect(screen.getByRole("status").textContent).toContain("در حال دریافت");
  Object.assign(state, { loading: false, data: { rows: [] } });
  view.rerender(<CatalogHighlights />);
  expect(screen.getByRole("link", { name: "ارتباط با هما نت" }).getAttribute("href")).toBe("/contact");
  expect(view.container.querySelector(".catalog-highlight")).toBeNull();
});

it.each(['invalid-json', '["javascript:alert(1)"]', '[]'])("keeps products usable when their image data is unusable: %s", (images) => {
  Object.assign(state, { loading: false, data: { rows: [{ ...product, images }] } });
  const { container } = render(<CatalogHighlights />);
  expect(container.querySelector(".catalog-highlight img")).toBeNull();
  expect(screen.getByRole("link", { name: /کیف چرمی/ })).toBeTruthy();
});
