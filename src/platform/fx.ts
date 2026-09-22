import { setting, saveSetting } from "./providers";
import { one } from "./schema";
import { recordServiceFailure } from "./readiness";

/** Display-only USD rate. Payments always stay in rial; this value only
 * converts prices for visitors who choose USD in the currency switcher. */
export type UsdRate = { rialPerUsd: number; updatedAt: string; source: "auto" | "manual" };

const REFRESH_MS = 6 * 60 * 60 * 1000; // four requests a day fit free API quotas
export const STALE_MS = 48 * 60 * 60 * 1000;
const MIN_RATE = 10_000, MAX_RATE = 100_000_000; // rial per USD sanity bounds

const persianDigits = "۰۱۲۳۴۵۶۷۸۹", arabicDigits = "٠١٢٣٤٥٦٧٨٩";
export function parseAmount(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const latin = value.replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/[,٬،\s]/g, "");
  return /^\d+(\.\d+)?$/.test(latin) ? Number(latin) : NaN;
}

/** Reads a value by a dotted path. A segment may select an array item by
 * index ("data.0.price") or by field ("currency[symbol=USD].price"). */
export function readPath(data: unknown, path: string): unknown {
  let current: unknown = data;
  for (const part of path.split(".").filter(Boolean)) {
    const match = part.match(/^([^[\]]*)(?:\[([^=\]]+)=([^\]]+)\])?$/);
    if (!match || current === null || typeof current !== "object") return undefined;
    const [, key, field, expected] = match;
    if (key) current = (current as Record<string, unknown>)[key];
    if (field) {
      if (!Array.isArray(current)) return undefined;
      current = current.find(
        (item) => item && typeof item === "object" && String((item as Record<string, unknown>)[field]) === expected,
      );
    }
  }
  return current;
}

export function validRate(rialPerUsd: number) {
  return Number.isFinite(rialPerUsd) && rialPerUsd >= MIN_RATE && rialPerUsd <= MAX_RATE;
}

function storedAuto(): UsdRate | undefined {
  try {
    const raw = setting("fx_usd");
    return raw ? (JSON.parse(raw) as UsdRate) : undefined;
  } catch {
    return undefined;
  }
}

/** Fetches the configured rate source at most every six hours. A reading that
 * moves more than half away from the previous one is rejected as a parse error. */
export async function refreshUsdRate(nowMs = Date.now()) {
  const url = setting("fx_source_url"), path = setting("fx_source_path");
  if (!url || !path) return;
  const previous = storedAuto();
  if (previous && nowMs - Date.parse(previous.updatedAt) < REFRESH_MS) return;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!response.ok) throw new Error("fx_rejected");
    const raw = parseAmount(readPath(await response.json(), path));
    const rialPerUsd = Math.round(setting("fx_source_unit") === "toman" ? raw * 10 : raw);
    if (!validRate(rialPerUsd)) throw new Error("fx_invalid");
    if (previous && Math.abs(rialPerUsd - previous.rialPerUsd) / previous.rialPerUsd > 0.5)
      throw new Error("fx_jump");
    saveSetting("fx_usd", JSON.stringify({ rialPerUsd, updatedAt: new Date(nowMs).toISOString(), source: "auto" }));
  } catch (e) {
    recordServiceFailure("worker", e instanceof Error && e.message.startsWith("fx_") ? e.message : "fx_unavailable");
  }
}

/** The fresh automatic rate, else the manual fallback, else nothing (USD hidden). */
export function currentUsdRate(nowMs = Date.now()): UsdRate | null {
  const auto = storedAuto();
  if (auto && validRate(auto.rialPerUsd) && nowMs - Date.parse(auto.updatedAt) < STALE_MS) return auto;
  const manual = parseAmount(setting("fx_usd_manual"));
  if (validRate(manual)) {
    const row = one("SELECT updated_at FROM p_settings WHERE key='fx_usd_manual'");
    return { rialPerUsd: Math.round(manual), updatedAt: row?.updated_at || new Date(nowMs).toISOString(), source: "manual" };
  }
  return null;
}
