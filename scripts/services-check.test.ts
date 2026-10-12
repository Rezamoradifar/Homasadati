// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  close: vi.fn(),
}));
vi.mock("@next/env", () => ({ loadEnvConfig: vi.fn() }));
vi.mock("../src/platform/providers", () => ({ setting: (key: string) => fixture.settings[key] }));
vi.mock("../src/platform/schema", () => ({
  platformDb: () => ({ close: fixture.close }),
  all: (sql: string) => {
    expect(sql).toBe("SELECT channel,status,COUNT(*) AS count FROM p_outbox GROUP BY channel,status");
    return [{ channel: "sms", status: "retry", count: 2 }];
  },
}));
beforeEach(() => { vi.resetModules(); fixture.settings = {}; fixture.close.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("does not confuse OTP configuration with notification delivery readiness or send a message", async () => {
  fixture.settings = { kavenegar_key: "private-fixture-key", sms_template: "ExistingOTP" };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.method || "GET").toBe("GET");
    expect(url).not.toMatch(/lookup|send|addtemplate/);
    return Response.json({ return: { status: 200 }, entries: url.includes("templatelist") ? [{ name: "ExistingOTP", approvalStatus: 0 }] : {}, metadata: { TotalPages: 1 } });
  });
  vi.stubGlobal("fetch", fetch);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./services-check");
  await vi.waitFor(() => expect(fixture.close).toHaveBeenCalledOnce());
  const result = JSON.parse(log.mock.calls[0][0]);
  expect(result.sms).toMatchObject({ configured: true, templateApproval: 0, liveSmsTest: "not_run" });
  expect(result.notifications).toEqual({ smsConfigured: false, emailConfigured: false, queue: [{ channel: "sms", status: "retry", count: 2 }], liveDeliveryTest: "not_run" });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(log.mock.calls[0][0]).not.toContain("private-fixture-key");
});

it("reports configured notification channels without claiming successful delivery", async () => {
  fixture.settings = { resend_key: "private-email-key", email_from: "private-sender@example.test" };
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./services-check");
  await vi.waitFor(() => expect(fixture.close).toHaveBeenCalledOnce());
  const result = JSON.parse(log.mock.calls[0][0]);
  expect(result.notifications).toMatchObject({ emailConfigured: true, smsConfigured: false, liveDeliveryTest: "not_run" });
  expect(fetch).not.toHaveBeenCalled();
  expect(log.mock.calls[0][0]).not.toMatch(/private-email-key|private-sender/);
});
