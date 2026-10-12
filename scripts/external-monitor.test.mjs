// @vitest-environment node
import { it, expect, vi } from "vitest";
import { probe, shouldAlert, main } from "./external-monitor.mjs";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
it("checks public homepage and health without cookies or raw response contents", async () => {
  const request = vi.fn(async (url) =>
    String(url).endsWith("/api/health")
      ? Response.json({ status: "ok" })
      : new Response("<html>Private test text</html>", {
          headers: { "content-type": "text/html" },
        }),
  );
  const report = await probe("https://homanets.com", request);
  expect(report.status).toBe("ok");
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(report)).not.toContain("Private test text");
  expect(request.mock.calls[0][1].redirect).toBe("error");
});
it("detects invalid health replies and network outages, and rejects credentialed origins", async () => {
  expect(
    (
      await probe("https://homanets.com", async () =>
        Response.json({ status: "unavailable" }),
      )
    ).status,
  ).toBe("unavailable");
  expect(
    (
      await probe("https://homanets.com", async () => {
        throw Error("private failure");
      })
    ).checks.every((c) => !c.ok),
  ).toBe(true);
  await expect(probe("https://user:secret@homanets.com")).rejects.toThrow();
});
it("retries failed alerts, limits repeated outage alerts and signals recovery only after a delivered outage", () => {
  const at = 5000000;
  expect(
    shouldAlert(
      { status: "unavailable", lastAlert: at },
      { status: "unavailable" },
      at,
    ),
  ).toBe(true);
  expect(
    shouldAlert(
      { alertStatus: "unavailable", lastAlert: at },
      { status: "unavailable" },
      at + 1000,
    ),
  ).toBe(false);
  expect(
    shouldAlert(
      { alertStatus: "unavailable", lastAlert: at },
      { status: "unavailable" },
      at + 3600000,
    ),
  ).toBe(true);
  expect(
    shouldAlert({ alertStatus: "unavailable" }, { status: "ok" }, at),
  ).toBe(true);
  expect(shouldAlert(undefined, { status: "ok" }, at)).toBe(false);
});
it.each(["missing", "failed-recovery"])(
  "reports %s notification delivery as a failed run",
  async (scenario) => {
    const root = mkdtempSync(join(tmpdir(), "homay-external-alert-"));
    const file = join(root, "state.json"),
      argv = process.argv,
      exitCode = process.exitCode;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      process.argv = [process.execPath, "external-monitor.mjs", "--notify"];
      process.exitCode = undefined;
      vi.stubEnv("MONITOR_STATE_PATH", file);
      vi.stubEnv("MONITOR_ORIGIN", "https://fixture.invalid");
      vi.stubEnv(
        "ALERT_WEBHOOK_URL",
        scenario === "missing" ? "" : "https://alerts.invalid",
      );
      if (scenario === "failed-recovery")
        writeFileSync(
          file,
          JSON.stringify({ alertStatus: "unavailable", lastAlert: 123 }),
        );
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).startsWith("https://alerts.invalid")
            ? new Response("failed", { status: 503 })
            : String(url).endsWith("/api/health")
              ? Response.json({ status: "ok" })
              : new Response("<html></html>", {
                  headers: { "content-type": "text/html" },
                }),
        ),
      );
      await main();
      expect(process.exitCode).toBe(1);
      if (scenario === "failed-recovery")
        expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
          alertStatus: "unavailable",
          lastAlert: 123,
        });
    } finally {
      process.argv = argv;
      process.exitCode = exitCode;
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      log.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
