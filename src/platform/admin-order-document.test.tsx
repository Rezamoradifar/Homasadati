import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminOrderDetails from "./AdminOrderDetails";
import AdminOrderPrint from "./AdminOrderPrint";
import OrderDocumentView from "./OrderDocumentView";
import type { OrderDocumentData } from "./order-document-types";

const request = vi.hoisted(() => vi.fn());
vi.mock("./client", async (original) => ({
  ...await original<typeof import("./client")>(),
  api: request,
}));

function documentFixture(id = "order-one"): OrderDocumentData {
  return {
    order: {
      id, title: "نمونه کیف چرمی", vertical: "leather", quantity: 3,
      unitPrice: 2500000, amount: 7500000, status: "processing",
      paymentMethod: "digipay", paymentRef: "DGP-verified-26",
      createdAt: "2026-11-07T08:00:00.000Z", paidAt: "2026-11-07T08:02:00.000Z",
    },
    customer: { name: "Maryam Snapshot", phone: "09121234567", source: "snapshot" },
    shipping: {
      label: "خانه", country: "ایران", city: "اصفهان", postalCode: "8170000000",
      address: "خیابان نمونه ۱۲، پلاک ۸\nواحد دوم",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => { request.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("administrator order document", () => {
  it("shows the order's recipient, full delivery details and purchased quantity", () => {
    const document = documentFixture();
    render(<OrderDocumentView document={document} />);

    for (const text of ["Maryam Snapshot", "09121234567", "اصفهان", "8170000000", "DGP-verified-26"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByText(/خیابان نمونه ۱۲، پلاک ۸\s+واحد دوم/).textContent).toBe(document.shipping!.address);
    const line = screen.getByRole("row", { name: /نمونه کیف چرمی/ });
    expect(within(line).getByRole("cell", { name: "۳" })).toBeTruthy();
  });

  it("identifies a legacy current-profile contact without inventing missing delivery details", () => {
    const document = documentFixture();
    document.customer = { name: "Current Profile Recipient", phone: null, source: "current_profile" };
    document.shipping = null;
    render(<OrderDocumentView document={document} />);

    expect(screen.getByText("Current Profile Recipient")).toBeTruthy();
    expect(screen.getByText(/مشخصات فعلی حساب/)).toBeTruthy();
    expect(screen.getByText(/نشانی.*ثبت نشده|نشانی.*موجود نیست/)).toBeTruthy();
    expect(screen.queryByText("8170000000")).toBeNull();
    expect(screen.queryByText("09121234567")).toBeNull();
    expect(screen.getAllByText(/ثبت نشده|موجود نیست/).length).toBeGreaterThan(1);
  });

  it("requests only the selected order and encodes its A5 link without contact data", async () => {
    const id = "order /?#+selected";
    request.mockResolvedValue(documentFixture(id));
    render(<AdminOrderDetails orderId={id} />);

    await screen.findByText("Maryam Snapshot");
    expect(request).toHaveBeenCalledWith("admin/orders/" + encodeURIComponent(id));
    const link = screen.getByRole("link", { name: /A5/ });
    expect(link.getAttribute("href")).toBe("/admin/orders/" + encodeURIComponent(id) + "/print");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("href")).not.toMatch(/Maryam|09121234567|8170000000/);
  });

  it("ignores an older order's late response after the selected order is ready", async () => {
    const first = deferred<OrderDocumentData>();
    const second = deferred<OrderDocumentData>();
    request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<AdminOrderDetails orderId="order-first" />);
    view.rerender(<AdminOrderDetails orderId="order-second" />);

    const latest = documentFixture("order-second");
    latest.customer.name = "Second Recipient";
    await act(async () => { second.resolve(latest); await second.promise; });
    expect(screen.getByText("Second Recipient")).toBeTruthy();

    await act(async () => { first.resolve(documentFixture("order-first")); await first.promise; });
    expect(screen.queryByText("Maryam Snapshot")).toBeNull();
    expect(screen.getByText("Second Recipient")).toBeTruthy();
    expect(screen.getByRole("link", { name: /A5/ }).getAttribute("href")).toBe("/admin/orders/order-second/print");
  });

  it("does not replace a selected-order error with an older order's late recipient", async () => {
    const first = deferred<OrderDocumentData>();
    request.mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error("Order not found"));
    const view = render(<AdminOrderDetails orderId="order-first" />);
    view.rerender(<AdminOrderDetails orderId="order-missing" />);
    await screen.findByRole("alert");

    await act(async () => { first.resolve(documentFixture("order-first")); await first.promise; });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Maryam Snapshot")).toBeNull();
    expect(screen.queryByRole("link", { name: /A5/ })).toBeNull();
  });

  it("never leaves the previous order's private details or print link visible after the next order fails", async () => {
    const pending = deferred<OrderDocumentData>();
    request.mockResolvedValueOnce(documentFixture()).mockReturnValueOnce(pending.promise);
    const view = render(<AdminOrderDetails orderId="order-one" />);
    await screen.findByText("Maryam Snapshot");

    view.rerender(<AdminOrderDetails orderId="order-unavailable" />);
    expect(screen.queryByText("Maryam Snapshot")).toBeNull();
    expect(screen.queryByText("8170000000")).toBeNull();
    expect(screen.queryByRole("link", { name: /A5/ })).toBeNull();

    await act(async () => { pending.reject(new Error("Order details are unavailable")); await pending.promise.catch(() => {}); });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Maryam Snapshot")).toBeNull();
    expect(screen.queryByRole("link", { name: /A5/ })).toBeNull();
  });

  it("prints only after the selected document is ready and disables printing when the order changes", async () => {
    const first = deferred<OrderDocumentData>();
    const second = deferred<OrderDocumentData>();
    request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const view = render(<AdminOrderPrint orderId="order-one" />);

    const button = screen.getByRole("button", { name: /چاپ/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(print).not.toHaveBeenCalled();

    await act(async () => { first.resolve(documentFixture()); await first.promise; });
    await waitFor(() => expect((screen.getByRole("button", { name: /چاپ/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /چاپ/ }));
    expect(print).toHaveBeenCalledTimes(1);

    view.rerender(<AdminOrderPrint orderId="order-two" />);
    expect(screen.queryByText("Maryam Snapshot")).toBeNull();
    expect((screen.getByRole("button", { name: /چاپ/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /چاپ/ }));
    expect(print).toHaveBeenCalledTimes(1);
    await act(async () => { second.reject(new Error("Not authorized")); await second.promise.catch(() => {}); });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByRole("button", { name: /چاپ/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("waits for fonts and cancels a print request if the selected recipient changes meanwhile", async () => {
    const fonts = deferred<void>();
    const next = deferred<OrderDocumentData>();
    const descriptor = Object.getOwnPropertyDescriptor(document, "fonts");
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready: fonts.promise } });
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    request.mockResolvedValueOnce(documentFixture()).mockReturnValueOnce(next.promise);
    try {
      const view = render(<AdminOrderPrint orderId="order-one" />);
      await screen.findByText("Maryam Snapshot");
      fireEvent.click(screen.getByRole("button", { name: /چاپ/ }));
      expect(print).not.toHaveBeenCalled();
      expect((screen.getByRole("button", { name: /چاپ/ }) as HTMLButtonElement).disabled).toBe(true);

      view.rerender(<AdminOrderPrint orderId="order-two" />);
      await act(async () => { fonts.resolve(); await fonts.promise; });
      expect(print).not.toHaveBeenCalled();

      const latest = documentFixture("order-two");
      latest.customer.name = "Second Print Recipient";
      await act(async () => { next.resolve(latest); await next.promise; });
      fireEvent.click(screen.getByRole("button", { name: /چاپ/ }));
      await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
      expect(screen.getByText("Second Print Recipient")).toBeTruthy();
    } finally {
      if (descriptor) Object.defineProperty(document, "fonts", descriptor);
      else Reflect.deleteProperty(document, "fonts");
    }
  });
});
