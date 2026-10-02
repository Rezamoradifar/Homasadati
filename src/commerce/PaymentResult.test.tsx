import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteLocaleProvider } from "../i18n/SiteLocale";
import { api } from "../platform/client";
import PaymentResult from "./PaymentResult";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../platform/client", () => ({ api: vi.fn() }));

const paymentId = "c6e11a30-18ce-4b9a-8b7d-c2df38dd0d73";
const paymentPath = `payments/bale/${paymentId}`;
const botUrl = "https://ble.ir/Homanets_bot?start=pay_test_123";
const apiMock = vi.mocked(api);

type Summary = {
  status: string;
  amount: number;
  reference: string | null;
  orders: string[];
  checkoutPaid: boolean;
  resolution:
    "order" | "wallet_credit" | "review" | "pending" | "failed" | "cancelled";
  botUrl?: string;
};

function summary(overrides: Partial<Summary> = {}): Summary {
  return {
    status: "pending",
    amount: 250_000,
    reference: null,
    orders: [],
    checkoutPaid: false,
    resolution: "pending",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function renderResult() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <SiteLocaleProvider initialLocale="fa">
        <PaymentResult />
      </SiteLocaleProvider>,
    );
  });
  return view;
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function expectNotBusy() {
  const card = screen.getByRole("heading", { level: 1 }).closest("section");
  expect(card).not.toBeNull();
  expect(card?.getAttribute("aria-busy")).not.toBe("true");
}

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.mockReset();
  apiMock.mockResolvedValue(summary());
  window.history.replaceState({}, "", `/payment/bale?pid=${paymentId}`);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("Bale payment result resolution", () => {
  it("shows an order as successful only after the server confirms its payment", async () => {
    apiMock.mockResolvedValue(
      summary({
        status: "paid",
        resolution: "order",
        checkoutPaid: true,
        orders: ["HOMAY-123"],
        reference: "BALE-456",
      }),
    );

    await renderResult();

    expect(screen.getByRole("heading", { name: "پرداخت موفق" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "مشاهدهٔ سفارش‌ها" })
        .getAttribute("href"),
    ).toBe("/account?tab=orders");
    expect(screen.getByText("HOMAY-123")).toBeTruthy();
    expect(screen.getByText("BALE-456")).toBeTruthy();
    expectNotBusy();
    await advance(60_000);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      resolution: "wallet_credit" as const,
      heading: "مبلغ به کیف پول سایت اضافه شد",
      action: "مشاهدهٔ کیف پول",
      href: "/account?tab=wallet",
    },
    {
      resolution: "review" as const,
      heading: "پرداخت نیاز به بررسی دارد",
      action: "پیگیری از پشتیبانی",
      href: "/account?tab=tickets",
    },
  ])(
    "routes $resolution to the appropriate next step without claiming an order succeeded",
    async ({ resolution, heading, action, href }) => {
      apiMock.mockResolvedValue(summary({ status: "paid", resolution }));

      await renderResult();

      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
      expect(
        screen.getByRole("link", { name: action }).getAttribute("href"),
      ).toBe(href);
      expect(screen.queryByRole("heading", { name: "پرداخت موفق" })).toBeNull();
      expect(
        screen.queryByRole("link", { name: "مشاهدهٔ سفارش‌ها" }),
      ).toBeNull();
      expectNotBusy();
      await advance(60_000);
      expect(apiMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { status: "paid", resolution: "order" as const, checkoutPaid: false },
    { status: "pending", resolution: "order" as const, checkoutPaid: true },
    {
      status: "pending",
      resolution: "wallet_credit" as const,
      checkoutPaid: false,
    },
  ])(
    "requires consistent confirmation for $resolution ($status, checkoutPaid=$checkoutPaid)",
    async (response) => {
      apiMock.mockResolvedValue(summary(response));

      await renderResult();

      expect(
        screen.getByRole("heading", { name: "پرداخت نیاز به بررسی دارد" }),
      ).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: "پیگیری از پشتیبانی" })
          .getAttribute("href"),
      ).toBe("/account?tab=tickets");
      expect(
        screen.queryByRole("link", { name: "مشاهدهٔ سفارش‌ها" }),
      ).toBeNull();
      expect(
        screen.queryByRole("link", { name: "مشاهدهٔ کیف پول" }),
      ).toBeNull();
    },
  );

  it.each([
    { resolution: "failed" as const, heading: "پرداخت تأیید نشد" },
    { resolution: "cancelled" as const, heading: "پرداخت لغو شد" },
  ])(
    "keeps $resolution distinct from a successful order",
    async ({ resolution, heading }) => {
      apiMock.mockResolvedValue(summary({ status: resolution, resolution }));

      await renderResult();

      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
      expect(
        screen.queryByRole("link", { name: "مشاهدهٔ سفارش‌ها" }),
      ).toBeNull();
      expectNotBusy();
      await advance(60_000);
      expect(apiMock).toHaveBeenCalledTimes(1);
    },
  );

  it("uses only a server-supplied bot URL while the payment is pending", async () => {
    window.history.replaceState(
      {},
      "",
      `/payment/bale?pid=${paymentId}&status=paid&checkoutPaid=true&resolution=order&botUrl=https%3A%2F%2Fexample.invalid%2Funtrusted`,
    );
    apiMock.mockResolvedValue(summary({ botUrl }));

    await renderResult();

    expect(
      screen.getByRole("heading", { name: "در انتظار تأیید پرداخت" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "ادامهٔ پرداخت در بله" })
        .getAttribute("href"),
    ).toBe(botUrl);
    expect(screen.queryByRole("link", { name: "مشاهدهٔ سفارش‌ها" })).toBeNull();
    expect(
      screen
        .getAllByRole("link")
        .some((link) => link.getAttribute("href")?.includes("example.invalid")),
    ).toBe(false);
  });

  it("does not construct a bot link from the return URL when the server omits it", async () => {
    window.history.replaceState(
      {},
      "",
      `/payment/bale?pid=${paymentId}&botUrl=${encodeURIComponent(botUrl)}`,
    );

    await renderResult();

    expect(
      screen.queryByRole("link", { name: "ادامهٔ پرداخت در بله" }),
    ).toBeNull();
  });

  it("removes the bot action when a verified response resolves the payment", async () => {
    apiMock
      .mockResolvedValueOnce(summary({ botUrl }))
      .mockResolvedValue(
        summary({ status: "paid", resolution: "wallet_credit", botUrl }),
      );
    await renderResult();
    expect(
      screen.getByRole("link", { name: "ادامهٔ پرداخت در بله" }),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "بررسی دوباره" }));
    });

    expect(
      screen.queryByRole("link", { name: "ادامهٔ پرداخت در بله" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "مشاهدهٔ کیف پول" })).toBeTruthy();
  });
});

describe("Bale payment result requests", () => {
  it.each([
    { name: "missing", query: "" },
    { name: "unstructured hexadecimal", query: `?pid=${"a".repeat(36)}` },
    { name: "only separators", query: `?pid=${"-".repeat(36)}` },
    {
      name: "non-hexadecimal UUID",
      query: "?pid=c6e11a30-18ce-4b9a-8b7d-c2df38dd0d7z",
    },
  ])(
    "reports a $name payment ID without requesting or remaining busy",
    async ({ query }) => {
      window.history.replaceState({}, "", `/payment/bale${query}`);

      await renderResult();

      expect(
        screen.getByRole("heading", { name: "نشانی پرداخت معتبر نیست" }),
      ).toBeTruthy();
      expect(screen.getByRole("alert").textContent).not.toBe("");
      expectNotBusy();
      await advance(60_000);
      expect(apiMock).not.toHaveBeenCalled();
    },
  );

  it("reads the summary with GET, then bounds automatic POST verification requests", async () => {
    await renderResult();

    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenNthCalledWith(1, paymentPath);
    await advance(60_000);

    const requestCount = apiMock.mock.calls.length;
    expect(requestCount).toBeGreaterThan(1);
    expect(requestCount).toBeLessThanOrEqual(6);
    for (const request of apiMock.mock.calls.slice(1)) {
      expect(request).toEqual([`${paymentPath}/verify`, "POST", {}]);
    }
    await advance(60_000);
    expect(apiMock).toHaveBeenCalledTimes(requestCount);
  });

  it("reports an initial request error without a perpetual checking state", async () => {
    apiMock.mockRejectedValueOnce(new Error("Payment service unavailable"));

    await renderResult();

    expect(
      screen.getByRole("heading", { name: "بررسی پرداخت ممکن نشد" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Payment service unavailable",
    );
    expectNotBusy();
    await advance(60_000);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it("cancels the scheduled poll when manual verification starts", async () => {
    const manual = deferred<Summary>();
    apiMock
      .mockResolvedValueOnce(summary())
      .mockReturnValueOnce(manual.promise);
    await renderResult();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "بررسی دوباره" }));
    });
    expect(apiMock).toHaveBeenNthCalledWith(
      2,
      `${paymentPath}/verify`,
      "POST",
      {},
    );
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
    await advance(60_000);
    expect(apiMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      manual.resolve(
        summary({ status: "paid", resolution: "order", checkoutPaid: true }),
      );
    });
    expect(screen.getByRole("heading", { name: "پرداخت موفق" })).toBeTruthy();
    await advance(60_000);
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("prevents a manual recheck from racing an automatic verification in flight", async () => {
    const automatic = deferred<Summary>();
    apiMock
      .mockResolvedValueOnce(summary())
      .mockReturnValueOnce(automatic.promise);
    await renderResult();
    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
    });
    expect(apiMock).toHaveBeenCalledTimes(2);

    const recheck = screen.getByRole("button") as HTMLButtonElement;
    expect(recheck.disabled).toBe(true);
    fireEvent.click(recheck);
    fireEvent.click(recheck);
    await advance(60_000);
    expect(apiMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      automatic.resolve(summary({ status: "paid", resolution: "review" }));
    });
    expect(
      screen.getByRole("heading", { name: "پرداخت نیاز به بررسی دارد" }),
    ).toBeTruthy();
    await advance(60_000);
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("clears a scheduled poll on unmount before it can make another request", async () => {
    const view = await renderResult();
    expect(apiMock).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(60_000);

    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { phase: "initial GET", settlement: "resolve", requests: 1 },
    { phase: "initial GET", settlement: "reject", requests: 1 },
    { phase: "verification POST", settlement: "resolve", requests: 2 },
    { phase: "verification POST", settlement: "reject", requests: 2 },
  ])(
    "ignores $settlement of an in-flight $phase after unmount",
    async ({ settlement, requests }) => {
      const request = deferred<Summary>();
      if (requests === 2) apiMock.mockResolvedValueOnce(summary());
      apiMock.mockReturnValueOnce(request.promise);
      const view = await renderResult();
      if (requests === 2) {
        await act(async () => {
          await vi.advanceTimersToNextTimerAsync();
        });
      }
      expect(apiMock).toHaveBeenCalledTimes(requests);

      view.unmount();
      await act(async () => {
        if (settlement === "resolve") request.resolve(summary());
        else request.reject(new Error("Obsolete request"));
      });
      await advance(60_000);

      expect(apiMock).toHaveBeenCalledTimes(requests);
    },
  );
});
