import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteLocaleProvider } from "../i18n/SiteLocale";
import en from "../i18n/en.json";
import ar from "../i18n/ar.json";
import { api, type RecordData } from "../platform/client";
import Cart from "./Cart";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../platform/client", () => ({ api: vi.fn() }));
vi.mock("./basket", () => ({
  useBasket: () => ({
    ready: true,
    items: [{ productId: "8461b53e-7829-4b84-988b-9f303b823c6e", quantity: 1 }],
  }),
  writeBasket: vi.fn(),
}));

const checkoutId = "1abc4680-bb4b-4881-b65b-bd2575b0bc4c";
const productId = "8461b53e-7829-4b84-988b-9f303b823c6e";
const apiMock = vi.mocked(api);
const guidance =
  "پس از ثبت سفارش، ربات Homanets_bot در بله باز می‌شود. اگر «شروع / Start» نمایش داده شد، آن را بزنید، صورتحساب را پرداخت کنید و از پیوند نتیجه به سایت برگردید.";
let checkoutState: RecordData;
let paymentResponse: RecordData;

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/cart");
  checkoutState = { status: "pending", method: "bale" };
  paymentResponse = {
    status: "redirect",
    url: "https://ble.ir/Homanets_bot?start=pay_test_123",
  };
  apiMock.mockReset();
  apiMock.mockImplementation(async (path) => {
    if (path === "me") return { user: { id: "buyer" } };
    if (path === "addresses") return { rows: [] };
    if (path === "seven-card-plan") return { member: { voucherBalance: 0 } };
    if (path === "payment/methods") return { bale: true };
    if (path === "cart/quote")
      return {
        total: 10000,
        requiresAddress: false,
        rows: [
          {
            id: productId,
            title: "Test product",
            details: {},
            price: 10000,
            lineTotal: 10000,
            images: "[]",
          },
        ],
      };
    if (path === `checkouts/${checkoutId}`) return checkoutState;
    if (path === `checkouts/${checkoutId}/payment`) return paymentResponse;
    throw new Error("Unexpected API call: " + path);
  });
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

async function renderCart(locale: "fa" | "en" | "ar" = "fa") {
  const dictionary = locale === "en" ? en : locale === "ar" ? ar : {};
  await act(async () => {
    render(
      <SiteLocaleProvider initialLocale={locale} initialDictionary={dictionary}>
        <Cart />
      </SiteLocaleProvider>,
    );
  });
}

describe("Bale cart handoff", () => {
  it.each(["fa", "en", "ar"] as const)(
    "explains Start, invoice payment and returning to the site in %s",
    async (locale) => {
      await renderCart(locale);
      const dictionary = locale === "en" ? en : locale === "ar" ? ar : null;
      const method = screen.getByRole("combobox", {
        name: dictionary?.["روش پرداخت"] || "روش پرداخت",
      });
      fireEvent.change(method, { target: { value: "bale" } });
      const instruction = screen.getByText(dictionary?.[guidance] || guidance);
      expect(instruction.textContent).toContain("Homanets_bot");
      expect(instruction.textContent).toContain("Start");
      expect(method.getAttribute("aria-describedby")).toBe(instruction.id);
      expect(
        apiMock.mock.calls.some(([path]) => path.startsWith("checkouts/")),
      ).toBe(false);
    },
  );

  it.each(["checkout", "payment"])(
    "keeps Bale's paid %s response neutral and links to order and wallet history",
    async (source) => {
      sessionStorage.setItem("homa-pending-checkout", checkoutId);
      if (source === "checkout")
        checkoutState = { status: "paid", method: "bale" };
      else paymentResponse = { status: "paid" };
      await renderCart();
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "ادامه / بررسی پرداخت" }),
        );
      });
      expect(screen.getByText(/این سفارش سابقهٔ پرداخت دارد/)).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: "مشاهدهٔ کیف پول" })
          .getAttribute("href"),
      ).toBe("/account?tab=wallet");
      expect(
        screen
          .getByRole("link", { name: "مشاهده سفارش‌ها ←" })
          .getAttribute("href"),
      ).toBe("/account?tab=orders");
      expect(screen.queryByText("پرداخت ثبت شد.")).toBeNull();
      expect(screen.queryByText("پرداخت موفق")).toBeNull();
      expect(sessionStorage.getItem("homa-pending-checkout")).toBeNull();
    },
  );

  it("preserves bank redirects whose API response contains a URL without a status", async () => {
    sessionStorage.setItem("homa-pending-checkout", checkoutId);
    checkoutState = { status: "pending", method: "zarinpal" };
    // jsdom supports same-document navigation, allowing us to observe assign()
    // without changing production navigation or contacting a payment provider.
    paymentResponse = { url: "#bank-payment" };
    await renderCart();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "ادامه / بررسی پرداخت" }),
      );
    });
    expect(apiMock).toHaveBeenCalledWith(
      `checkouts/${checkoutId}/payment`,
      "POST",
      {},
    );
    expect(window.location.hash).toBe("#bank-payment");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rejects a Bale redirect to another host and leaves the checkout available for review", async () => {
    sessionStorage.setItem("homa-pending-checkout", checkoutId);
    paymentResponse = {
      status: "redirect",
      url: "https://payments.example.test/Homanets_bot?start=pay_test_123",
    };
    await renderCart();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "ادامه / بررسی پرداخت" }),
      );
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "پیوند پرداخت بله معتبر نیست",
    );
    expect(
      screen.queryByRole("link", { name: "ادامهٔ پرداخت در بله" }),
    ).toBeNull();
    expect(sessionStorage.getItem("homa-pending-checkout")).toBe(checkoutId);
  });
});
