// @vitest-environment node
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { all, now, one, platformDb, run } from "./schema";
import { saveSetting } from "./providers";
import * as providers from "./providers";
import { processOutbox } from "./outbox";

const dir = mkdtempSync(join(tmpdir(), "homay-outbox-"));
const userId = randomUUID();
const email = "member@example.test",
  phone = "+989121234567";
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  process.env.PLATFORM_MASTER_KEY = "d".repeat(64);
  process.env.APP_ORIGIN = "https://homay.test";
  run(
    "INSERT INTO p_users(id,email,phone,name,password,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,'عضو آزمون','unused',?,?,?,'test')",
    userId,
    email,
    phone,
    userId,
    now(),
    now(),
  );
  saveSetting("resend_key", "test-email-key", true);
  saveSetting("email_from", "sender@homay.test");
  saveSetting("kavenegar_key", "test-sms-key", true);
  saveSetting("sms_sender", "test-sender");
});
beforeEach(() => {
  run("DELETE FROM p_outbox");
  run(
    "UPDATE p_users SET email=?,phone=?,preferences=? WHERE id=?",
    email,
    phone,
    JSON.stringify({ email: true, sms: true, inApp: true }),
    userId,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});

function queue(
  channel = "email",
  target = channel === "email" ? email : phone,
) {
  const id = randomUUID();
  run(
    "INSERT INTO p_outbox(id,user_id,channel,target,subject,body,created_at) VALUES(?,?,?,?,?,?,?)",
    id,
    userId,
    channel,
    target,
    "وضعیت سفارش تغییر کرد",
    "shipped",
    now(),
  );
  return id;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const accepted = () =>
  Response.json({ id: "provider-message", return: { status: 200 } });

it.each(["email", "sms"])(
  "cancels queued %s after the contact changes without redirecting private history",
  async (channel) => {
    const id = queue(channel);
    run(
      `UPDATE p_users SET ${channel === "email" ? "email" : "phone"}=? WHERE id=?`,
      channel === "email" ? "new@example.test" : "+989131234567",
      userId,
    );
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    await processOutbox();
    expect(send).not.toHaveBeenCalled();
    expect(
      one("SELECT status,last_error,target FROM p_outbox WHERE id=?", id),
    ).toMatchObject({
      status: "cancelled",
      last_error: "recipient_changed",
      target: channel === "email" ? email : phone,
    });
  },
);

it("rechecks preferences at delivery and rejects unsupported channels", async () => {
  queue("sms");
  queue("push", phone);
  run(
    "UPDATE p_users SET preferences=? WHERE id=?",
    JSON.stringify({ email: true, sms: false, push: true }),
    userId,
  );
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  await processOutbox();
  expect(send).not.toHaveBeenCalled();
  expect(
    all("SELECT status FROM p_outbox").every(
      (row) => row.status === "cancelled",
    ),
  ).toBe(true);
});

it.each(["contact", "consent", "lease"])(
  "rechecks %s after asynchronous email rendering",
  async (change) => {
    const id = queue();
    const originalBrand = providers.emailBrand;
    vi.spyOn(providers, "emailBrand").mockImplementationOnce(async (locale) => {
      const brand = await originalBrand(locale);
      if (change === "contact")
        run("UPDATE p_users SET email='new@example.test' WHERE id=?", userId);
      if (change === "consent")
        run(
          "UPDATE p_users SET preferences=? WHERE id=?",
          JSON.stringify({ email: false, sms: true }),
          userId,
        );
      if (change === "lease")
        run(
          "UPDATE p_outbox SET attempts=attempts+1,status='sent' WHERE id=?",
          id,
        );
      return brand;
    });
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    await processOutbox();
    expect(send).not.toHaveBeenCalled();
    expect(one("SELECT status FROM p_outbox WHERE id=?", id)!.status).toBe(
      change === "lease" ? "sent" : "cancelled",
    );
  },
);

it.each(["sent", "cancelled", "exhausted"])(
  "does not reclaim a stale candidate that became %s",
  async (state) => {
    queue("sms");
    const second = queue("sms");
    const send = vi.fn(async () => {
      // Another worker finishes this candidate after the batch was selected.
      run(
        "UPDATE p_outbox SET status=?,attempts=? WHERE id=?",
        state === "exhausted" ? "retry" : state,
        state === "exhausted" ? 8 : 1,
        second,
      );
      return accepted();
    });
    vi.stubGlobal("fetch", send);
    await processOutbox();
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      one("SELECT status,attempts FROM p_outbox WHERE id=?", second),
    ).toMatchObject({
      status: state === "exhausted" ? "retry" : state,
      attempts: state === "exhausted" ? 8 : 1,
    });
  },
);

it("keeps an active lease exclusive across overlapping workers", async () => {
  const id = queue("sms"),
    started = deferred<void>(),
    reply = deferred<Response>();
  const send = vi.fn(() => {
    started.resolve();
    return reply.promise;
  });
  vi.stubGlobal("fetch", send);
  const first = processOutbox();
  await started.promise;
  await processOutbox();
  expect(send).toHaveBeenCalledTimes(1);
  reply.resolve(accepted());
  await first;
  expect(
    one("SELECT status,attempts FROM p_outbox WHERE id=?", id),
  ).toMatchObject({ status: "sent", attempts: 1 });
});

it.each([true, false])(
  "ignores an expired worker's late result (accepted=%s)",
  async (success) => {
    const id = queue("sms"),
      started = deferred<void>(),
      reply = deferred<Response>();
    let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const send = vi
      .fn()
      .mockImplementationOnce(() => {
        started.resolve();
        return reply.promise;
      })
      .mockResolvedValueOnce(Response.json({ return: { status: 503 } }));
    vi.stubGlobal("fetch", send);
    const first = processOutbox();
    await started.promise;
    clock += 120001;
    await processOutbox();
    const current = one(
      "SELECT status,attempts,next_attempt,last_error FROM p_outbox WHERE id=?",
      id,
    );
    expect(current).toMatchObject({
      status: "retry",
      attempts: 2,
      last_error: "provider_rejected",
    });
    reply.resolve(
      success ? accepted() : Response.json({ return: { status: 503 } }),
    );
    await first;
    expect(
      one(
        "SELECT status,attempts,next_attempt,last_error FROM p_outbox WHERE id=?",
        id,
      ),
    ).toEqual(current);
  },
);

it("backs off failures, retains the email idempotency key and stops after eight attempts", async () => {
  const id = queue();
  let clock = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  const send = vi.fn(async (_url, init) => {
    expect(init.headers["Idempotency-Key"]).toBe(id);
    return Response.json({}, { status: 503 });
  });
  vi.stubGlobal("fetch", send);
  for (let attempt = 1; attempt <= 8; attempt++) {
    await processOutbox();
    const job = one("SELECT * FROM p_outbox WHERE id=?", id)!;
    expect(job).toMatchObject({
      status: "retry",
      attempts: attempt,
      last_error: "provider_rejected",
    });
    expect(job.next_attempt - clock).toBe(60000 * 2 ** (attempt - 1));
    await processOutbox();
    expect(send).toHaveBeenCalledTimes(attempt);
    clock = job.next_attempt;
  }
  await processOutbox();
  expect(send).toHaveBeenCalledTimes(8);
});

it.each([
  ["+989121234567", "09121234567"],
  ["00989121234567", "09121234567"],
  ["09121234567", "09121234567"],
  ["+447700900123", "00447700900123"],
])(
  "sends branded SMS to the provider receptor for %s",
  async (target, receptor) => {
    run("UPDATE p_users SET phone=? WHERE id=?", target, userId);
    queue("sms", target);
    const send = vi.fn(async (_url, init) => {
      const data = new URLSearchParams(init.body);
      expect(data.get("receptor")).toBe(receptor);
      expect(data.get("message")).toContain("سفارش شما ارسال شد");
      expect(data.get("message")).toContain("/account?tab=orders");
      return accepted();
    });
    vi.stubGlobal("fetch", send);
    await processOutbox();
    expect(send).toHaveBeenCalledTimes(1);
  },
);

it("uses the provider default sender without overriding an existing explicit sender", async () => {
  const fetch = vi.fn(async (_url, init) => {
    const body = new URLSearchParams(init.body);
    expect(body.get("sender")).toBe("test-sender");
    return accepted();
  });
  vi.stubGlobal("fetch", fetch);
  const id = queue("sms");
  await processOutbox();
  expect(one("SELECT status FROM p_outbox WHERE id=?",id)!.status).toBe("sent");
  expect(fetch).toHaveBeenCalledOnce();
});
it("omits sender when unset so Kavenegar can use the account default", async () => {
  saveSetting("sms_sender", "");
  try {
    const fetch = vi.fn(async (url, init) => {
      expect(String(url)).toContain("/sms/send.json");
      const body = new URLSearchParams(init.body);
      expect(body.has("sender")).toBe(false);
      expect(body.get("receptor")).toBe("09121234567");
      return accepted();
    });
    vi.stubGlobal("fetch", fetch);
    const id=queue("sms");await processOutbox();
    expect(one("SELECT status FROM p_outbox WHERE id=?",id)!.status).toBe("sent");
    expect(fetch).toHaveBeenCalledOnce();
  } finally { saveSetting("sms_sender", "test-sender"); }
});
it("keeps a rejected default-sender request for retry", async () => {
  saveSetting("sms_sender", "");
  try {
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({return:{status:412}})));
    const id=queue("sms");await processOutbox();
    expect(one("SELECT status,last_error FROM p_outbox WHERE id=?",id)).toMatchObject({status:"retry",last_error:"provider_rejected"});
  } finally { saveSetting("sms_sender", "test-sender"); }
});
