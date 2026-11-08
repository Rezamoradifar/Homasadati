import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DigiPayCreditPanel from "./DigiPayCreditPanel";
import creditCopy from "./digipay-credit-copy.json";

const locale = vi.hoisted(() => ({ value: "fa" as "fa" | "en" | "ar" }));
const request = vi.hoisted(() => vi.fn());
vi.mock("../i18n/SiteLocale", () => ({ useSiteLocale: () => ({ locale: locale.value }) }));
vi.mock("./client", async original => ({ ...await original<typeof import("./client")>(), api: request }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  locale.value = "fa";
  request.mockReset();
  window.history.replaceState(null, "", "/account?tab=digipay-credit");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

describe("DigiPay credit account panel", () => {
  it("waits for the current Homa payment status before showing availability", async () => {
    const pending = deferred<{ digipay: boolean }>();
    request.mockReturnValue(pending.promise);
    render(<DigiPayCreditPanel />);
    expect(screen.getByRole("status").textContent).toContain(creditCopy.fa.status.loading);
    expect(screen.queryByText(creditCopy.fa.status.available)).toBeNull();

    await act(async () => { pending.resolve({ digipay: true }); await pending.promise; });
    expect(screen.getByRole("status").textContent).toContain(creditCopy.fa.status.available);
  });

  it("shows Homa's available payment method without inventing customer credit or a balance", async () => {
    request.mockResolvedValue({ digipay: true, creditApproved: true, creditBalance: 987654321, availableCredit: 876543210 });
    render(<DigiPayCreditPanel />);
    await screen.findByText(creditCopy.fa.status.available);
    expect(screen.getByText(creditCopy.fa.balanceNote)).toBeTruthy();
    const text = document.body.textContent || "";
    for (const value of [987654321, 876543210]) {
      for (const language of ["en", "fa", "ar"]) expect(text).not.toContain(new Intl.NumberFormat(language).format(value));
      expect(text).not.toContain(String(value));
    }
    expect(screen.queryByText(/اعتبار شما (فعال|تأیید) شد|وام شما تأیید شد|credit (has been )?approved/i)).toBeNull();
  });

  it("treats disabled or nonboolean gateway values as unavailable while keeping credit-request links accessible", async () => {
    for (const digipay of [false, "true", 1, undefined]) {
      request.mockResolvedValue({ digipay });
      const view = render(<DigiPayCreditPanel />);
      await screen.findByText(creditCopy.fa.status.unavailable);
      expect(screen.queryByText(creditCopy.fa.status.available)).toBeNull();
      expect(screen.getAllByRole("link").some(link => link.getAttribute("href") === "https://app.mydigipay.com/")).toBe(true);
      view.unmount();
    }
  });

  it("reports an unavailable status check and retries without claiming payment or credit success", async () => {
    request.mockRejectedValueOnce(new Error("Status unavailable")).mockResolvedValueOnce({ digipay: true });
    render(<DigiPayCreditPanel />);
    expect((await screen.findByRole("alert")).textContent).toContain(creditCopy.fa.status.error);
    expect(screen.queryByText(creditCopy.fa.status.available)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: creditCopy.fa.retry }));
    await screen.findByText(creditCopy.fa.status.available);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(request.mock.calls).toEqual([["payment/methods"], ["payment/methods"]]);
  });

  it("offers official credit/app links safely and direct Homa shopping, cart, guide and order links", async () => {
    window.history.replaceState(null, "", "/account?tab=digipay-credit&phone=09121234567&nationalId=0012345678");
    request.mockResolvedValue({ digipay: true });
    const view = render(<DigiPayCreditPanel />);
    await screen.findByText(creditCopy.fa.status.available);
    const links = screen.getAllByRole("link");
    const hrefs = links.map(link => link.getAttribute("href"));
    for (const href of ["https://www.mydigipay.com/bnpl/c-bnpl/", "https://www.mydigipay.com/credit/c-credit/", "https://app.mydigipay.com/", "/digipay", "/shop", "/cart", "/account?tab=orders"]) {
      expect(hrefs).toContain(href);
    }
    for (const link of links.filter(link => link.getAttribute("href")?.startsWith("https://"))) {
      const url = new URL(link.getAttribute("href")!);
      expect(["www.mydigipay.com", "app.mydigipay.com"]).toContain(url.hostname);
      expect(url.search).toBe("");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
      expect(url.href).not.toMatch(/09121234567|0012345678|token|session|userId|nationalId/i);
    }
    const scopedOrders = "/account?tab=orders&companyMember=77d04bad-b852-4b0f-bca6-796788273bfa";
    view.rerender(<DigiPayCreditPanel ordersHref={scopedOrders} />);
    expect(screen.getByRole("link", { name: creditCopy.fa.orders }).getAttribute("href")).toBe(scopedOrders);
    for (const link of screen.getAllByRole("link").filter(link => link.getAttribute("href")?.startsWith("https://")))
      expect(new URL(link.getAttribute("href")!).search).toBe("");
  });

  it("only reads public payment availability and presents no money-top-up form or payment mutation", async () => {
    request.mockResolvedValue({ digipay: false });
    render(<DigiPayCreditPanel />);
    await screen.findByText(creditCopy.fa.status.unavailable);
    expect(request.mock.calls).toEqual([["payment/methods"]]);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: /شارژ|افزایش اعتبار|دریافت وام|top.?up|fund account/i })).toBeNull();
    expect(document.querySelector("form")).toBeNull();
  });

  it("keeps a new panel's status intact when a previous unmounted request finishes", async () => {
    const previous = deferred<{ digipay: boolean }>();
    request.mockReturnValueOnce(previous.promise).mockResolvedValueOnce({ digipay: false });
    const old = render(<DigiPayCreditPanel />);
    old.unmount();
    render(<DigiPayCreditPanel />);
    await screen.findByText(creditCopy.fa.status.unavailable);

    await act(async () => { previous.resolve({ digipay: true }); await previous.promise; });
    expect(screen.getByRole("status").textContent).toContain(creditCopy.fa.status.unavailable);
    expect(screen.queryByText(creditCopy.fa.status.available)).toBeNull();
  });

  it("renders separate Persian, English and Arabic copy with the correct reading direction", async () => {
    request.mockResolvedValue({ digipay: true });
    const statuses: string[] = [];
    for (const language of ["fa", "en", "ar"] as const) {
      locale.value = language;
      const view = render(<DigiPayCreditPanel />);
      await waitFor(() => expect(screen.getByRole("status").textContent).toContain(creditCopy[language].status.available));
      const root = view.container.firstElementChild;
      expect(root?.getAttribute("lang")).toBe(language);
      expect(root?.getAttribute("dir")).toBe(language === "en" ? "ltr" : "rtl");
      statuses.push(screen.getByRole("status").textContent || "");
      view.unmount();
    }
    expect(new Set(statuses).size).toBe(3);
  });
});
