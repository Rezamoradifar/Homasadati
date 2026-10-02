// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baleApi, BaleApiError } from "./bale-api";

const config = {
  botToken: "12345:fixture_BOT_TOKEN_only",
  providerToken: "WALLET-TEST-1111111111111111",
};
const client = () => baleApi(config);
const fetchMock = vi.fn<typeof fetch>();
const envelope = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), {
  headers: { "Content-Type": "application/json; charset=utf-8" },
});
const receipt = { message_id: 81, chat: { id: 123 }, text: "unneeded upstream content" };
const transaction = {
  id: "payment-81", status: "paid", userID: 123, amount: 2500000, createdAt: 1790964000,
};
const invoice = {
  chatId: 123, payload: "payment-attempt-81", amountRial: 2500000, description: "سفارش هما نت",
};

beforeEach(() => {
  fetchMock.mockReset();
  // Any call without an explicit fixture fails locally; never use a real API.
  fetchMock.mockRejectedValue(new Error("Unexpected mocked fetch"));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Bale official request contract", () => {
  it("uses only the fixed HTTPS origin, POST JSON and redirect rejection for identity and webhook setup", async () => {
    const api = baleApi({ ...config, providerToken: "" });
    fetchMock.mockResolvedValueOnce(envelope({ id: 12345, username: "Homanets_bot", is_bot: true, first_name: "ignored" }));
    expect(await api.getMe()).toEqual({ id: 12345, username: "Homanets_bot", is_bot: true });
    fetchMock.mockResolvedValueOnce(envelope({ url: "", pending_update_count: 17 }));
    expect(await api.getWebhookInfo()).toEqual({ url: "" });
    const url = "https://homanets.test/api/bale/hook-secret";
    fetchMock.mockResolvedValueOnce(envelope(true));
    expect(await api.setWebhook(url)).toBe(true);
    expect(fetchMock.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      `https://tapi.bale.ai/bot${config.botToken}/getMe`,
      `https://tapi.bale.ai/bot${config.botToken}/getWebhookInfo`,
      `https://tapi.bale.ai/bot${config.botToken}/setWebhook`,
    ]);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({
        method: "POST", redirect: "error", cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ url });
  });

  it("sends the stored integer rial amount and opaque payload without invented payment fields", async () => {
    fetchMock.mockResolvedValue(envelope(receipt));
    expect(await client().sendInvoice(invoice)).toEqual({ message_id: 81, chat: { id: 123 } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://tapi.bale.ai/bot${config.botToken}/sendInvoice`);
    expect(JSON.parse(String(options?.body))).toEqual({
      chat_id: 123, title: "Homanet", description: invoice.description,
      payload: invoice.payload, provider_token: config.providerToken,
      prices: [{ label: "Homanet", amount: 2500000 }],
    });
  });

  it("preserves message text and inline buttons while returning only the needed message identity", async () => {
    const markup = { inline_keyboard: [[{ text: "بازگشت", url: "https://homanets.test/account" }]] };
    fetchMock.mockResolvedValue(envelope({ ...receipt, chat: { id: -123 } }));
    expect(await client().sendMessage(-123, "رسید سفارش\nآماده است", markup)).toEqual({ message_id: 81, chat: { id: -123 } });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      chat_id: -123, text: "رسید سفارش\nآماده است", reply_markup: markup,
    });
  });

  it("acknowledges or rejects precheckout with only the documented fields", async () => {
    fetchMock.mockImplementation(async () => envelope(true));
    expect(await client().answerPreCheckoutQuery("pre-81", true, "ignored on approval")).toBe(true);
    expect(await client().answerPreCheckoutQuery("pre-82", false, "سفارش در دسترس نیست")).toBe(true);
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(String(options?.body)))).toEqual([
      { pre_checkout_query_id: "pre-81", ok: true },
      { pre_checkout_query_id: "pre-82", ok: false, error_message: "سفارش در دسترس نیست" },
    ]);
    await expect(client().answerPreCheckoutQuery("pre-83", false)).rejects.toMatchObject({ code: "bale_invalid_request" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["pending", "paid", "failed", "rejected"] as const)("returns the exact documented %s transaction state", async (status) => {
    fetchMock.mockResolvedValue(envelope({ ...transaction, status, description: "discarded" }));
    expect(await client().inquireTransaction("payment-81")).toEqual({ ...transaction, status });
    expect(fetchMock.mock.calls[0][0]).toBe(`https://tapi.bale.ai/bot${config.botToken}/inquireTransaction`);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ transaction_id: "payment-81" });
  });

  it("accepts inquiry responses without an optional creation timestamp", async () => {
    const { createdAt: _createdAt, ...withoutTimestamp } = transaction;
    fetchMock.mockResolvedValue(envelope(withoutTimestamp));
    expect(await client().inquireTransaction("payment-81")).toEqual(withoutTimestamp);
  });
});

describe("strict payment and identity validation", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "2500000"])(
    "rejects an invalid outbound amount %s before any request", async (amountRial) => {
      await expect(client().sendInvoice({ ...invoice, amountRial: amountRial as number })).rejects.toMatchObject({ code: "bale_invalid_request" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("enforces the 128-byte UTF-8 payload limit and valid chat/message content", async () => {
    for (const input of [
      { ...invoice, payload: "آ".repeat(65) },
      { ...invoice, payload: "" },
      { ...invoice, chatId: 0 },
      { ...invoice, chatId: Number.MAX_SAFE_INTEGER + 1 },
      { ...invoice, description: "x".repeat(256) },
    ]) await expect(client().sendInvoice(input)).rejects.toMatchObject({ code: "bale_invalid_request" });
    await expect(client().sendMessage(123, "\u0000")).rejects.toMatchObject({ code: "bale_invalid_request" });
    await expect(client().sendMessage(123, "x".repeat(4097))).rejects.toMatchObject({ code: "bale_invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(envelope(receipt));
    await expect(client().sendInvoice({ ...invoice, payload: "آ".repeat(64) })).resolves.toMatchObject({ message_id: 81 });
  });

  it("rejects credential path injection and missing wallet credentials locally", async () => {
    await expect(baleApi({ ...config, botToken: "12345:secret/../getMe?leak=1" }).getMe()).rejects.toMatchObject({ code: "bale_not_configured" });
    await expect(baleApi({ ...config, providerToken: "" }).sendInvoice(invoice)).rejects.toMatchObject({ code: "bale_not_configured" });
    await expect(client().setWebhook("http://homanets.test/hook")).rejects.toMatchObject({ code: "bale_invalid_request" });
    await expect(client().setWebhook("https://user:password@homanets.test/hook")).rejects.toMatchObject({ code: "bale_invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed bot identity and wrong-chat message receipts", async () => {
    for (const result of [
      { id: "12345", username: "Homanets_bot", is_bot: true },
      { id: 12345, username: "Homanets_bot", is_bot: false },
      { id: 12345, username: "https://bad.test", is_bot: true },
    ]) {
      fetchMock.mockResolvedValueOnce(envelope(result));
      await expect(client().getMe()).rejects.toMatchObject({ code: "bale_invalid_response" });
    }
    fetchMock.mockResolvedValueOnce(envelope({ message_id: 81, chat: { id: 456 } }));
    await expect(client().sendInvoice(invoice)).rejects.toMatchObject({ code: "bale_invalid_response" });
  });

  it.each([
    { status: "cancelled" }, { status: ["paid"] }, { status: 1 },
    { id: "another-payment" }, { amount: "2500000" }, { amount: 1.5 },
    { userID: "123" }, { userID: Number.MAX_SAFE_INTEGER + 1 }, { createdAt: "yesterday" },
  ])("rejects ambiguous or mismatched transaction data %j", async (override) => {
    fetchMock.mockResolvedValue(envelope({ ...transaction, ...override }));
    await expect(client().inquireTransaction("payment-81")).rejects.toMatchObject({ code: "bale_invalid_response" });
  });

  it("requires exact JSON booleans and a result field", async () => {
    for (const raw of [{ ok: "true", result: true }, { ok: true }, { ok: true, result: "true" }]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(raw), { headers: { "Content-Type": "application/json" } }));
      await expect(client().setWebhook("https://homanets.test/hook")).rejects.toMatchObject({ code: "bale_invalid_response" });
    }
  });
});

describe("transport failures remain bounded and confidential", () => {
  it("never exposes provider descriptions, tokens, URLs or nested causes", async () => {
    const secret = `https://tapi.bale.ai/bot${config.botToken}/sendInvoice ${config.providerToken}`;
    const failures = [
      () => Promise.reject(new Error(secret)),
      async () => new Response(secret, { status: 502 }),
      async () => new Response(JSON.stringify({ ok: false, error_code: 400, description: secret }), { headers: { "Content-Type": "application/json" } }),
      async () => new Response(`{invalid: ${secret}`, { headers: { "Content-Type": "application/json" } }),
    ];
    for (const response of failures) {
      fetchMock.mockImplementationOnce(response);
      const error = await client().sendInvoice(invoice).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(BaleApiError);
      expect(error).not.toHaveProperty("cause");
      const exposed = JSON.stringify(error) + String(error) + (error as Error).stack;
      expect(exposed).not.toContain(config.botToken);
      expect(exposed).not.toContain(config.providerToken);
      expect(exposed).not.toContain("https://tapi.bale.ai");
    }
  });

  it("rejects malformed request serialization without leaking thrown messages", async () => {
    const markup = { toJSON() { throw new Error(config.providerToken); } };
    await expect(client().sendMessage(123, "Hello", markup)).rejects.toMatchObject({ code: "bale_invalid_request", message: "bale_invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects HTML and invalid UTF-8 even when the HTTP status is successful", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }));
    await expect(client().getMe()).rejects.toMatchObject({ code: "bale_invalid_response" });
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([0xc0, 0xaf]), { headers: { "Content-Type": "application/json" } }));
    await expect(client().getMe()).rejects.toMatchObject({ code: "bale_invalid_response" });
  });

  it("caps response bytes with and without a trustworthy content-length header", async () => {
    const cancel = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), {
      headers: { "Content-Type": "application/json", "Content-Length": "65537" },
    }));
    await expect(client().getMe()).rejects.toMatchObject({ code: "bale_response_too_large" });
    expect(cancel).toHaveBeenCalledOnce();

    const streamedCancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(33000));
        controller.enqueue(new Uint8Array(33000));
      },
      cancel: streamedCancel,
    });
    fetchMock.mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "application/json", "Content-Length": "1" } }));
    await expect(client().getMe()).rejects.toMatchObject({ code: "bale_response_too_large" });
    expect(streamedCancel).toHaveBeenCalledOnce();
  });

  it("times out and aborts a stalled request within 3500ms even if fetch ignores abort", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const promise = client().getMe();
    const assertion = expect(promise).rejects.toMatchObject({ code: "bale_timeout" });
    const signal = fetchMock.mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(3499);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });

  it("enforces the 2500ms precheckout deadline while the response body is stalled", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "Content-Type": "application/json" } }));
    const assertion = expect(client().answerPreCheckoutQuery("pre-81", true)).rejects.toMatchObject({ code: "bale_timeout" });
    await vi.advanceTimersByTimeAsync(2499);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
