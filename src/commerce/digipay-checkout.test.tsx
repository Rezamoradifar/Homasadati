import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../platform/client";
import Cart from "./Cart";
import PaymentResult from "./PaymentResult";

vi.mock("../platform/client", async () => ({
  ...await vi.importActual<typeof import("../platform/client")>("../platform/client"),
  api: vi.fn(),
}));
const call = vi.mocked(api);
const productId = "62b745e6-04fd-4d30-867f-8c19567c548b";
const checkoutId = "bd2eaf04-0c2b-4c31-a94b-22f98f9d1d80";
const pid = "e1147ba2-c004-45dd-827b-3f2e12f18bc9";
const paymentSummary = {
  status: "pending",
  amount: 100_000,
  reference: null,
  orders: ["BD2EAF04"],
  checkoutPaid: false,
};

beforeEach(() => {
  call.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function cartApi(digipay: boolean, vatToman: number | null = null) {
  let paid = false;
  localStorage.setItem("homa-basket-v1", JSON.stringify([{ productId, quantity: 1 }]));
  call.mockImplementation(async (path) => {
    if (path === "payment/methods") return { wallet: true, zibal: true, zarinpal: false, bale: false, digipay };
    if (path === "me") return { user: { id: "member" } };
    if (path === "addresses") return { rows: [] };
    if (path === "seven-card-plan") return { member: { voucherBalance: 25_000 }, liveSettlement: true };
    if (path === "cart/quote") return {
      total: 100_000,
      creditVatEnabled: vatToman !== null,
      creditVatToman: vatToman ?? 0,
      creditVatReady: true,
      shippingFeeToman: 0,
      requiresAddress: false,
      rows: [{ id: productId, title: "محصول آزمون", images: "[]", details: "{}", price: 100_000, lineTotal: 100_000, stock: 5, quantity: 1 }],
    };
    if (path === "checkouts") return { id: checkoutId };
    if (path === `checkouts/${checkoutId}`) return { status: paid ? "paid" : "pending", amount: 100_000 };
    if (path === `checkouts/${checkoutId}/payment`) { paid = true; return { status: "paid" }; }
    throw new Error(`Unexpected test request: ${path}`);
  });
}

async function openPaymentStep() {
  const user = userEvent.setup();
  render(<Cart />);
  const next = await screen.findByRole("button", { name: "ادامه و اطلاعات خرید" });
  await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
  await user.click(next);
  await screen.findByRole("option", { name: "زیبال" });
  return user;
}

it("does not offer DigiPay when the server has not enabled the gateway", async () => {
  cartApi(false);
  await openPaymentStep();
  expect(screen.queryByRole("option", { name: "خرید با اعتبار دیجی‌پی" })).toBeNull();
  expect(screen.queryByRole("button", { name: /خرید با اعتبار دیجی‌پی/ })).toBeNull();
});

it("clears a selected Homa voucher before submitting a DigiPay credit checkout", async () => {
  cartApi(true);
  const user = await openPaymentStep();
  const voucher = await screen.findByRole("checkbox", { name: /استفاده از موجودی ووچر خرید/ });
  await user.click(voucher);
  expect((voucher as HTMLInputElement).checked).toBe(true);
  await user.selectOptions(screen.getByLabelText("روش پرداخت"), "digipay");
  expect(screen.queryByRole("checkbox", { name: /استفاده از موجودی ووچر خرید/ })).toBeNull();
  expect(screen.getByText(/پرداخت با اعتبار یا کیف پول اقساطی دیجی‌پی؛ تأیید و شرایط اعتبار در دیجی‌پی مشخص می‌شود/)).toBeTruthy();
  // The removed voucher must not silently reappear if the shopper switches back.
  await user.selectOptions(screen.getByLabelText("روش پرداخت"), "wallet");
  expect((screen.getByRole("checkbox", { name: /استفاده از موجودی ووچر خرید/ }) as HTMLInputElement).checked).toBe(false);
  await user.click(screen.getByRole("button", { name: /خرید با اعتبار دیجی‌پی/ }));
  await user.click(screen.getByRole("button", { name: "بررسی نهایی سفارش" }));
  await user.click(screen.getByRole("button", { name: "ثبت سفارش و پرداخت" }));
  await screen.findByRole("heading", { name: "پرداخت ثبت شد" });
  const payload = call.mock.calls.find(([path]) => path === "checkouts")?.[2];
  expect(payload).toMatchObject({ method: "digipay", expectedTotal: 100_000, items: [{ productId, quantity: 1 }] });
  expect(payload).not.toHaveProperty("useVoucher");
});

it("shows 10% VAT separately and sends the tax quoted by the server", async () => {
  cartApi(true,10_000);
  const user=await openPaymentStep();
  await user.selectOptions(screen.getByLabelText("روش پرداخت"),"digipay");
  expect(screen.getByText(/مالیات بر ارزش افزوده اقلام مشمول/)).toBeTruthy();
  await user.click(screen.getByRole("button",{name:"بررسی نهایی سفارش"}));
  await user.click(screen.getByRole("button",{name:"ثبت سفارش و پرداخت"}));
  await screen.findByRole("heading",{name:"پرداخت ثبت شد"});
  const payload=call.mock.calls.find(([path])=>path==="checkouts")?.[2];
  expect(payload).toMatchObject({method:"digipay",expectedTotal:100_000,expectedVatToman:10_000});
});


it("charges VAT separately for bank payment when merchant enables checkout VAT",async()=>{
  cartApi(true,10_000);
  call.mockImplementation(async(path)=>{
    if(path==="payment/methods")return {wallet:true,zibal:true,digipay:true};
    if(path==="me")return {user:{id:"member"}};
    if(path==="addresses")return {rows:[]};
    if(path==="seven-card-plan")return {member:{voucherBalance:0},liveSettlement:true};
    if(path==="cart/quote")return {total:100_000,creditVatEnabled:true,checkoutVatAllMethods:true,creditVatToman:10_000,creditVatReady:true,requiresAddress:false,shippingFeeToman:0,
      rows:[{id:productId,title:"محصول آزمون",price:100_000,lineTotal:100_000,stock:5,images:"[]",quantity:1,details:"{}"}]};
    if(path==="checkouts")return {id:checkoutId};
    if(path==="checkouts/"+checkoutId)return {status:"paid",amount:110_000};
    if(path==="checkouts/"+checkoutId+"/payment")return {status:"paid"};
    throw Error("unexpected "+path);
  });
  const user=await openPaymentStep();
  expect(screen.getByText(/مالیات بر ارزش افزوده اقلام مشمول/)).toBeTruthy();
  await user.click(screen.getByRole("button",{name:"بررسی نهایی سفارش"}));
  await user.click(screen.getByRole("button",{name:"ثبت سفارش و پرداخت"}));
  await screen.findByRole("heading",{name:"پرداخت ثبت شد"});
  expect(call.mock.calls.find(([path])=>path==="checkouts")?.[2]).toMatchObject({method:"zibal",expectedVatToman:10_000});
});

it("ignores a successful return URL until DigiPay and the checkout are verified by the server", async () => {
  window.history.replaceState({}, "", `/payment/result?provider=digipay&pid=${pid}&status=paid&result=SUCCESS`);
  call.mockResolvedValue(paymentSummary);
  render(<PaymentResult />);
  await screen.findByText("پرداخت دیجی‌پی هنوز تأیید نشده است. برای جلوگیری از پرداخت تکراری، نتیجهٔ همین سفارش را دوباره بررسی کنید.");
  expect(screen.queryByRole("heading", { name: "پرداخت موفق" })).toBeNull();
  expect(call).toHaveBeenCalledWith(`payments/digipay/${pid}`);
  expect(call.mock.calls.every(([path]) => !path.includes("bale"))).toBe(true);
});

it("requires a paid checkout as well as a verified transaction before showing success", async () => {
  window.history.replaceState({}, "", `/payment/result?provider=digipay&pid=${pid}`);
  call.mockResolvedValueOnce({ ...paymentSummary, status: "paid", reference: "dp-verified" });
  call.mockResolvedValueOnce({ ...paymentSummary, status: "paid", reference: "dp-verified", checkoutPaid: true });
  const user = userEvent.setup();
  render(<PaymentResult />);
  await screen.findByText(/پرداخت دیجی‌پی هنوز تأیید نشده است/);
  expect(screen.queryByRole("heading", { name: "پرداخت موفق" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "بررسی دوباره" }));
  await screen.findByRole("heading", { name: "پرداخت موفق" });
  expect(call).toHaveBeenLastCalledWith(`payments/digipay/${pid}/verify`, "POST", {});
});

it("keeps review payments unconfirmed and directs the shopper to support without automatic retries", async () => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", `/payment/result?provider=digipay&pid=${pid}`);
  call.mockResolvedValue({ ...paymentSummary, status: "review" });
  await act(async () => { render(<PaymentResult />); });
  expect(screen.getByRole("heading", { name: "پرداخت نیاز به بررسی دارد" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "پیگیری از پشتیبانی" }).getAttribute("href")).toBe("/account?tab=tickets");
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(call).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("heading", { name: "پرداخت موفق" })).toBeNull();
});

it("does not promise a bank cash refund for a failed DigiPay credit payment", async () => {
  window.history.replaceState({}, "", `/payment/result?provider=digipay&pid=${pid}`);
  call.mockResolvedValue({ ...paymentSummary, status: "failed" });
  render(<PaymentResult />);
  await screen.findByRole("heading", { name: "پرداخت ناموفق" });
  expect(screen.getByText(/اگر از اعتبار یا موجودی شما کسر شده/)).toBeTruthy();
  expect(screen.queryByText(/۷۲ ساعت/)).toBeNull();
});

it("preserves the legacy Bale return URL without a provider parameter", async () => {
  window.history.replaceState({}, "", `/payment/result?pid=${pid}`);
  call.mockResolvedValue({ ...paymentSummary, status: "paid", checkoutPaid: true });
  render(<PaymentResult />);
  await screen.findByRole("heading", { name: "پرداخت موفق" });
  expect(call).toHaveBeenCalledWith(`payments/bale/${pid}`);
});

it("preserves verified checkout results for the existing bank gateways", async () => {
  window.history.replaceState({}, "", `/payment/result?checkout=${checkoutId}`);
  call.mockResolvedValue({ status: "paid", amount: 100_000, payment_ref: "bank-verified", orders: [{ id: "order-id", status: "processing" }] });
  render(<PaymentResult />);
  await screen.findByRole("heading", { name: "پرداخت موفق" });
  expect(call).toHaveBeenCalledWith(`checkouts/${checkoutId}`);
  expect(screen.getByText("bank-verified")).toBeTruthy();
});
