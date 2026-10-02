import { ApiError } from "../server/http";

/**
 * BalePay provider adapter.
 *
 * Everything Bale-specific lives here, behind two calls: create a payment and
 * verify it server-to-server. The rest of the payment flow (bale-payments.ts)
 * only sees the typed results below, never a raw provider payload.
 *
 * No official BalePay documentation has been supplied to this project yet, so
 * the HTTP layer is deliberately NOT implemented: every place that needs an
 * official value is marked "TODO: BALEPAY OFFICIAL VALUE REQUIRED". Until those
 * are filled in from the official docs, `balePayEnabled()` is false, the
 * checkout option is shown as unavailable and no request is ever sent.
 * Nothing here guesses an endpoint, parameter, header or status value.
 */

export type BaleCreateInput = {
  /** Our payment attempt id (UUID); unique per attempt. */
  paymentId: string;
  /** Amount in rial, computed on the server from the stored checkout. */
  amountRial: number;
  /** Absolute HTTPS callback URL on homanets.com, carrying our payment id. */
  callbackUrl: string;
  description: string;
};

export type BaleCreateResult = {
  /** The provider's identifier for this payment (token/reference). */
  providerReference: string;
  /** Where the customer is sent to pay. Must be an https URL on a Bale host. */
  redirectUrl: string;
};

export type BaleVerifyInput = {
  paymentId: string;
  providerReference: string;
  amountRial: number;
};

/** The provider's answer, normalised. "unknown" means the status could not be
 * established (timeout, 5xx, unexpected body): the payment stays pending. */
export type BaleVerifyResult =
  | {
      outcome: "paid";
      transactionId: string;
      amountRial: number;
      /** Merchant/account the money went to, when the provider reports it. */
      merchantId?: string;
      /** Our payment id / order reference as echoed by the provider, if any. */
      reference?: string;
    }
  | { outcome: "failed"; code: string }
  | { outcome: "cancelled"; code: string }
  | { outcome: "unknown"; code: string };

/** What the callback request carried, before any verification. These values
 * are identifiers only; none of them is proof of payment. */
export type BaleCallbackParams = {
  providerReference?: string;
  transactionId?: string;
  /** The provider's own status hint (e.g. user cancelled). Never trusted as success. */
  statusHint?: "cancelled" | "other";
};

export interface BalePayClient {
  createPayment(input: BaleCreateInput): Promise<BaleCreateResult>;
  verifyPayment(input: BaleVerifyInput): Promise<BaleVerifyResult>;
  /** Maps the callback's query/form fields to identifiers. */
  parseCallback(fields: URLSearchParams): BaleCallbackParams;
}

/** Server-only configuration. None of these may be NEXT_PUBLIC_*. */
export function balePayConfig() {
  return {
    // TODO: BALEPAY OFFICIAL VALUE REQUIRED — the API base URL from the official docs.
    apiBaseUrl: process.env.BALEPAY_API_BASE_URL || "",
    // TODO: BALEPAY OFFICIAL VALUE REQUIRED — confirm the credential name/type (token, API key…).
    token: process.env.BALEPAY_TOKEN || "",
    // TODO: BALEPAY OFFICIAL VALUE REQUIRED — confirm whether a merchant/terminal id exists.
    merchantId: process.env.BALEPAY_MERCHANT_ID || "",
    // Hosts the customer may be redirected to; set from the official docs.
    // TODO: BALEPAY OFFICIAL VALUE REQUIRED — the payment page host(s).
    redirectHosts: (process.env.BALEPAY_REDIRECT_HOSTS || "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  };
}

/** The official HTTP client. Not implemented until the official BalePay
 * documentation is supplied; each method refuses rather than guessing. */
export const officialBalePayClient: BalePayClient & { implemented: boolean } = {
  implemented: false,
  async createPayment() {
    // TODO: BALEPAY OFFICIAL VALUE REQUIRED — endpoint, method, auth header,
    // request fields (amount unit, callback field, reference field) and the
    // response fields holding the provider reference and payment URL.
    throw new ApiError(503, "payment_not_configured");
  },
  async verifyPayment() {
    // TODO: BALEPAY OFFICIAL VALUE REQUIRED — verify endpoint, request fields,
    // the exact success status value(s), and where amount, merchant, reference
    // and transaction id are returned. Map a timeout or 5xx to
    // { outcome: "unknown" }, never to "failed".
    throw new ApiError(503, "payment_not_configured");
  },
  parseCallback() {
    // TODO: BALEPAY OFFICIAL VALUE REQUIRED — names of the callback fields for
    // the provider reference, transaction id and cancel/failure status.
    return {};
  },
};

let client: BalePayClient = officialBalePayClient;

/** Tests swap in a mock; production always uses the official client. */
export function setBalePayClient(next: BalePayClient | null) {
  if (process.env.NODE_ENV === "production") throw new Error("BalePay client cannot be replaced in production");
  client = next ?? officialBalePayClient;
}
export const balePayClient = () => client;

/** Bale is offered only when the client is implemented and configured. */
export function balePayEnabled() {
  const c = balePayClient();
  if (c === officialBalePayClient) {
    const cfg = balePayConfig();
    return officialBalePayClient.implemented && !!cfg.apiBaseUrl && !!cfg.token && cfg.redirectHosts.length > 0;
  }
  return true;
}

/** Only https URLs on the configured Bale hosts are followed. */
export function safeRedirect(url: string, hosts = balePayConfig().redirectHosts) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiError(503, "provider_rejected");
  }
  if (parsed.protocol !== "https:" || (hosts.length && !hosts.includes(parsed.hostname.toLowerCase())))
    throw new ApiError(503, "provider_rejected");
  return parsed.toString();
}
