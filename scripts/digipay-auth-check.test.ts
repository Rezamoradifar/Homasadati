// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { ApiError } from "../src/server/http";
import { DigiPayError } from "../src/platform/digipay";

const fixture = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@next/env", () => ({ loadEnvConfig: vi.fn() }));
// Keep the error class identity shared while resetting the executable module.
vi.mock("../src/server/http", async original => await original<typeof import("../src/server/http")>());
vi.mock("../src/platform/digipay", async original => ({
  ...await original<typeof import("../src/platform/digipay")>(), checkDigiPayAuthentication: fixture.check,
}));
const previousExit = process.exitCode;
beforeEach(() => { vi.resetModules(); fixture.check.mockReset(); process.exitCode = 0; });
afterEach(() => { vi.restoreAllMocks(); process.exitCode = previousExit; });

it("prints only safe successful authentication fields", async () => {
  fixture.check.mockResolvedValue({ authenticated: true, environment: "production", expiresInSeconds: 3570,
    access_token: "private-access", password: "private-password", clientSecret: "private-secret" });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./digipay-auth-check");
  await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({ authenticated: true, environment: "production", expiresInSeconds: 3570, purchaseAttempted: false });
  expect(log.mock.calls[0][0]).not.toContain("private-");
  expect(process.exitCode).toBe(0);
});

it("returns a failure exit code and safe provider diagnostics", async () => {
  fixture.check.mockRejectedValue(new DigiPayError("digipay_authentication_failed", undefined, 401, "invalid_client"));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./digipay-auth-check");
  await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({ authenticated: false, errorCode: "digipay_authentication_failed", httpStatus: 401, oauthError: "invalid_client", purchaseAttempted: false });
  expect(process.exitCode).toBe(2);
});

it("reports the numeric DigiPay authentication code without copying a provider message", async () => {
  fixture.check.mockRejectedValue(new DigiPayError("digipay_authentication_failed", 2001, 401));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./digipay-auth-check");
  await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({ authenticated: false, errorCode: "digipay_authentication_failed", httpStatus: 401, providerStatus: 2001, purchaseAttempted: false });
  expect(process.exitCode).toBe(2);
});

it.each([new Error("private-password"), new ApiError(503, "private-secret"), new DigiPayError("digipay_authentication_failed", undefined, 9000, "private-provider-body")])("never prints arbitrary exception contents", async error => {
  fixture.check.mockRejectedValue(error);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./digipay-auth-check");
  await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
  expect(log.mock.calls[0][0]).not.toMatch(/private-|9000|stack/);
  expect(process.exitCode).toBe(2);
});

it("refuses insecure piped prompt input without echoing it", () => {
  const result = spawnSync("python3", ["scripts/digipay-auth-prompt.py"], { input: "private-fixture-password\n", encoding: "utf8" });
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).not.toContain("private-fixture-password");
  expect(result.stderr).toContain("Nothing was saved");
});
