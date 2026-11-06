/** Server-side DigiPay UPG transport. Keep credentials and verification off clients.
 * Protocol: https://www.mydigipay.com/developers/docs/upg/
 * The official plugin linked there confirms that monetary amounts are IRR.
 * Ticket type 11 selects UPG; purchase types below are a separate namespace.
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { ApiError } from "../server/http";
import { smsReceptor } from "./sms-receptor";

export type DigiPayEnvironment = "sandbox" | "production";
export type DigiPayPurchaseType = 0 | 5 | 11 | 13 | 24;
export type DigiPayCreditType = 5 | 13;

export interface DigiPayBasketItem {
  sellerId: string;
  supplierId: string;
  productCode: string;
  brand: string;
  productType: 1 | 2 | 3 | 4;
  count: number;
  categoryId: string;
}

export interface DigiPayConfiguration {
  environment: DigiPayEnvironment;
  origin: string;
}

interface PrivateConfiguration extends DigiPayConfiguration {
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
}

export interface DigiPayTicketInput {
  providerId: string;
  amountRial: number;
  cellNumber: string;
  callbackUrl: string;
  basketId: string;
  items: DigiPayBasketItem[];
}

export interface DigiPayPurchase {
  providerId: string;
  trackingCode: string;
  type: DigiPayPurchaseType;
  amountRial: number;
}

export interface DigiPayRefundInput {
  /** A persisted, unique refund identifier, different from the purchase ID. */
  providerId: string;
  saleTrackingCode: string;
  amountRial: number;
  type: DigiPayPurchaseType;
}

export interface DigiPayRefundInquiry {
  providerId: string;
  trackingCode: string;
  outcome: "succeeded" | "failed" | "pending";
  resultCode?: number;
}

/** Carries only a numeric provider code, never its raw body or credentials. */
export class DigiPayError extends ApiError {
  constructor(
    code: string,
    public readonly providerStatus?: number,
    public readonly httpStatus?: number,
    public readonly oauthError?: string,
  ) {
    super(503, code);
    this.name = "DigiPayError";
  }
}

const API_BASES: Record<DigiPayEnvironment, string> = {
  sandbox: "https://uat.mydigipay.info/digipay/api",
  production: "https://api.mydigipay.com/digipay/api",
};
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const PURCHASE_TYPES = new Set<number>([0, 5, 11, 13, 24]);
const OAUTH_ERRORS = new Set([
  "invalid_grant", "unauthorized_client", "invalid_client",
  "unsupported_grant_type", "invalid_request", "access_denied",
]);

function configuration(): PrivateConfiguration {
  const environment = process.env.DIGIPAY_ENVIRONMENT;
  if (environment !== "sandbox" && environment !== "production")
    throw new ApiError(503, "digipay_not_configured");
  // A sandbox approval must never reach production order/commission accounting.
  if (environment === "sandbox" && process.env.NODE_ENV === "production")
    throw new ApiError(503, "digipay_sandbox_forbidden");
  let origin: URL;
  try {
    origin = new URL(process.env.APP_ORIGIN || "");
  } catch {
    throw new ApiError(503, "digipay_not_configured");
  }
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.search || origin.hash || origin.pathname !== "/")
    throw new ApiError(503, "digipay_not_configured");
  const credentials = {
    username: process.env.DIGIPAY_USERNAME || "",
    password: process.env.DIGIPAY_PASSWORD || "",
    clientId: process.env.DIGIPAY_CLIENT_ID || "",
    clientSecret: process.env.DIGIPAY_CLIENT_SECRET || "",
  };
  if (Object.values(credentials).some((value) => !value.trim() || value.length > 4096) ||
      credentials.clientId.includes(":"))
    throw new ApiError(503, "digipay_not_configured");
  return { environment, origin: origin.origin, ...credentials };
}

/** Safe configuration summary; secrets are intentionally not exported. */
export function digipayConfig(): DigiPayConfiguration {
  const { environment, origin } = configuration();
  return { environment, origin };
}

export function digipayEnabled(): boolean {
  if (process.env.DIGIPAY_ENABLED !== "1") return false;
  try {
    configuration();
    return true;
  } catch {
    return false;
  }
}

function textField(value: unknown, max = 256, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > max ||
      (!allowEmpty && !value.trim()) || /[\u0000-\u001f\u007f]/.test(value))
    throw new ApiError(400, "invalid_input");
  return value;
}

function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new ApiError(400, "invalid_input");
  return value;
}

function purchaseType(value: unknown): DigiPayPurchaseType {
  if (typeof value !== "number" || !PURCHASE_TYPES.has(value))
    throw new ApiError(400, "invalid_input");
  return value as DigiPayPurchaseType;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function responseAmount(value: unknown): number | undefined {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed > 0
    ? parsed : undefined;
}

function responseIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

interface HttpResult { status: number; data: unknown }

async function request(url: string, init: RequestInit): Promise<HttpResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new DigiPayError("digipay_invalid_response");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    let data: unknown;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      // Refresh authentication once even if a proxy returns a non-JSON 401.
      if (response.status === 401) data = undefined;
      else throw new DigiPayError("digipay_invalid_response");
    }
    return { status: response.status, data };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new DigiPayError(controller.signal.aborted ? "digipay_timeout" : "digipay_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

interface CachedToken {
  key: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}
let tokenCache: CachedToken | undefined;
let tokenFlight: { key: string; promise: Promise<CachedToken> } | undefined;

function credentialKey(config: PrivateConfiguration): string {
  return createHash("sha256").update(JSON.stringify([
    config.environment, config.username, config.password, config.clientId, config.clientSecret,
  ])).digest("hex");
}

async function authenticate(config: PrivateConfiguration, refreshToken?: string): Promise<CachedToken> {
  const body = new FormData();
  if (refreshToken) {
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refreshToken);
  } else {
    body.set("grant_type", "password");
    body.set("username", config.username);
    body.set("password", config.password);
  }
  const response = await request(`${API_BASES[config.environment]}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      Accept: "application/json",
    },
    body,
  });
  const data = record(response.data);
  if (response.status !== 200) {
    const oauthError = typeof data?.error === "string" && OAUTH_ERRORS.has(data.error)
      ? data.error : undefined;
    throw new DigiPayError("digipay_authentication_failed", undefined, response.status, oauthError);
  }
  if (!data || typeof data.access_token !== "string" || !data.access_token ||
      data.access_token.length > 16384 || /\s/.test(data.access_token) ||
      typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer" ||
      typeof data.expires_in !== "number" || !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0)
    throw new DigiPayError("digipay_invalid_response");
  const ttl = Math.min(data.expires_in, 86400) * 1000;
  return {
    key: credentialKey(config),
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" && data.refresh_token.length <= 16384
      ? data.refresh_token : undefined,
    // Renew before expiry; the provider's expires_in remains authoritative.
    expiresAt: Date.now() + ttl - Math.min(30_000, Math.floor(ttl / 10)),
  };
}

/** An explicit operator diagnostic. Always performs fresh authentication, does
 * not enable checkout or call a purchase endpoint, and never returns a token. */
export async function checkDigiPayAuthentication() {
  const config = configuration();
  const token = await authenticate(config);
  return {
    authenticated: true as const,
    environment: config.environment,
    expiresInSeconds: Math.max(0, Math.floor((token.expiresAt - Date.now()) / 1000)),
  };
}

async function accessToken(config: PrivateConfiguration, rejectedToken?: string): Promise<string> {
  const key = credentialKey(config);
  if (tokenCache?.key === key && tokenCache.expiresAt > Date.now() &&
      (!rejectedToken || tokenCache.accessToken !== rejectedToken))
    return tokenCache.accessToken;
  if (tokenFlight?.key === key) return (await tokenFlight.promise).accessToken;
  const refreshToken = tokenCache?.key === key ? tokenCache.refreshToken : undefined;
  const promise = (async () => {
    let next: CachedToken;
    try {
      next = await authenticate(config, refreshToken);
    } catch (error) {
      if (!refreshToken || !(error instanceof ApiError) || error.code !== "digipay_authentication_failed")
        throw error;
      next = await authenticate(config);
    }
    tokenCache = next;
    return next;
  })();
  const flight = { key, promise };
  tokenFlight = flight;
  try {
    return (await promise).accessToken;
  } finally {
    if (tokenFlight === flight) tokenFlight = undefined;
  }
}

async function businessRequest(config: PrivateConfiguration, path: string, body?: Record<string, unknown>) {
  let token = await accessToken(config);
  const send = () => request(`${API_BASES[config.environment]}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json",
      Agent: "WEB",
      "Digipay-Version": "2022-02-02",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let response = await send();
  if (response.status === 401) {
    token = await accessToken(config, token);
    response = await send();
  }
  const data = record(response.data);
  const status = record(data?.result)?.status;
  if (response.status !== 200 || status !== 0) {
    const safeStatus = typeof status === "number" && Number.isSafeInteger(status) ? status : undefined;
    throw new DigiPayError(response.status === 401 ? "digipay_authentication_failed" : "digipay_provider_rejected", safeStatus);
  }
  return data!;
}

function safeRedirect(value: unknown, environment: DigiPayEnvironment): string {
  if (typeof value !== "string" || value.length > 4096)
    throw new DigiPayError("digipay_invalid_redirect");
  let url: URL;
  try { url = new URL(value); } catch { throw new DigiPayError("digipay_invalid_redirect"); }
  // Production is confined to DigiPay's own DNS namespace. UAT has distinct
  // documented API/web hosts, so a staging URL cannot escape into production.
  const trustedHost = environment === "production"
    ? url.hostname === "mydigipay.com" || url.hostname.endsWith(".mydigipay.com")
    : ["uatweb.mydigipay.info", "uat.mydigipay.info"].includes(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !trustedHost)
    throw new DigiPayError("digipay_invalid_redirect");
  return url.href;
}

export async function createDigiPayTicket(input: DigiPayTicketInput): Promise<{ ticket: string; redirectUrl: string }> {
  if (process.env.DIGIPAY_ENABLED !== "1") throw new ApiError(503, "digipay_not_configured");
  const config = configuration();
  const providerId = textField(input.providerId);
  const amountRial = amount(input.amountRial);
  const cellNumber = smsReceptor(textField(input.cellNumber, 32));
  if (!/^09\d{9}$/.test(cellNumber)) throw new ApiError(400, "invalid_input");
  let callback: URL;
  try { callback = new URL(input.callbackUrl); } catch { throw new ApiError(400, "invalid_input"); }
  if (callback.protocol !== "https:" || callback.origin !== config.origin ||
      callback.username || callback.password || callback.hash)
    throw new ApiError(400, "invalid_input");
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 1000)
    throw new ApiError(400, "invalid_input");
  const items = input.items.map((item) => {
    if (!item || ![1, 2, 3, 4].includes(item.productType) ||
        !Number.isSafeInteger(item.count) || item.count <= 0)
      throw new ApiError(400, "invalid_input");
    return {
      sellerId: textField(item.sellerId),
      supplierId: textField(item.supplierId),
      productCode: textField(item.productCode),
      brand: textField(item.brand, 256, true),
      productType: item.productType,
      count: item.count,
      categoryId: textField(item.categoryId),
    };
  });
  const data = await businessRequest(config, "/tickets/business?type=11", {
    providerId,
    amount: amountRial,
    cellNumber,
    callbackUrl: callback.href,
    basketDetailsDto: { basketId: textField(input.basketId), items },
    // Do not invent a preferredGateway for CREDIT/BNPL: UPG/merchant permissions
    // determine availability; only wallet/IPG preferences are documented.
  });
  if (!responseIdentifier(data.ticket)) throw new DigiPayError("digipay_invalid_response");
  return { ticket: data.ticket, redirectUrl: safeRedirect(data.redirectUrl, config.environment) };
}

export async function verifyDigiPayPurchase(input: DigiPayPurchase): Promise<DigiPayPurchase> {
  const config = configuration();
  const providerId = textField(input.providerId);
  const trackingCode = textField(input.trackingCode);
  const type = purchaseType(input.type);
  const amountRial = amount(input.amountRial);
  const data = await businessRequest(config, `/purchases/verify?type=${type}`, { trackingCode, providerId });
  if (data.providerId !== providerId || data.trackingCode !== trackingCode || responseAmount(data.amount) !== amountRial)
    throw new ApiError(409, "digipay_payment_mismatch");
  return { providerId, trackingCode, type, amountRial };
}

/** Call after actual fulfillment, never just because payment was verified. */
export async function deliverDigiPayPurchase(input: {
  trackingCode: string;
  type: DigiPayCreditType;
  deliveryDate: number;
  invoiceNumber: string;
  products: string[];
}): Promise<void> {
  const config = configuration();
  if (![5, 13].includes(input.type) || !Number.isSafeInteger(input.deliveryDate) || input.deliveryDate <= 0 ||
      !Array.isArray(input.products) || !input.products.length || input.products.length > 1000)
    throw new ApiError(400, "invalid_input");
  await businessRequest(config, `/purchases/deliver?type=${input.type}`, {
    trackingCode: textField(input.trackingCode),
    deliveryDate: input.deliveryDate,
    invoiceNumber: textField(input.invoiceNumber),
    products: input.products.map((product) => textField(product)),
  });
}

/** Request acceptance is NOT confirmation that the refund was completed.
 * Persist the providerId before calling; reconcile ambiguous responses by that
 * same ID rather than minting another refund and risking a duplicate transfer.
 */
export async function refundDigiPayPurchase(input: DigiPayRefundInput): Promise<DigiPayPurchase> {
  const config = configuration();
  const providerId = textField(input.providerId);
  const saleTrackingCode = textField(input.saleTrackingCode);
  const type = purchaseType(input.type);
  const amountRial = amount(input.amountRial);
  const data = await businessRequest(config, `/refunds?type=${type}`, { providerId, saleTrackingCode, amount: amountRial });
  if (!responseIdentifier(data.trackingCode)) throw new DigiPayError("digipay_invalid_response");
  return { providerId, trackingCode: data.trackingCode, type, amountRial };
}

/** The documented inquiry response omits amount. The caller must retain the
 * immutable refund request associated with providerId and the purchase.
 */
export async function inquireDigiPayRefund(input: {
  providerId: string;
  trackingCode?: string;
  type: DigiPayPurchaseType;
}): Promise<DigiPayRefundInquiry> {
  const config = configuration();
  const providerId = textField(input.providerId);
  const type = purchaseType(input.type);
  const trackingCode = input.trackingCode === undefined ? undefined : textField(input.trackingCode);
  const data = await businessRequest(config, `/refunds/${encodeURIComponent(trackingCode ?? providerId)}?type=${type}`);
  if (data.providerId !== providerId || !responseIdentifier(data.trackingCode) ||
      (trackingCode !== undefined && data.trackingCode !== trackingCode))
    throw new ApiError(409, "digipay_refund_mismatch");
  if (data.status !== 0 && data.status !== 1 && data.status !== 2)
    throw new DigiPayError("digipay_refund_unconfirmed");
  return {
    providerId,
    trackingCode: data.trackingCode,
    outcome: data.status === 0 ? "succeeded" : data.status === 1 ? "failed" : "pending",
    ...(typeof data.resultCode === "number" && Number.isSafeInteger(data.resultCode) ? { resultCode: data.resultCode } : {}),
  };
}
