import { baleConfig } from "./bale-config";

export type BaleApiConfig = { botToken: string; providerToken: string };
export type BaleMessage = { message_id: number; chat: { id: number } };
export type BaleTransaction = {
  id: string;
  status: "pending" | "paid" | "failed" | "rejected";
  userID: number;
  amount: number;
  createdAt?: number;
};
export type BaleApiErrorCode =
  | "bale_not_configured"
  | "bale_invalid_request"
  | "bale_timeout"
  | "bale_unavailable"
  | "bale_rejected"
  | "bale_invalid_response"
  | "bale_response_too_large";

/** Never retain an upstream error, response body, URL or credential in errors. */
export class BaleApiError extends Error {
  constructor(readonly code: BaleApiErrorCode) {
    super(code);
    this.name = "BaleApiError";
  }
}

const RESPONSE_LIMIT = 64 * 1024;
const REQUEST_LIMIT = 64 * 1024;
const REQUEST_TIMEOUT = 3500;
const PRECHECKOUT_TIMEOUT = 2500;
const encoder = new TextEncoder();
const invalidRequest = () => new BaleApiError("bale_invalid_request");
const invalidResponse = () => new BaleApiError("bale_invalid_response");

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function integer(value: unknown, minimum = 1): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}
function chatId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value !== 0;
}
function text(value: unknown, maximum: number, multiline = false): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    [...value].length <= maximum &&
    !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value);
}
function webhookUrl(value: unknown, allowEmpty = false): value is string {
  if (allowEmpty && value === "") return true;
  if (typeof value !== "string" || value.length > 2048 || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash &&
      ["", "443", "88"].includes(url.port);
  } catch {
    return false;
  }
}
function message(value: unknown, expectedChat: number): BaleMessage {
  if (!record(value) || !integer(value.message_id) || !record(value.chat) ||
      !chatId(value.chat.id) || value.chat.id !== expectedChat) throw invalidResponse();
  return { message_id: value.message_id, chat: { id: value.chat.id } };
}

/** Native Bale Bot API only. No inferred Telegram fields or payment URL templates.
 * Official contract: https://docs.bale.ai/ (wallet payments and transaction inquiry).
 * A failed request is not proof that a payment failed; callers must keep it pending.
 */
export function baleApi(config?: BaleApiConfig) {
  const { botToken, providerToken } = config ?? baleConfig();

  async function request(method: string, payload: object, timeout = REQUEST_TIMEOUT): Promise<unknown> {
    if (typeof botToken !== "string" || botToken.length > 512 ||
        !/^[0-9]+:[A-Za-z0-9_-]+$/.test(botToken)) throw new BaleApiError("bale_not_configured");

    let body: string;
    try {
      body = JSON.stringify(payload);
      if (encoder.encode(body).byteLength > REQUEST_LIMIT) throw invalidRequest();
    } catch {
      throw invalidRequest();
    }

    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        void reader?.cancel().catch(() => {});
        reject(new BaleApiError("bale_timeout"));
      }, timeout);
    });

    const operation = async () => {
      const response = await fetch(`https://tapi.bale.ai/bot${botToken}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      });
      const cancelBody = () => { void response.body?.cancel().catch(() => {}); };
      if (controller.signal.aborted) {
        cancelBody();
        throw new BaleApiError("bale_timeout");
      }
      if (!response.ok || response.redirected) {
        cancelBody();
        throw new BaleApiError(response.status === 429 || response.status >= 500 || response.redirected
          ? "bale_unavailable" : "bale_rejected");
      }
      const length = response.headers.get("content-length");
      if (length && /^\d+$/.test(length) && Number(length) > RESPONSE_LIMIT) {
        cancelBody();
        throw new BaleApiError("bale_response_too_large");
      }
      if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get("content-type") || "") || !response.body) {
        cancelBody();
        throw invalidResponse();
      }

      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (controller.signal.aborted) throw new BaleApiError("bale_timeout");
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > RESPONSE_LIMIT) {
            void reader.cancel().catch(() => {});
            throw new BaleApiError("bale_response_too_large");
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
        reader = undefined;
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let data: unknown;
      try {
        data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch {
        throw invalidResponse();
      }
      if (!record(data) || typeof data.ok !== "boolean") throw invalidResponse();
      if (!data.ok) throw new BaleApiError("bale_rejected");
      if (!Object.hasOwn(data, "result")) throw invalidResponse();
      return data.result;
    };
    try {
      return await Promise.race([operation(), deadline]);
    } catch (error) {
      if (error instanceof BaleApiError) throw error;
      throw new BaleApiError(controller.signal.aborted ? "bale_timeout" : "bale_unavailable");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getMe(): Promise<{ id: number; username: string; is_bot: true }> {
      const result = await request("getMe", {});
      if (!record(result) || !integer(result.id) || result.is_bot !== true ||
          typeof result.username !== "string" || !/^[A-Za-z0-9_]{1,128}$/.test(result.username)) throw invalidResponse();
      return { id: result.id, username: result.username, is_bot: true };
    },
    async getWebhookInfo(): Promise<{ url: string }> {
      const result = await request("getWebhookInfo", {});
      if (!record(result) || !webhookUrl(result.url, true)) throw invalidResponse();
      return { url: result.url };
    },
    async setWebhook(url: string): Promise<true> {
      if (!webhookUrl(url, true)) throw invalidRequest();
      if (await request("setWebhook", { url }) !== true) throw invalidResponse();
      return true;
    },
    async sendMessage(chat: number, content: string, replyMarkup?: object): Promise<BaleMessage> {
      if (!chatId(chat) || !text(content, 4096, true) ||
          (replyMarkup !== undefined && !record(replyMarkup))) throw invalidRequest();
      return message(await request("sendMessage", {
        chat_id: chat, text: content, ...(replyMarkup === undefined ? {} : { reply_markup: replyMarkup }),
      }), chat);
    },
    async sendInvoice(input: { chatId: number; payload: string; amountRial: number; description: string }): Promise<BaleMessage> {
      if (!chatId(input.chatId) || !text(input.payload, 128) || encoder.encode(input.payload).byteLength > 128 ||
          !integer(input.amountRial) || !text(input.description, 255, true)) throw invalidRequest();
      if (!text(providerToken, 512)) throw new BaleApiError("bale_not_configured");
      return message(await request("sendInvoice", {
        chat_id: input.chatId,
        title: "Homanet",
        description: input.description,
        payload: input.payload,
        provider_token: providerToken,
        prices: [{ label: "Homanet", amount: input.amountRial }],
      }), input.chatId);
    },
    async answerPreCheckoutQuery(id: string, ok: boolean, errorMessage?: string): Promise<true> {
      if (!text(id, 256) || typeof ok !== "boolean" ||
          (!ok && !text(errorMessage, 255, true))) throw invalidRequest();
      if (await request("answerPreCheckoutQuery", {
        pre_checkout_query_id: id, ok, ...(!ok ? { error_message: errorMessage } : {}),
      }, PRECHECKOUT_TIMEOUT) !== true) throw invalidResponse();
      return true;
    },
    async inquireTransaction(id: string): Promise<BaleTransaction> {
      if (!text(id, 256)) throw invalidRequest();
      const result = await request("inquireTransaction", { transaction_id: id });
      if (!record(result) || result.id !== id ||
          typeof result.status !== "string" || !["pending", "paid", "failed", "rejected"].includes(result.status) ||
          !integer(result.userID) || !integer(result.amount) ||
          (result.createdAt !== undefined && !integer(result.createdAt, 0))) throw invalidResponse();
      return {
        id,
        status: result.status as BaleTransaction["status"],
        userID: result.userID,
        amount: result.amount,
        ...(result.createdAt === undefined ? {} : { createdAt: result.createdAt as number }),
      };
    },
  };
}

export type BaleApi = ReturnType<typeof baleApi>;
