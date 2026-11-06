// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DigiPayPurchase, DigiPayTicketInput } from "./digipay";

// All requests are mocked. No provider authentication, payment or refund occurs.
let gateway: typeof import("./digipay");
let fetchMock = vi.fn<typeof fetch>();
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const authenticated = (access = "access-1", refresh = "refresh-1", expires = 3600) => response({
  access_token: access, refresh_token: refresh, token_type: "bearer", expires_in: expires,
});
const ticketResponse = (redirectUrl = "https://uatweb.mydigipay.info/web-pay/tgs/v2:ticket-1") => response({
  result: { status: 0 }, ticket: "v2:ticket-1", redirectUrl,
});
const ticketInput = (): DigiPayTicketInput => ({
  providerId: "checkout-attempt-1",
  amountRial: 2_500_000,
  cellNumber: "+989121234567",
  callbackUrl: "https://homanets.test/api/platform/payment/callback?gateway=digipay",
  basketId: "checkout-1",
  items: [{
    sellerId: "seller-7", supplierId: "supplier-9", productCode: "SKU-123",
    brand: "هما", productType: 1, count: 2, categoryId: "merchant-approved-category",
  }],
});
const purchase: DigiPayPurchase = {
  providerId: "checkout-attempt-1", trackingCode: "19259313601650191846745", type: 5, amountRial: 2_500_000,
};
const verifiedResponse = (extra: Record<string, unknown> = {}) => response({
  result: { status: 0 }, providerId: purchase.providerId, trackingCode: purchase.trackingCode,
  amount: purchase.amountRial, paymentGateway: 4, ...extra,
});

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_ORIGIN", "https://homanets.test");
  vi.stubEnv("DIGIPAY_ENABLED", "1");
  vi.stubEnv("DIGIPAY_ENVIRONMENT", "sandbox");
  vi.stubEnv("DIGIPAY_USERNAME", "test-merchant");
  vi.stubEnv("DIGIPAY_PASSWORD", "test-password-never-exposed");
  vi.stubEnv("DIGIPAY_CLIENT_ID", "test-client");
  vi.stubEnv("DIGIPAY_CLIENT_SECRET", "test-secret-never-exposed");
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  gateway = await import("./digipay");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("configuration", () => {
  it("exports only a safe summary and requires an explicit enable flag", async () => {
    expect(gateway.digipayConfig()).toEqual({ environment: "sandbox", origin: "https://homanets.test" });
    expect(gateway.digipayEnabled()).toBe(true);
    vi.stubEnv("DIGIPAY_ENABLED", "0");
    expect(gateway.digipayEnabled()).toBe(false);
    await expect(gateway.createDigiPayTicket(ticketInput())).rejects.toMatchObject({ code: "digipay_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["DIGIPAY_CLIENT_SECRET", ""], ["DIGIPAY_ENVIRONMENT", ""], ["DIGIPAY_ENVIRONMENT", "unknown"],
    ["APP_ORIGIN", "http://homanets.test"], ["APP_ORIGIN", "https://homanets.test/other"],
    ["APP_ORIGIN", "https://user:password@homanets.test"], ["APP_ORIGIN", "https://homanets.test?origin=other"],
  ])("does not enable an incomplete or unsafe configuration (%s)", async (key, value) => {
    vi.stubEnv(key, value);
    expect(gateway.digipayEnabled()).toBe(false);
    await expect(gateway.createDigiPayTicket(ticketInput())).rejects.toMatchObject({ code: "digipay_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forbids sandbox payment verification in a production process", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(gateway.digipayEnabled()).toBe(false);
    await expect(gateway.verifyDigiPayPurchase(purchase)).rejects.toMatchObject({ code: "digipay_sandbox_forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can finish existing payments after disabling new checkout attempts", async () => {
    vi.stubEnv("DIGIPAY_ENABLED", "0");
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(verifiedResponse());
    await expect(gateway.verifyDigiPayPurchase(purchase)).resolves.toEqual(purchase);
  });
});

describe("ticket and authentication", () => {
  it("sends exact server-owned rial amounts and basket data with the documented UPG ticket type", async () => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(ticketResponse());
    await expect(gateway.createDigiPayTicket(ticketInput())).resolves.toEqual({
      ticket: "v2:ticket-1", redirectUrl: "https://uatweb.mydigipay.info/web-pay/tgs/v2:ticket-1",
    });
    const [authUrl, authInit] = fetchMock.mock.calls[0];
    expect(authUrl).toBe("https://uat.mydigipay.info/digipay/api/oauth/token");
    expect(authInit?.redirect).toBe("error");
    expect(authInit?.headers).toMatchObject({ Authorization: `Basic ${Buffer.from("test-client:test-secret-never-exposed").toString("base64")}` });
    expect(Object.fromEntries((authInit?.body as FormData).entries())).toEqual({
      username: "test-merchant", password: "test-password-never-exposed", grant_type: "password",
    });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://uat.mydigipay.info/digipay/api/tickets/business?type=11");
    expect(init?.headers).toMatchObject({ Agent: "WEB", "Digipay-Version": "2022-02-02", Authorization: "Bearer access-1" });
    expect(JSON.parse(init?.body as string)).toEqual({
      providerId: "checkout-attempt-1", amount: 2_500_000, cellNumber: "09121234567",
      callbackUrl: ticketInput().callbackUrl,
      basketDetailsDto: { basketId: "checkout-1", items: ticketInput().items },
    });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])("rejects invalid rial amount %s before any request", async (amountRial) => {
    await expect(gateway.createDigiPayTicket({ ...ticketInput(), amountRial })).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a callback to another origin and an empty credit basket", async () => {
    await expect(gateway.createDigiPayTicket({ ...ticketInput(), callbackUrl: "https://evil.test/callback" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(gateway.createDigiPayTicket({ ...ticketInput(), items: [] })).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://uatweb.mydigipay.info/pay", "https://evil.test/pay", "https://uatweb.mydigipay.info.evil.test/pay",
    "https://uatweb.mydigipay.info@evil.test/pay", "https://uatweb.mydigipay.info:444/pay", "https://mydigipay.com/pay",
  ])("rejects unsafe or cross-environment redirect %s", async (url) => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(ticketResponse(url));
    await expect(gateway.createDigiPayTicket(ticketInput())).rejects.toMatchObject({ code: "digipay_invalid_redirect" });
  });

  it("uses the production API only with explicit production configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DIGIPAY_ENVIRONMENT", "production");
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(ticketResponse("https://www.mydigipay.com/web-pay/tgs/v2:ticket-1"));
    await gateway.createDigiPayTicket(ticketInput());
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mydigipay.com/digipay/api/oauth/token");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.mydigipay.com/digipay/api/tickets/business?type=11");
  });

  it("rejects a lookalike production redirect domain", async () => {
    vi.stubEnv("DIGIPAY_ENVIRONMENT", "production");
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(ticketResponse("https://mydigipay.com.evil.test/pay"));
    await expect(gateway.createDigiPayTicket(ticketInput())).rejects.toMatchObject({ code: "digipay_invalid_redirect" });
  });

  it("reuses a token until its TTL and refreshes it before expiration", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    fetchMock.mockResolvedValueOnce(authenticated("access-1", "refresh-1", 60))
      .mockResolvedValueOnce(ticketResponse()).mockResolvedValueOnce(ticketResponse())
      .mockResolvedValueOnce(authenticated("access-2", "refresh-2"))
      .mockResolvedValueOnce(ticketResponse());
    await gateway.createDigiPayTicket(ticketInput());
    await gateway.createDigiPayTicket({ ...ticketInput(), providerId: "attempt-2" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    clock.mockReturnValue(1_059_000);
    await gateway.createDigiPayTicket({ ...ticketInput(), providerId: "attempt-3" });
    expect(Object.fromEntries((fetchMock.mock.calls[3][1]?.body as FormData).entries())).toEqual({
      grant_type: "refresh_token", refresh_token: "refresh-1",
    });
    expect(fetchMock.mock.calls[4][1]?.headers).toMatchObject({ Authorization: "Bearer access-2" });
  });

  it("shares a single authentication request across simultaneous requests", async () => {
    let resolveAuth!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveAuth = resolve; }))
      .mockImplementation(async () => ticketResponse());
    const first = gateway.createDigiPayTicket(ticketInput());
    const second = gateway.createDigiPayTicket({ ...ticketInput(), providerId: "attempt-2" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveAuth(authenticated());
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes once after HTTP 401 and retries only that authenticated request", async () => {
    fetchMock.mockResolvedValueOnce(authenticated())
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(authenticated("access-2", "refresh-2"))
      .mockResolvedValueOnce(ticketResponse());
    await gateway.createDigiPayTicket(ticketInput());
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1]?.headers).toMatchObject({ Authorization: "Bearer access-2" });
    expect(fetchMock.mock.calls[1][1]?.body).toBe(fetchMock.mock.calls[3][1]?.body);
  });

  it("does not loop on repeated 401 and does not expose provider error bodies", async () => {
    fetchMock.mockResolvedValueOnce(authenticated())
      .mockResolvedValueOnce(response({ error: "test-password-never-exposed" }, 401))
      .mockResolvedValueOnce(authenticated("access-2", "refresh-2"))
      .mockResolvedValueOnce(response({ error: "test-secret-never-exposed" }, 401));
    await expect(gateway.createDigiPayTicket(ticketInput())).rejects.toMatchObject({
      code: "digipay_authentication_failed", message: "digipay_authentication_failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("keeps authentication failures free of credentials and raw provider messages", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "test-password-never-exposed", details: "test-secret-never-exposed" }, 401));
    await expect(gateway.createDigiPayTicket(ticketInput())).rejects.toMatchObject({
      code: "digipay_authentication_failed", message: "digipay_authentication_failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds a pending provider request without automatically resubmitting it", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(authenticated()).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("raw-network-error")), { once: true });
    }));
    const check = expect(gateway.createDigiPayTicket(ticketInput())).rejects.toMatchObject({ code: "digipay_timeout" });
    await vi.advanceTimersByTimeAsync(12_001);
    await check;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("payment verification", () => {
  it.each([2_500_000, "2500000"])("requires authenticated matching verification with a documented amount representation %s", async (amount) => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(verifiedResponse({ amount }));
    await expect(gateway.verifyDigiPayPurchase(purchase)).resolves.toEqual(purchase);
    expect(fetchMock.mock.calls[1][0]).toBe("https://uat.mydigipay.info/digipay/api/purchases/verify?type=5");
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      providerId: purchase.providerId, trackingCode: purchase.trackingCode,
    });
  });

  it.each([
    { amount: 1000 }, { amount: "2.5e6" }, { providerId: "another-order" },
    { trackingCode: "another-payment" }, { amount: undefined },
  ])("never accepts mismatched or incomplete authenticated verification: %j", async (override) => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(verifiedResponse(override));
    await expect(gateway.verifyDigiPayPurchase(purchase)).rejects.toMatchObject({ code: "digipay_payment_mismatch" });
  });

  it("keeps provider status 9011 uncertain instead of treating it as paid", async () => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response({ result: { status: 9011, message: "unknown" } }, 422));
    await expect(gateway.verifyDigiPayPurchase(purchase)).rejects.toMatchObject({ code: "digipay_provider_rejected", providerStatus: 9011 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires both HTTP 200 and numeric result.status zero", async () => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(verifiedResponse({ result: { status: "0" } }));
    await expect(gateway.verifyDigiPayPurchase(purchase)).rejects.toMatchObject({ code: "digipay_provider_rejected" });
  });
});

describe("fulfillment and refunds", () => {
  it("sends a distinct delivery request with the original purchase tracking code", async () => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response({ result: { status: 0 } }));
    const input = { trackingCode: purchase.trackingCode, type: 5 as const, deliveryDate: 1_793_959_526_000, invoiceNumber: "invoice-1", products: ["SKU-123"] };
    await expect(gateway.deliverDigiPayPurchase(input)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe("https://uat.mydigipay.info/digipay/api/purchases/deliver?type=5");
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      trackingCode: input.trackingCode, deliveryDate: input.deliveryDate, invoiceNumber: input.invoiceNumber, products: input.products,
    });
  });

  it("returns a refund reference without pretending an accepted refund is already complete", async () => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response({ result: { status: 0 }, trackingCode: "refund-track-1" }));
    await expect(gateway.refundDigiPayPurchase({
      providerId: "refund-1", saleTrackingCode: purchase.trackingCode, amountRial: 500_000, type: 5,
    })).resolves.toEqual({ providerId: "refund-1", trackingCode: "refund-track-1", type: 5, amountRial: 500_000 });
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      providerId: "refund-1", saleTrackingCode: purchase.trackingCode, amount: 500_000,
    });
  });

  it.each([[0, "succeeded"], [1, "failed"], [2, "pending"]] as const)("distinguishes refund status %s from request acceptance", async (status, outcome) => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response({
      result: { status: 0 }, providerId: "refund-1", trackingCode: "refund-track-1", status,
    }));
    await expect(gateway.inquireDigiPayRefund({ providerId: "refund-1", trackingCode: "refund-track-1", type: 5 })).resolves.toEqual({
      providerId: "refund-1", trackingCode: "refund-track-1", outcome,
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://uat.mydigipay.info/digipay/api/refunds/refund-track-1?type=5");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("POST");
  });

  it("can inquire by the durable refund provider ID after an uncertain request timeout", async () => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response({
      result: { status: 0 }, providerId: "refund-1", trackingCode: "refund-track-1", status: 2,
    }));
    await expect(gateway.inquireDigiPayRefund({ providerId: "refund-1", type: 13 })).resolves.toMatchObject({ outcome: "pending" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://uat.mydigipay.info/digipay/api/refunds/refund-1?type=13");
  });

  it.each([{ providerId: "different-refund" }, { trackingCode: "different-tracking" }])("rejects a refund inquiry belonging to another request: %j", async (override) => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response({
      result: { status: 0 }, providerId: "refund-1", trackingCode: "refund-track-1", status: 0, ...override,
    }));
    await expect(gateway.inquireDigiPayRefund({ providerId: "refund-1", trackingCode: "refund-track-1", type: 5 })).rejects.toMatchObject({ code: "digipay_refund_mismatch" });
  });

  it("does not interpret the request result as final refund status when status is missing", async () => {
    fetchMock.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response({
      result: { status: 0 }, providerId: "refund-1", trackingCode: "refund-track-1",
    }));
    await expect(gateway.inquireDigiPayRefund({ providerId: "refund-1", type: 5 })).rejects.toMatchObject({ code: "digipay_refund_unconfirmed" });
  });
});
