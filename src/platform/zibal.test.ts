// @vitest-environment node
import { afterAll, beforeAll, afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { migrateZibal } from "./migrate-zibal";
import { platformDb } from "./schema";
import {
  saveSetting,
  setting,
  paymentRequest,
  paymentUrl,
  verifyPayment,
} from "./providers";
const dir = mkdtempSync(join(tmpdir(), "homa-zibal-"));
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "db.sqlite");
  process.env.PLATFORM_MASTER_KEY = "c".repeat(64);
  process.env.APP_ORIGIN = "https://homanets.com";
  saveSetting("zibal_merchant", "private-fixture", true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
function mock(...bodies: unknown[]) {
  const f = vi.fn();
  for (const body of bodies)
    f.mockResolvedValueOnce(new Response(JSON.stringify(body)));
  vi.stubGlobal("fetch", f);
  return f;
}
it("requests the exact rial amount, returns the correct URL, and encrypts credentials", async () => {
  const f = mock({ result: 100, trackId: 123456 });
  const authority = await paymentRequest("order-id", 200000, undefined, "zibal");
  expect(authority).toBe("zibal:123456");
  expect(paymentUrl(authority, "zibal")).toBe(
    "https://gateway.zibal.ir/start/123456",
  );
  expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({
    amount: 2000000,
    merchant: "private-fixture",
    orderId: "order-id",
    callbackUrl:
      "https://homanets.com/api/platform/payment/callback?gateway=zibal",
  });
  expect(setting("zibal_merchant")).toBe("private-fixture");
  const r = platformDb()
    .prepare("SELECT value,secret FROM p_settings WHERE key='zibal_merchant'")
    .get() as { value: string; secret: number };
  expect(r.secret).toBe(1);
  expect(r.value).not.toContain("private-fixture");
});
it("rejects an inactive merchant and unsafe track IDs", async () => {
  mock({ result: 103 }, { result: 100, trackId: "9007199254740992" });
  await expect(paymentRequest("o", 5, undefined, "zibal")).rejects.toThrow();
  await expect(paymentRequest("o", 5, undefined, "zibal")).rejects.toThrow();
});
it("settles only a verified payment for the exact stored amount", async () => {
  mock({ result: 100, status: 1, amount: 2000000 });
  await expect(verifyPayment("zibal:123456", 200000, "zibal")).resolves.toBe(
    "zibal:123456",
  );
});
it.each([
  { result: 100, status: 1, amount: 1 },
  { result: 100, status: 2, amount: 2000000 },
  { result: 202, status: 1, amount: 2000000 },
])("rejects failed or mismatched verification %j", async (body) => {
  mock(body);
  await expect(
    verifyPayment("zibal:123456", 200000, "zibal"),
  ).rejects.toThrow();
});
it("reconciles already-verified payments using inquiry and checks status and amount", async () => {
  const f = mock({ result: 201 }, { result: 100, status: 1, amount: 2000000 });
  await expect(verifyPayment("zibal:123456", 200000, "zibal")).resolves.toBe(
    "zibal:123456",
  );
  expect(f.mock.calls[1][0]).toBe("https://gateway.zibal.ir/v1/inquiry");
});
it("fails closed when inquiry says the transaction was not verified", async () => {
  mock({ result: 201 }, { result: 100, status: 2, amount: 2000000 });
  await expect(
    verifyPayment("zibal:123456", 200000, "zibal"),
  ).rejects.toThrow();
});
it("blocks production sandbox credentials and invalid amounts before any request", async () => {
  const f = mock();
  vi.stubEnv("NODE_ENV", "production");
  saveSetting("zibal_merchant", "zibal", true);
  await expect(paymentRequest("o", 5, undefined, "zibal")).rejects.toThrow();
  saveSetting("zibal_merchant", "private-fixture", true);
  await expect(
    paymentRequest("o", Number.MAX_SAFE_INTEGER, undefined, "zibal"),
  ).rejects.toThrow();
  expect(f).not.toHaveBeenCalled();
});
it("preserves old payment rows, indexes, triggers, and child references during migration", () => {
  const d = new Database(":memory:");
  d.pragma("foreign_keys=ON");
  d.exec(
    "CREATE TABLE p_orders(id TEXT PRIMARY KEY,payment_method TEXT CHECK(payment_method IN ('wallet','zarinpal','bank_transfer'))); CREATE INDEX old_method ON p_orders(payment_method); CREATE TRIGGER keep_rows BEFORE DELETE ON p_orders BEGIN SELECT 1; END; CREATE TABLE child(id TEXT REFERENCES p_orders(id)); INSERT INTO p_orders VALUES('existing','bank_transfer'); INSERT INTO child VALUES('existing'); CREATE TABLE p_checkouts(id TEXT PRIMARY KEY,method TEXT CHECK(method IN ('wallet','zarinpal','bank_transfer')));",
  );
  migrateZibal(d);
  migrateZibal(d);
  expect(
    d.prepare("SELECT * FROM p_orders WHERE id='existing'").get(),
  ).toMatchObject({ payment_method: "bank_transfer" });
  d.exec(
    "INSERT INTO p_orders VALUES('new','zibal'); INSERT INTO p_checkouts VALUES('new','zibal');",
  );
  expect(d.pragma("foreign_key_check")).toEqual([]);
  expect(
    d
      .prepare(
        "SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('old_method','keep_rows')",
      )
      .get(),
  ).toEqual({ n: 2 });
  d.close();
});
