// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { POST as subscribe } from "../../app/api/newsletter/route";
import { POST as oneClick } from "../../app/api/unsubscribe/one-click/route";
import { platformDb, run, one, now } from "./schema";
import { saveSetting } from "./providers";
import { createCampaign, newsletterOverview, processNewsletter, sendCampaign } from "./newsletter";

const directory = mkdtempSync(join(tmpdir(), "homay-news-"));
const sent: Record<string, any>[] = [];
const req = (path: string, data?: unknown) =>
  new Request("http://localhost" + path, {
    method: "POST",
    headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "news.sqlite");
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
  platformDb();
  saveSetting("resend_key", "re_test", true);
  saveSetting("email_from", "news@homanets.com");
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});

it("welcomes a new subscriber, honours one-click unsubscribe and skips them in campaigns", async () => {
  const a = await (await subscribe(req("/api/newsletter", { email: "a@example.com", locale: "fa", consent: true }))).json();
  await subscribe(req("/api/newsletter", { email: "b@example.com", locale: "fa", consent: true }));
  await processNewsletter();
  expect(sent.map((m) => m.to[0]).sort()).toEqual(["a@example.com", "b@example.com"]);
  const welcome = sent.find((m) => m.to[0] === "a@example.com")!;
  // The emailed link carries the same private token the browser was given.
  expect(welcome.html).toContain("/unsubscribe?token=" + a.unsubscribeToken);
  expect(welcome.headers["List-Unsubscribe"]).toContain("/api/unsubscribe/one-click?token=" + a.unsubscribeToken);

  const r = await oneClick(new Request("http://localhost/api/unsubscribe/one-click?token=" + a.unsubscribeToken, { method: "POST" }));
  expect(r.status).toBe(200);

  const admin = randomUUID();
  run("INSERT INTO p_users(id,name,password,referral_code,created_at,last_seen,signup_ip,email) VALUES(?,?,?,?,?,?,?,?)", admin, "Admin", "x", "adm" + admin.slice(0, 5), now(), now(), "t", "admin@example.com");
  const { id } = createCampaign(admin, { subject: "تازه‌های پاییز", body: "محصولات تازهٔ صنایع‌دستی رسید و سفرهای پاییزی آغاز شد." });
  expect(sendCampaign(admin, id).queued).toBe(1);
  sent.length = 0;
  await processNewsletter();
  expect(sent.map((m) => m.to[0])).toEqual(["b@example.com"]);
  expect(newsletterOverview()).toMatchObject({ active: 1, unsubscribed: 1 });
  expect(one("SELECT status FROM p_newsletter_campaigns WHERE id=?", id)!.status).toBe("sent");
  expect(() => sendCampaign(admin, id)).toThrow(); // a sent campaign is never sent twice
});
