// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { run, one, now, platformDb } from "./schema";
import { session, SESSION_COOKIE } from "./security";
import { handle } from "./api";
import { processOutbox } from "./outbox";
import { outboxFailures, retryOutbox } from "./outbox-admin";
import { saveSetting } from "./providers";
import { validateClient } from "./client-validation";

const dir = mkdtempSync(join(tmpdir(), "homa-outbox-admin-"));
const owner = randomUUID(),
  member = randomUUID(),
  staff = randomUUID();
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "fixture.sqlite");
  process.env.PLATFORM_MASTER_KEY = "f".repeat(64);
  process.env.APP_ORIGIN = "https://homay.test";
  for (const [id, role] of [
    [owner, "superadmin"],
    [member, "user"],
    [staff, "support"],
  ])
    run(
      "INSERT INTO p_users(id,email,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,'Test','unused',?,?,?,?,'test')",
      id,
      id + "@test.example",
      role,
      id,
      now(),
      now(),
    );
});
beforeEach(() => {
  run("DELETE FROM p_outbox_recovery");
  run("DELETE FROM p_outbox");
  run(
    "UPDATE p_users SET email=?,preferences=? WHERE id=?",
    member + "@test.example",
    JSON.stringify({ email: true, sms: false }),
    member,
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
function job(status = "retry", attempts = 8, next = 0) {
  const id = randomUUID();
  run(
    "INSERT INTO p_outbox VALUES(?,?, 'email',?,'private subject','private body',?,?,?,'email_not_configured',?)",
    id,
    member,
    member + "@test.example",
    status,
    attempts,
    next,
    now(),
  );
  return id;
}
const payload = (id: string, attempts = 8) => ({
  id,
  attempts,
  reason: "Provider history checked",
  checkedDelivery: true,
});
function request(who: string, method: string, data?: unknown) {
  return handle(
    new Request("https://homay.test/api/platform/admin/outbox", {
      method,
      headers: {
        origin: "https://homay.test",
        "content-type": "application/json",
        cookie: SESSION_COOKIE + "=" + session(who, "test"),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
    ["admin", "outbox"],
  );
}
it("authorizes only the owner, masks recipients and never exposes message contents", async () => {
  const id = job();
  for (const who of [member, staff]) {
    expect((await request(who, "GET")).status).toBe(403);
    expect((await request(who, "POST", payload(id))).status).toBe(403);
  }
  const result = await request(owner, "GET");
  expect(result.status).toBe(200);
  const text = await result.text();
  expect(text).not.toContain("private body");
  expect(text).not.toContain("private subject");
  expect(text).not.toContain(member + "@test.example");
  expect((await request(owner, "POST", payload(id))).status).toBe(200);
  expect((await request(owner, "POST", payload(id))).status).toBe(409);
  expect(
    one(
      "SELECT COUNT(*) n FROM p_audit WHERE entity_id=? AND action='outbox.retry'",
      id,
    )?.n,
  ).toBe(1);
});
it("grants one attempt at a time, preserves the fencing token and stops after three manual recoveries", async () => {
  const id = job();
  saveSetting("resend_key", "", true);
  saveSetting("email_from", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (let attempt = 8; attempt < 11; attempt++) {
    retryOutbox(owner, payload(id, attempt));
    expect(one("SELECT attempts FROM p_outbox WHERE id=?", id)?.attempts).toBe(
      attempt,
    );
    expect(() => retryOutbox(owner, payload(id, attempt))).toThrow();
    await processOutbox();
    await processOutbox();
    expect(one("SELECT attempts FROM p_outbox WHERE id=?", id)?.attempts).toBe(
      attempt + 1,
    );
  }
  expect(outboxFailures(1).rows[0].canRetry).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("blocks sent, cancelled, automatic retries and active leases; an expired final lease can be recovered", () => {
  for (const [status, attempts, next] of [
    ["sent", 8, 0],
    ["cancelled", 8, 0],
    ["retry", 7, 0],
    ["sending", 8, Date.now() + 60000],
  ] as const) {
    expect(() =>
      retryOutbox(owner, payload(job(status, attempts, next))),
    ).toThrow();
  }
  expect(
    retryOutbox(owner, payload(job("sending", 8, Date.now() - 1))),
  ).toEqual({ ok: true });
});
it("rechecks current recipient and consent instead of redirecting private history", () => {
  const id = job();
  run("UPDATE p_users SET email='changed@test.example' WHERE id=?", member);
  expect(() => retryOutbox(owner, payload(id))).toThrow();
  run(
    "UPDATE p_users SET email=?,preferences='{}' WHERE id=?",
    member + "@test.example",
    member,
  );
  expect(() => retryOutbox(owner, payload(id))).toThrow();
  expect(outboxFailures(1).rows[0].canRetry).toBe(false);
});
it("requires explicit delivery review and validates purpose-specific SMS settings in the client", async () => {
  const id = job();
  expect(
    (await request(owner, "POST", { ...payload(id), checkedDelivery: false }))
      .status,
  ).toBe(400);
  expect(() =>
    validateClient("admin/outbox", "POST", {
      ...payload(id),
      checkedDelivery: false,
    }),
  ).toThrow();
  expect(() =>
    validateClient("admin/settings", "POST", {
      key: "sms_template_contact",
      value: "approved-contact",
      reason: "Approved contact template",
    }),
  ).not.toThrow();
});
