import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, PlatformApiError, type RecordData } from "./client";
import { Orders } from "./UserPanel";

vi.mock("./client", async () => ({
  ...await vi.importActual<typeof import("./client")>("./client"),
  api: vi.fn(),
}));
const call = vi.mocked(api);
const orderId = "bd2eaf04-0c2b-4c31-a94b-22f98f9d1d80";

beforeEach(() => {
  call.mockReset();
  window.history.replaceState({}, "", "/account?tab=orders");
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

function orderApi(method: string, pendingRefund = false) {
  let order: RecordData = {
    id: orderId,
    title: "سفارش آزمون",
    vertical: "craft",
    amount: 100_000,
    status: "processing",
    payment_method: method,
    payment_ref: "provider-verified",
    created_at: "2026-11-07T00:00:00.000Z",
    paid_at: "2026-11-07T00:01:00.000Z",
    cancel_until: "2026-11-08T00:01:00.000Z",
    refunded_at: null,
    policy: "{}",
  };
  call.mockImplementation(async (path) => {
    if (path.startsWith("orders?")) return { rows: [order], hasMore: false };
    if (path === `orders/${orderId}`) return order;
    if (path === `orders/${orderId}/cancel`) {
      if (pendingRefund) throw new PlatformApiError("digipay_refund_pending", 409);
      order = { ...order, status: "refunded", refunded_at: "2026-11-07T01:00:00.000Z" };
      return order;
    }
    throw new Error(`Unexpected test request: ${path}`);
  });
}

async function openOrder(onChange = vi.fn()) {
  const user = userEvent.setup();
  render(<Orders refresh={0} onChange={onChange} />);
  await user.click(await screen.findByRole("button", { name: "جزئیات" }));
  await screen.findByRole("heading", { name: "پیگیری سفارش و پرداخت" });
  return { user, onChange };
}

it("asks for a provider refund, without offering a cash-wallet refund for DigiPay credit", async () => {
  orderApi("digipay");
  const { user, onChange } = await openOrder();
  expect(screen.queryByLabelText("با بازگشت وجه به کیف پول موافقم")).toBeNull();
  expect(screen.queryByText(/برای انتقال بانکی، درخواست برداشت ثبت کنید/)).toBeNull();
  expect(screen.getByText(/لغو نهایی پس از تأیید بازگشت خرید ثبت می‌شود/)).toBeTruthy();
  await user.click(screen.getByLabelText("با بازگشت خرید از طریق دیجی‌پی موافقم"));
  await user.click(screen.getByRole("button", { name: "درخواست لغو از دیجی‌پی" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
  expect(call).toHaveBeenCalledWith(`orders/${orderId}/cancel`, "POST", { providerRefundConsent: true });
  expect(screen.queryByRole("button", { name: "درخواست لغو از دیجی‌پی" })).toBeNull();
});

it("keeps the order open and explains an unconfirmed DigiPay refund", async () => {
  orderApi("digipay", true);
  const { user, onChange } = await openOrder();
  await user.click(screen.getByLabelText("با بازگشت خرید از طریق دیجی‌پی موافقم"));
  await user.click(screen.getByRole("button", { name: "درخواست لغو از دیجی‌پی" }));
  await screen.findByRole("alert");
  expect(screen.getByText("بازگشت خرید دیجی‌پی هنوز تأیید نشده است. نتیجه را از جزئیات سفارش و پشتیبانی پیگیری کنید.")).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
  expect(within(screen.getByRole("dialog")).queryByText("بازگشت وجه")).toBeNull();
});

it("preserves the existing wallet-refund consent for other payment methods", async () => {
  orderApi("zibal");
  const { user, onChange } = await openOrder();
  expect(screen.queryByLabelText("با بازگشت خرید از طریق دیجی‌پی موافقم")).toBeNull();
  await user.click(screen.getByLabelText("با بازگشت وجه به کیف پول موافقم"));
  await user.click(screen.getByRole("button", { name: "لغو سفارش" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
  expect(call).toHaveBeenCalledWith(`orders/${orderId}/cancel`, "POST", { walletRefundConsent: true });
});
