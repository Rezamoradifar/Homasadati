import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./schema";
import { saveSetting } from "./providers";
import { currentUsdRate, refreshUsdRate } from "./fx";

const dir = mkdtempSync(join(tmpdir(), "homay-fx-"));
const HOUR = 3600_000;
const T0 = Date.parse("2026-09-01T00:00:00Z");
let calls = 0;
let reply: () => Promise<Response>;
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  process.env.PLATFORM_MASTER_KEY = "c".repeat(64);
  vi.stubGlobal("fetch", vi.fn(async () => { calls++; return reply(); }));
});
afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  run("DELETE FROM p_settings WHERE key LIKE 'fx_%'");
  saveSetting("fx_source_url", "https://rates.test/latest", true);
  saveSetting("fx_source_path", "usd_sell.value");
  saveSetting("fx_source_unit", "toman");
  calls = 0;
});
const ok = (value: string) => async () => Response.json({ usd_sell: { value } });

it("stores the rate, then waits six hours before fetching again", async () => {
  reply = ok("105,000");
  await refreshUsdRate(T0);
  expect(currentUsdRate(T0)?.rialPerUsd).toBe(1_050_000);
  await refreshUsdRate(T0 + HOUR);
  expect(calls).toBe(1);
  await refreshUsdRate(T0 + 7 * HOUR);
  expect(calls).toBe(2);
});

it("backs off for half an hour after a failed fetch", async () => {
  reply = async () => new Response("down", { status: 503 });
  await refreshUsdRate(T0);
  await refreshUsdRate(T0 + 60_000);
  await refreshUsdRate(T0 + 10 * 60_000);
  expect(calls).toBe(1);
  await refreshUsdRate(T0 + 31 * 60_000);
  expect(calls).toBe(2);
  expect(currentUsdRate(T0)).toBeNull();
});

it("rejects a large jump against a fresh rate but accepts it once the old rate is stale", async () => {
  reply = ok("100000");
  await refreshUsdRate(T0);
  reply = ok("200000");
  await refreshUsdRate(T0 + 7 * HOUR);
  expect(currentUsdRate(T0 + 7 * HOUR)?.rialPerUsd).toBe(1_000_000);
  await refreshUsdRate(T0 + 49 * HOUR);
  expect(currentUsdRate(T0 + 49 * HOUR)?.rialPerUsd).toBe(2_000_000);
});
